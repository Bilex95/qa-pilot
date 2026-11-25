"""Releases, links and readiness (I-08; REQ-035, REQ-036, REQ-037; D-014, D-015, D-063).

Readiness is computed on every read from the bugs and runs linked to the release; nothing about it is stored. The bugs and testing
modules are asked through their public service functions."""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate
from app.modules.audit.application import service as audit
from app.modules.auth.application import service as auth
from app.modules.bugs.application import service as bugs
from app.modules.bugs.infrastructure.models import Bug
from app.modules.projects.application import hooks as projects_hooks
from app.modules.projects.application import service as projects
from app.modules.releases.domain.readiness import Inputs, Verdict, evaluate
from app.modules.releases.domain.rules import can_move
from app.modules.releases.infrastructure import repository as repo
from app.modules.releases.infrastructure.models import Release
from app.modules.releases.schemas.releases import ReleaseIn, ReleaseUpdateIn
from app.modules.testing.application import runs as testing
from app.modules.testing.infrastructure.models import TestRun

SEVERITIES = ("critical", "high", "medium", "low")


@dataclass(frozen=True)
class Evaluation:
    """Everything readiness looked at, and what it concluded."""

    verdict: Verdict
    open_by_severity: dict[str, int]
    open_total: int
    linked_bugs: int
    pass_rate: int | None
    linked_runs: int
    runs_in_progress: int


def _invalid(field: str, message: str) -> Unprocessable:
    return Unprocessable("Some fields are not valid.", details=[{"loc": ["body", field], "msg": message}])


def _taken(name: str) -> Conflict:
    return Conflict(f"A release named {name} already exists in this project.", code="name_taken")


# Reads ----------------------------------------------------------------------

def get_release(db: Session, org_id: uuid.UUID, release_id: uuid.UUID) -> Release:
    release = repo.get_release(db, org_id, release_id)
    if release is None:
        raise NotFound("Release not found.")
    return release


def evaluate_many(db: Session, org_id: uuid.UUID, releases: list[Release]) -> dict[uuid.UUID, Evaluation]:
    ids = [r.id for r in releases]
    bug_stats = bugs.release_bug_stats(db, org_id, ids)
    run_stats = testing.release_run_stats(db, org_id, ids)
    out: dict[uuid.UUID, Evaluation] = {}
    for rid in ids:
        b, r = bug_stats[rid], run_stats[rid]
        by = {s: b.open_by_severity.get(s, 0) for s in SEVERITIES}
        verdict = evaluate(Inputs(open_critical=by["critical"], open_high=by["high"], open_total=b.open_total, linked_bugs=b.linked,
                                  pass_rate=r.pass_rate, linked_runs=r.linked, runs_in_progress=r.in_progress, runs_completed=r.completed))
        out[rid] = Evaluation(verdict=verdict, open_by_severity=by, open_total=b.open_total, linked_bugs=b.linked, pass_rate=r.pass_rate,
                              linked_runs=r.linked, runs_in_progress=r.in_progress)
    return out


def list_releases(db: Session, org_id: uuid.UUID, params: PageParams, *, project_id: uuid.UUID | None,
                  status: str | None) -> tuple[list[Release], int]:
    return paginate(db, repo.releases_query(org_id, project_id=project_id, status=status), params)


def unreleased_readiness(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, limit: int = 8) -> list[tuple[Release, Evaluation]]:
    """Public contract for the dashboard: the releases that are not released yet (soonest target first) with their readiness."""
    stmt = repo.releases_query(org_id, project_id=project_id, status=None).where(Release.status != "released").limit(limit)
    rows = list(db.scalars(stmt))
    evals = evaluate_many(db, org_id, rows)
    return [(r, evals[r.id]) for r in rows]


def next_releases(db: Session, org_id: uuid.UUID, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, projects_hooks.NextRelease]:
    """Public contract for the projects list: the soonest release of each project that is not released yet, with its readiness."""
    out: dict[uuid.UUID, projects_hooks.NextRelease] = {}
    for project_id in project_ids:
        found = unreleased_readiness(db, org_id, project_id, limit=1)
        if found:
            release, evaluation = found[0]
            out[project_id] = projects_hooks.NextRelease(id=release.id, name=release.name, readiness=evaluation.verdict.status)
    return out


def names_of(db: Session, org_id: uuid.UUID, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    """Public contract: the names of the releases that exist (bugs and runs show them)."""
    return {r.id: r.name for r in repo.get_releases(db, org_id, ids)}


def exists_in_project(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, release_id: uuid.UUID) -> bool:
    """Public contract: the release exists in the workspace and belongs to the project (bugs and runs may only point at those)."""
    release = repo.get_release(db, org_id, release_id)
    return release is not None and release.project_id == project_id


def linked_bugs(db: Session, org_id: uuid.UUID, release_id: uuid.UUID) -> tuple[list[Bug], bugs.BugContext]:
    rows = bugs.bugs_of_release(db, org_id, release_id)
    return rows, bugs.context_for(db, org_id, rows)


def linked_runs(db: Session, org_id: uuid.UUID, release_id: uuid.UUID) -> list[TestRun]:
    return testing.runs_of_release(db, org_id, release_id)


def person_name(db: Session, user_id: uuid.UUID | None) -> str | None:
    if user_id is None:
        return None
    user = auth.get_users_by_ids(db, [user_id]).get(user_id)
    return user.full_name if user else None


# Create and change ----------------------------------------------------------

def create_release(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, body: ReleaseIn) -> Release:
    try:
        project = projects.get_project(db, org_id, body.project_id)
    except NotFound:
        raise _invalid("project_id", "This project does not exist in this workspace.") from None
    if project.archived_at is not None:
        raise _invalid("project_id", "This project is archived and takes no new releases.")
    if repo.name_taken(db, project.id, body.name):
        raise _taken(body.name)
    release = Release(org_id=org_id, project_id=project.id, name=body.name, description=body.description, target_date=body.target_date)
    db.add(release)
    try:
        db.flush()  # the unique index catches a race past the check above
    except IntegrityError as exc:
        db.rollback()
        raise _taken(body.name) from exc
    audit.record(db, "release.created", actor_id=actor_id, org_id=org_id, entity_type="release", entity_id=release.id,
                 data={"name": release.name, "project_id": str(project.id)})
    db.commit()
    return release


def update_release(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, release_id: uuid.UUID, body: ReleaseUpdateIn) -> Release:
    release = repo.get_release(db, org_id, release_id, lock=True)
    if release is None:
        raise NotFound("Release not found.")
    sent = body.model_dump(exclude_unset=True)
    if sent.get("ai_summary") is not None or sent.get("ai_usage_id") is not None:
        raise _invalid("ai_summary", "The AI release summary arrives with a later release of QA Pilot.")
    diff: dict[str, Any] = {}
    if "name" in sent and sent["name"] != release.name:
        if sent["name"].lower() != release.name.lower() and repo.name_taken(db, release.project_id, sent["name"], except_id=release.id):
            raise _taken(sent["name"])
        diff["name"] = {"from": release.name, "to": sent["name"]}
        release.name = sent["name"]
    if "description" in sent and sent["description"] != release.description:
        diff["description"] = {"changed": True}
        release.description = sent["description"]
    if "target_date" in sent and sent["target_date"] != release.target_date:
        diff["target_date"] = {"from": release.target_date.isoformat() if release.target_date else None,
                               "to": sent["target_date"].isoformat() if sent["target_date"] else None}
        release.target_date = sent["target_date"]
    moved: dict[str, Any] | None = None
    if "status" in sent and sent["status"] != release.status:
        if not can_move(release.status, sent["status"]):
            raise _invalid("status", f"A release cannot go from {release.status} back to {sent['status']}.")
        verdict = evaluate_many(db, org_id, [release])[release.id].verdict  # the readiness at this moment goes into the audit event
        moved = {"from": release.status, "to": sent["status"], "readiness": verdict.status, "reasons": verdict.reasons}
        release.status = sent["status"]
        if sent["status"] == "released":
            release.released_at = utcnow()
    if diff or moved:
        release.updated_at = utcnow()
    if diff:
        audit.record(db, "release.updated", actor_id=actor_id, org_id=org_id, entity_type="release", entity_id=release.id,
                     data={"name": release.name, "changes": diff})
    if moved:
        audit.record(db, "release.status_changed", actor_id=actor_id, org_id=org_id, entity_type="release", entity_id=release.id,
                     data={"name": release.name, **moved})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _taken(release.name) from exc
    return release


def delete_release(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, release_id: uuid.UUID) -> None:
    release = repo.get_release(db, org_id, release_id, lock=True)
    if release is None:
        raise NotFound("Release not found.")
    if release.status == "released":
        raise Conflict(f"{release.name} is released and cannot be deleted.", code="released", details={"name": release.name})
    stats = evaluate_many(db, org_id, [release])[release.id]
    audit.record(db, "release.deleted", actor_id=actor_id, org_id=org_id, entity_type="release", entity_id=release.id,
                 data={"name": release.name, "unlinked_bugs": stats.linked_bugs, "unlinked_runs": stats.linked_runs})
    db.delete(release)  # the foreign keys on bugs and test runs are ON DELETE SET NULL: they are unlinked in the same statement
    db.commit()


# Links ----------------------------------------------------------------------

def link_bugs(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, release_id: uuid.UUID, bug_ids: list[uuid.UUID]) -> int:
    release = get_release(db, org_id, release_id)
    changed = bugs.link_bugs_to_release(db, org_id, actor_id, release_id=release.id, release_name=release.name,
                                        project_id=release.project_id, bug_ids=bug_ids)
    db.commit()
    return changed


def unlink_bug(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, release_id: uuid.UUID, bug_id: uuid.UUID) -> None:
    release = get_release(db, org_id, release_id)
    bugs.unlink_bug_from_release(db, org_id, actor_id, release_id=release.id, release_name=release.name, bug_id=bug_id)
    db.commit()


def link_runs(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, release_id: uuid.UUID, run_ids: list[uuid.UUID]) -> int:
    release = get_release(db, org_id, release_id)
    changed = testing.link_runs_to_release(db, org_id, actor_id, release_id=release.id, project_id=release.project_id, run_ids=run_ids)
    db.commit()
    return changed


def unlink_run(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, release_id: uuid.UUID, run_id: uuid.UUID) -> None:
    release = get_release(db, org_id, release_id)
    testing.unlink_run_from_release(db, org_id, actor_id, release_id=release.id, run_id=run_id)
    db.commit()
