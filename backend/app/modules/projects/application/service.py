"""Projects, components and environments (I-01; REQ-013 to REQ-016).

Public contract for other modules: get_project, get_component, get_environment, get_label, get_labels, take_bug_number.
"""

import uuid
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate
from app.modules.audit.application import service as audit
from app.modules.projects.application import hooks
from app.modules.projects.domain.rules import DEFAULT_ENVIRONMENTS, key_problem, normalise_key
from app.modules.projects.infrastructure import repository as repo
from app.modules.projects.infrastructure.models import Component, Environment, Label, Project

# Public contract ----------------------------------------------------------

def get_project(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    project = repo.get_project(db, org_id, project_id)
    if project is None:
        raise NotFound("Project not found.")
    return project


def get_component(db: Session, org_id: uuid.UUID, component_id: uuid.UUID) -> Component:
    component = repo.get_component(db, org_id, component_id)
    if component is None:
        raise NotFound("Component not found.")
    return component


def get_environment(db: Session, org_id: uuid.UUID, environment_id: uuid.UUID) -> Environment:
    environment = repo.get_environment(db, org_id, environment_id)
    if environment is None:
        raise NotFound("Environment not found.")
    return environment


def take_bug_number(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> tuple[str, int]:
    """(project key, new bug number). Holds the project row lock until the caller commits (see the repository)."""
    taken = repo.take_bug_number(db, org_id, project_id)
    if taken is None:
        raise NotFound("Project not found.")
    return taken


def open_bug_counts(db: Session, org_id: uuid.UUID, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    return hooks.count(hooks.open_bugs_by_project, db, org_id, project_ids)


# Labels (I-02; REQ-022) ---------------------------------------------------

def get_label(db: Session, org_id: uuid.UUID, label_id: uuid.UUID) -> Label:
    label = repo.get_label(db, org_id, label_id)
    if label is None:
        raise NotFound("Label not found.")
    return label


def get_labels(db: Session, org_id: uuid.UUID, label_ids: list[uuid.UUID]) -> list[Label]:
    """The labels of this org among the ids; ids that are unknown or belong to another org are simply missing."""
    return repo.labels_by_ids(db, org_id, label_ids)


def list_labels(db: Session, org_id: uuid.UUID) -> list[Label]:
    return repo.labels(db, org_id)


def label_bug_counts(db: Session, org_id: uuid.UUID, label_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    return hooks.count(hooks.label_bug_counts, db, org_id, label_ids)


def _label_taken(name: str) -> Conflict:
    return Conflict(f"A label named {name} already exists.", code="name_taken")


def create_label(db: Session, org_id: uuid.UUID, *, actor_id: uuid.UUID, name: str, color: str) -> Label:
    name = name.strip()  # callers may bypass the schema; trim before the uniqueness check
    if repo.label_name_taken(db, org_id, name):
        raise _label_taken(name)
    label = Label(org_id=org_id, name=name, color=color)
    db.add(label)
    try:
        db.flush()  # the unique index on (org_id, lower(name)) catches a race past the check above
    except IntegrityError as exc:
        db.rollback()
        raise _label_taken(name) from exc
    audit.record(db, "label.created", actor_id=actor_id, org_id=org_id, entity_type="label", entity_id=label.id,
                 data={"name": name, "color": color})
    db.commit()
    return label


def delete_label(db: Session, org_id: uuid.UUID, label_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    label = get_label(db, org_id, label_id)  # 404 for a missing id and for another org's id alike (D-003)
    audit.record(db, "label.deleted", actor_id=actor_id, org_id=org_id, entity_type="label", entity_id=label.id,
                 data={"name": label.name})
    db.delete(label)  # bug_labels rows go with it through the cascading foreign key (I-03)
    db.commit()


# Projects -----------------------------------------------------------------

def list_projects(db: Session, org_id: uuid.UUID, params: PageParams, *, include_archived: bool) -> tuple[list[Project], int]:
    return paginate(db, repo.projects_query(org_id, include_archived=include_archived), params)


def create_project(db: Session, org_id: uuid.UUID, *, actor_id: uuid.UUID, name: str, key: str,
                   description: str) -> Project:
    key = normalise_key(key)
    problem = key_problem(key)
    if problem:
        raise Unprocessable("Project key is not valid.", details=[{"loc": ["body", "key"], "msg": problem}])
    if repo.key_exists(db, org_id, key):
        raise Conflict(f"The key {key} is already used by another project.", code="key_taken")
    project = Project(org_id=org_id, name=name.strip(), key=key, description=description.strip())
    db.add(project)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict(f"The key {key} is already used by another project.", code="key_taken") from exc
    for order, env in enumerate(DEFAULT_ENVIRONMENTS, start=1):
        db.add(Environment(org_id=org_id, project_id=project.id, name=env, sort_order=order))
    audit.record(db, "project.created", actor_id=actor_id, org_id=org_id, entity_type="project", entity_id=project.id,
                 data={"key": key, "name": project.name})
    db.commit()
    return project


def update_project(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, *, actor_id: uuid.UUID,
                   changes: dict[str, Any]) -> Project:
    project = repo.get_project(db, org_id, project_id, lock=True)
    if project is None:
        raise NotFound("Project not found.")
    diff: dict[str, Any] = {}
    for field in ("name", "description"):
        if field in changes and changes[field] is not None:
            value = changes[field].strip()
            if value != getattr(project, field):
                diff[field] = {"from": getattr(project, field), "to": value}
                setattr(project, field, value)
    if "archived" in changes and changes["archived"] is not None:
        archive = bool(changes["archived"])
        if archive and project.archived_at is None:  # archiving twice is a no op
            project.archived_at = utcnow()
            audit.record(db, "project.archived", actor_id=actor_id, org_id=org_id, entity_type="project",
                         entity_id=project.id, data={"key": project.key})
        elif not archive and project.archived_at is not None:
            project.archived_at = None
            diff["archived"] = {"from": True, "to": False}
    if diff:
        audit.record(db, "project.updated", actor_id=actor_id, org_id=org_id, entity_type="project",
                     entity_id=project.id, data=diff)
    db.commit()
    return project


# Components ---------------------------------------------------------------

def list_components(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> list[Component]:
    get_project(db, org_id, project_id)
    return repo.components(db, org_id, project_id)


def component_bug_counts(db: Session, org_id: uuid.UUID, component_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    return hooks.count(hooks.open_bugs_by_component, db, org_id, component_ids)


def _taken(kind: str) -> Conflict:
    return Conflict(f"A {kind} with this name already exists in the project.", code="name_taken")


def create_component(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, *, name: str, description: str) -> Component:
    get_project(db, org_id, project_id)
    name = name.strip()
    if repo.component_name_taken(db, project_id, name):
        raise _taken("component")
    component = Component(org_id=org_id, project_id=project_id, name=name, description=description.strip())
    db.add(component)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _taken("component") from exc
    return component


def update_component(db: Session, org_id: uuid.UUID, component_id: uuid.UUID, *, changes: dict[str, Any]) -> Component:
    component = get_component(db, org_id, component_id)
    if changes.get("name") is not None:
        name = changes["name"].strip()
        if repo.component_name_taken(db, component.project_id, name, except_id=component.id):
            raise _taken("component")
        component.name = name
    if changes.get("description") is not None:
        component.description = changes["description"].strip()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _taken("component") from exc
    return component


def delete_component(db: Session, org_id: uuid.UUID, component_id: uuid.UUID) -> None:
    component = get_component(db, org_id, component_id)
    for hook in hooks.on_component_deleted:  # bugs set their component to none (I-03)
        hook(db, org_id, component.id)
    db.delete(component)
    db.commit()


# Environments -------------------------------------------------------------

def list_environments(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> list[Environment]:
    get_project(db, org_id, project_id)
    return repo.environments(db, org_id, project_id)


def create_environment(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, *, name: str) -> Environment:
    get_project(db, org_id, project_id)
    name = name.strip()
    if repo.environment_name_taken(db, project_id, name):
        raise _taken("environment")
    environment = Environment(org_id=org_id, project_id=project_id, name=name,
                              sort_order=repo.next_environment_order(db, project_id))
    db.add(environment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _taken("environment") from exc
    return environment


def update_environment(db: Session, org_id: uuid.UUID, environment_id: uuid.UUID, *,
                       changes: dict[str, Any]) -> Environment:
    environment = get_environment(db, org_id, environment_id)
    if changes.get("name") is not None:
        name = changes["name"].strip()
        if repo.environment_name_taken(db, environment.project_id, name, except_id=environment.id):
            raise _taken("environment")
        environment.name = name
    if changes.get("sort_order") is not None:
        environment.sort_order = changes["sort_order"]
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _taken("environment") from exc
    return environment


def delete_environment(db: Session, org_id: uuid.UUID, environment_id: uuid.UUID) -> None:
    environment = get_environment(db, org_id, environment_id)
    if any(check(db, org_id, environment.id) for check in hooks.environment_in_use):
        raise Conflict("Test runs use this environment, so it cannot be deleted.", code="in_use")
    db.delete(environment)
    db.commit()
