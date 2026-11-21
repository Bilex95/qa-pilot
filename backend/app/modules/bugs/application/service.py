"""Bugs and saved views (I-03; REQ-017, REQ-018, REQ-020, REQ-021, REQ-026, REQ-027, REQ-029, REQ-041).

Public contract for other modules: `open_clause` (the one definition of an open bug), `get_bug`, `create_bug`.
Status changes are I-04; comments, attachments and activity entries are I-05. This issue writes audit events only.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import Conflict, Forbidden, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate
from app.core.permissions import Role, can
from app.modules.audit.application import service as audit
from app.modules.auth.application import service as auth
from app.modules.bugs.application import hooks
from app.modules.bugs.domain import workflow
from app.modules.bugs.domain.filters import BugFilters
from app.modules.bugs.domain.rules import DEFAULT_PRIORITY, DEFAULT_SEVERITY, sla_breached
from app.modules.bugs.infrastructure import repository as repo
from app.modules.bugs.infrastructure.models import Bug, Comment, SavedView
from app.modules.bugs.schemas.bugs import BugCreateIn
from app.modules.bugs.schemas.views import SavedViewFilters
from app.modules.orgs.application import service as orgs
from app.modules.projects.application import service as projects
from app.modules.projects.infrastructure.models import Label

KEY_RE = re.compile(r"^[A-Za-z]{2,6}-\d{1,9}$")
# Edit rights per group of fields (PERSONAS_AND_ROLES 3.3, D-006, D-032)
FIELD_GROUP = {"title", "description", "steps_to_reproduce", "expected_result", "actual_result", "component_id",
               "environment_id", "label_ids", "release_id"}
SEVERITY_GROUP = {"severity", "priority"}
ASSIGN_GROUP = {"assignee_id"}
LONG_TEXT = {"description", "steps_to_reproduce", "expected_result", "actual_result"}  # not copied into audit data


@dataclass(frozen=True)
class Actor:
    user_id: uuid.UUID
    role: Role

    @property
    def is_developer(self) -> bool:
        return self.role is Role.DEVELOPER


@dataclass(frozen=True)
class BugContext:
    """What the output needs besides the bug rows: label objects and people's names, fetched once per page."""

    labels: dict[uuid.UUID, list[Label]]
    names: dict[uuid.UUID, str]
    now: datetime

    def sla(self, bug: Bug) -> bool:
        return sla_breached(bug.severity, bug.status, bug.created_at, bug.resolved_at, self.now)


# Public contract ----------------------------------------------------------

def open_clause() -> ColumnElement[bool]:
    return repo.open_clause()


def get_bug(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID) -> Bug:
    bug = repo.get_bug(db, org_id, bug_id)
    if bug is None:
        raise NotFound("Bug not found.")
    return bug


def get_bug_by_ref(db: Session, org_id: uuid.UUID, ref: str) -> Bug:
    """`ref` is a UUID or a key like WEB-42. Another org's bug, a soft deleted bug and a malformed ref are all a 404."""
    bug: Bug | None = None
    try:
        bug = repo.get_bug(db, org_id, uuid.UUID(ref))
    except ValueError:
        if KEY_RE.match(ref):
            bug = repo.get_bug_by_key(db, org_id, ref.upper())
    if bug is None:
        raise NotFound("Bug not found.")
    return bug


def context_for(db: Session, org_id: uuid.UUID, bugs: list[Bug]) -> BugContext:
    label_ids = repo.label_ids_by_bug(db, [b.id for b in bugs])
    every_label = list({lid for ids in label_ids.values() for lid in ids})
    by_id = {label.id: label for label in projects.get_labels(db, org_id, every_label)}
    labels = {bug_id: sorted((by_id[i] for i in ids if i in by_id), key=lambda x: x.name.lower())
              for bug_id, ids in label_ids.items()}
    people = {b.reporter_id for b in bugs} | {b.assignee_id for b in bugs if b.assignee_id}
    names = {uid: user.full_name for uid, user in auth.get_users_by_ids(db, list(people)).items()}
    return BugContext(labels=labels, names=names, now=utcnow())


def detail_counts(db: Session, bug_id: uuid.UUID) -> tuple[int, int]:
    """(comments, attachments) of a bug, for the detail output."""
    return repo.detail_counts(db, bug_id)


# Validation of references -------------------------------------------------

def _invalid(field: str, message: str) -> Unprocessable:
    return Unprocessable("Some fields are not valid.", details=[{"loc": ["body", field], "msg": message}])


def _check_refs(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, values: dict[str, Any]) -> None:
    """Component, environment and release must belong to the bug's project, labels and the assignee to the org (422).
    Only the keys present in `values` are checked."""
    if values.get("component_id") is not None:
        try:
            component = projects.get_component(db, org_id, values["component_id"])
        except NotFound:
            component = None
        if component is None or component.project_id != project_id:
            raise _invalid("component_id", "This component does not belong to the bug's project.")
    if values.get("environment_id") is not None:
        try:
            environment = projects.get_environment(db, org_id, values["environment_id"])
        except NotFound:
            environment = None
        if environment is None or environment.project_id != project_id:
            raise _invalid("environment_id", "This environment does not belong to the bug's project.")
    if values.get("label_ids"):
        found = {label.id for label in projects.get_labels(db, org_id, values["label_ids"])}
        if set(values["label_ids"]) - found:
            raise _invalid("label_ids", "One or more labels do not exist in this workspace.")
    if values.get("assignee_id") is not None and orgs.get_active_membership(db, org_id, values["assignee_id"]) is None:
        raise _invalid("assignee_id", "The assignee must be an active member of this workspace.")
    if values.get("release_id") is not None and not hooks.any_accepts(
            hooks.release_exists, db, org_id, project_id, values["release_id"]):
        raise _invalid("release_id", "This release does not exist in the bug's project.")
    if values.get("source_run_result_id") is not None and not hooks.any_accepts(
            hooks.run_result_exists, db, org_id, project_id, values["source_run_result_id"]):
        raise _invalid("source_run_result_id", "This test run result does not exist in the bug's project.")


# Create -------------------------------------------------------------------

def create_bug(db: Session, org_id: uuid.UUID, actor: Actor, body: BugCreateIn) -> Bug:
    if (body.severity is not None or body.priority is not None) and not can(actor.role, "bug.set_severity_priority"):
        raise Forbidden("Your role cannot set severity or priority.",
                        details={"action": "bug.set_severity_priority", "role": actor.role.value})
    if body.assignee_id is not None and actor.is_developer and body.assignee_id != actor.user_id:
        raise Forbidden("Developers can only assign a bug to themselves.",
                        details={"action": "bug.assign", "role": actor.role.value})
    try:
        project = projects.get_project(db, org_id, body.project_id)
    except NotFound:
        raise _invalid("project_id", "This project does not exist in this workspace.") from None
    if project.archived_at is not None:
        raise _invalid("project_id", "This project is archived and takes no new bugs.")
    values = body.model_dump()
    _check_refs(db, org_id, project.id, values)

    key, number = projects.take_bug_number(db, org_id, project.id)  # holds the project row lock until the commit
    bug = Bug(
        org_id=org_id, project_id=project.id, number=number, key=f"{key}-{number}", title=body.title,
        description=body.description, steps_to_reproduce=list(body.steps_to_reproduce),
        expected_result=body.expected_result, actual_result=body.actual_result,
        severity=body.severity or DEFAULT_SEVERITY, priority=body.priority or DEFAULT_PRIORITY,
        component_id=body.component_id, environment_id=body.environment_id, reporter_id=actor.user_id,
        assignee_id=body.assignee_id, release_id=body.release_id, source_run_result_id=body.source_run_result_id,
        ai_assisted=body.ai_assisted, status_changed_at=utcnow(),
    )
    db.add(bug)
    db.flush()
    repo.replace_labels(db, org_id, bug.id, list(dict.fromkeys(body.label_ids)))
    repo.add_activity(db, org_id, bug.id, actor.user_id, "created", at=bug.created_at)
    audit.record(db, "bug.created", actor_id=actor.user_id, org_id=org_id, entity_type="bug", entity_id=bug.id,
                 data={"key": bug.key, "title": bug.title, "severity": bug.severity, "priority": bug.priority})
    db.commit()
    return bug


# Update -------------------------------------------------------------------

def _forbidden(actor: Actor, fields: list[str], why: str) -> Forbidden:
    return Forbidden(why, details={"fields": sorted(fields), "role": actor.role.value})


def _check_update_rights(actor: Actor, bug: Bug, changes: dict[str, Any]) -> None:
    """Every changed field is checked before anything is applied: one forbidden field rejects the whole request."""
    fields = sorted(FIELD_GROUP & changes.keys())
    if fields:
        if not can(actor.role, "bug.update_fields"):
            raise _forbidden(actor, fields, "Your role cannot edit bugs.")
        if actor.is_developer and bug.reporter_id != actor.user_id:
            raise _forbidden(actor, fields, "Developers can only edit bugs they reported.")
    sev = sorted(SEVERITY_GROUP & changes.keys())
    if sev and not can(actor.role, "bug.set_severity_priority"):
        raise _forbidden(actor, sev, "Your role cannot set severity or priority.")
    if "assignee_id" in changes:
        if not can(actor.role, "bug.assign"):
            raise _forbidden(actor, ["assignee_id"], "Your role cannot assign bugs.")
        if actor.is_developer and not (changes["assignee_id"] == actor.user_id and bug.assignee_id is None):
            raise _forbidden(actor, ["assignee_id"], "Developers can only assign an unassigned bug to themselves.")


def _jsonable(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def _name_of(db: Session, org_id: uuid.UUID, field: str, value: Any) -> str | None:
    """How a changed value reads in the timeline: people, components and environments by the name they have now (the entry
    keeps it even after a rename or a delete), everything else as it is. A release is kept as its id until I-08 can name it."""
    if value is None:
        return None
    try:
        if field == "component_id":
            return projects.get_component(db, org_id, value).name
        if field == "environment_id":
            return projects.get_environment(db, org_id, value).name
    except NotFound:
        return None
    if field == "assignee_id":
        user = auth.get_users_by_ids(db, [value]).get(value)
        return user.full_name if user else None
    return str(value)


def _label_names(db: Session, org_id: uuid.UUID, ids: list[uuid.UUID]) -> str | None:
    names = sorted((label.name for label in projects.get_labels(db, org_id, ids)), key=str.lower) if ids else []
    return ", ".join(names) or None


def update_bug(db: Session, org_id: uuid.UUID, actor: Actor, bug_id: uuid.UUID, changes: dict[str, Any]) -> Bug:
    bug = repo.get_bug(db, org_id, bug_id, lock=True)
    if bug is None:
        raise NotFound("Bug not found.")
    _check_update_rights(actor, bug, changes)
    _check_refs(db, org_id, bug.project_id, changes)

    diff: dict[str, Any] = {}
    assigned: dict[str, Any] | None = None
    trail: list[tuple[str, str, str | None, str | None]] = []  # the timeline entries (I-05): kind, field, old, new
    for name, new in changes.items():
        if name == "label_ids":
            current = sorted(repo.label_ids_by_bug(db, [bug.id])[bug.id], key=str)
            wanted = sorted(dict.fromkeys(new), key=str)
            if current != wanted:
                repo.replace_labels(db, org_id, bug.id, wanted)
                diff[name] = {"from": _jsonable(current), "to": _jsonable(wanted)}
                trail.append(("field_changed", "labels", _label_names(db, org_id, current), _label_names(db, org_id, wanted)))
            continue
        old = getattr(bug, name)
        if name == "steps_to_reproduce":
            new = list(new)
        if old == new:
            continue
        setattr(bug, name, new)
        if name == "assignee_id":
            assigned = {"from": _jsonable(old), "to": _jsonable(new)}
            trail.append(("assigned", "assignee", _name_of(db, org_id, name, old), _name_of(db, org_id, name, new)))
        elif name in LONG_TEXT:
            diff[name] = {"changed": True}
            trail.append(("field_changed", name, None, None))
        else:
            diff[name] = {"from": _jsonable(old), "to": _jsonable(new)}
            if name == "release_id":
                trail.append(("linked_release", "release", _name_of(db, org_id, name, old), _name_of(db, org_id, name, new)))
            else:
                shown = {"component_id": "component", "environment_id": "environment"}.get(name, name)
                trail.append(("field_changed", shown, _name_of(db, org_id, name, old), _name_of(db, org_id, name, new)))
    if diff or assigned:
        now = utcnow()
        bug.updated_at = now  # label only edits touch no column of the row itself
        for kind, field, was, now_value in trail:
            repo.add_activity(db, org_id, bug.id, actor.user_id, kind, field=field, old=was, new=now_value, at=now)
        if diff:
            audit.record(db, "bug.updated", actor_id=actor.user_id, org_id=org_id, entity_type="bug", entity_id=bug.id,
                         data={"key": bug.key, "changes": diff})
        if assigned:
            audit.record(db, "bug.assigned", actor_id=actor.user_id, org_id=org_id, entity_type="bug", entity_id=bug.id,
                         data={"key": bug.key, **assigned})
    db.commit()
    return bug


def delete_bug(db: Session, org_id: uuid.UUID, actor: Actor, bug_id: uuid.UUID) -> None:
    bug = repo.get_bug(db, org_id, bug_id, lock=True)  # a bug that is already deleted is a 404 like any missing one
    if bug is None:
        raise NotFound("Bug not found.")
    bug.deleted_at = utcnow()  # the key stays taken: the project counter never goes back (D-016, D-008)
    audit.record(db, "bug.deleted", actor_id=actor.user_id, org_id=org_id, entity_type="bug", entity_id=bug.id,
                 data={"key": bug.key})
    db.commit()


# Workflow (I-04, D-005, D-006, D-058) -------------------------------------

def allowed_for(actor: Actor, bug: Bug) -> list[str]:
    """The statuses this person may move this bug to: the moves of their role in the table, and for a Developer only on a bug
    assigned to them or to nobody."""
    return workflow.allowed_targets(bug.status, actor.role, assignee_is_me=bug.assignee_id == actor.user_id,
                                    unassigned=bug.assignee_id is None)


def transition_bug(db: Session, org_id: uuid.UUID, actor: Actor, bug_id: uuid.UUID, to_status: str,
                   comment: str | None) -> Bug:
    bug = repo.get_bug(db, org_id, bug_id, lock=True)  # the row lock makes two moves of one bug happen one after the other
    if bug is None:
        raise NotFound("Bug not found.")
    allowed = allowed_for(actor, bug)
    if workflow.find(bug.status, to_status) is None:
        raise Conflict(f"A bug cannot move from {bug.status} to {to_status}.", code="invalid_transition",
                       details={"from": bug.status, "to": to_status, "allowed": allowed})
    if to_status not in allowed:
        why = ("Only the assignee can move this bug." if actor.is_developer and bug.assignee_id not in (None, actor.user_id)
               else "Your role cannot make this move.")
        raise Forbidden(why, details={"action": "bug.transition", "role": actor.role.value, "from": bug.status,
                                      "to": to_status})
    now = utcnow()
    came_from = bug.status
    bug.status = to_status
    bug.status_changed_at = now
    bug.updated_at = now
    for column, value in workflow.effects_of(to_status, now).items():
        setattr(bug, column, value)
    assigned = None
    if to_status == "in_progress" and bug.assignee_id is None and actor.is_developer:
        bug.assignee_id = actor.user_id  # starting work on an unassigned bug takes it (D-006)
        assigned = {"from": None, "to": str(actor.user_id)}
    data: dict[str, Any] = {"key": bug.key, "from": came_from, "to": to_status}
    comment = comment.strip() if comment else None
    if comment:
        data["comment"] = comment
    repo.add_activity(db, org_id, bug.id, actor.user_id, "status_changed", field="status", old=came_from, new=to_status, at=now)
    if assigned:
        repo.add_activity(db, org_id, bug.id, actor.user_id, "assigned", field="assignee", old=None,
                          new=_name_of(db, org_id, "assignee_id", actor.user_id), at=now)
    if comment:  # the reason given for the move is a real comment now that the table exists (D-059)
        db.add(Comment(org_id=org_id, bug_id=bug.id, author_id=actor.user_id, body=comment))
        repo.add_activity(db, org_id, bug.id, actor.user_id, "commented", at=now)
    audit.record(db, "bug.status_changed", actor_id=actor.user_id, org_id=org_id, entity_type="bug", entity_id=bug.id,
                 data=data)
    if assigned:
        audit.record(db, "bug.assigned", actor_id=actor.user_id, org_id=org_id, entity_type="bug", entity_id=bug.id,
                     data={"key": bug.key, **assigned})
    db.commit()
    return bug


def board(db: Session, org_id: uuid.UUID, filters: BugFilters, per_column: int = 50) -> tuple[dict[str, int], list[Bug]]:
    """(count per status, the first `per_column` bugs of every status). The filters are the board's: project, assignee,
    severity and search; the status filter does not apply (the columns are the statuses)."""
    return repo.board_rows(db, org_id, filters, utcnow(), per_column)


# List ---------------------------------------------------------------------

def list_bugs(db: Session, org_id: uuid.UUID, filters: BugFilters, params: PageParams) -> tuple[list[Bug], int]:
    return paginate(db, repo.bugs_query(org_id, filters, utcnow()), params)


# Saved views --------------------------------------------------------------

def list_saved_views(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> list[SavedView]:
    return repo.saved_views(db, org_id, user_id)


def create_saved_view(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, *, name: str,
                      filters: SavedViewFilters) -> SavedView:
    name = name.strip()
    taken = Conflict(f"You already have a view named {name}.", code="name_taken")
    if repo.saved_view_name_taken(db, org_id, user_id, name):
        raise taken
    view = SavedView(org_id=org_id, user_id=user_id, name=name, filters=filters.model_dump(mode="json"))
    db.add(view)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise taken from exc
    return view


def delete_saved_view(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, view_id: uuid.UUID) -> None:
    view = repo.get_saved_view(db, org_id, user_id, view_id)  # someone else's view is a 404, never a 403
    if view is None:
        raise NotFound("Saved view not found.")
    db.delete(view)
    db.commit()
