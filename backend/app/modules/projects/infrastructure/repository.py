"""Project persistence. Every query takes org_id (NFR-TEN-02)."""

import uuid

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.modules.projects.infrastructure.models import Component, Environment, Label, Project


def labels(db: Session, org_id: uuid.UUID) -> list[Label]:
    return list(db.scalars(select(Label).where(Label.org_id == org_id).order_by(func.lower(Label.name), Label.id)))


def get_label(db: Session, org_id: uuid.UUID, label_id: uuid.UUID) -> Label | None:
    return db.scalar(select(Label).where(Label.org_id == org_id, Label.id == label_id))


def label_name_taken(db: Session, org_id: uuid.UUID, name: str) -> bool:
    return db.scalar(select(func.count()).select_from(Label).where(
        Label.org_id == org_id, func.lower(Label.name) == name.lower())) != 0


def projects_query(org_id: uuid.UUID, *, include_archived: bool) -> Select[Project]:
    stmt = select(Project).where(Project.org_id == org_id)
    if not include_archived:
        stmt = stmt.where(Project.archived_at.is_(None))
    return stmt.order_by(Project.archived_at.is_not(None), func.lower(Project.name), Project.id)


def get_project(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, *, lock: bool = False) -> Project | None:
    stmt = select(Project).where(Project.org_id == org_id, Project.id == project_id)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def key_exists(db: Session, org_id: uuid.UUID, key: str) -> bool:
    return db.scalar(select(func.count()).select_from(Project).where(Project.org_id == org_id, Project.key == key)) != 0


def components(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> list[Component]:
    return list(db.scalars(select(Component).where(Component.org_id == org_id, Component.project_id == project_id)
                           .order_by(func.lower(Component.name))))


def get_component(db: Session, org_id: uuid.UUID, component_id: uuid.UUID) -> Component | None:
    return db.scalar(select(Component).where(Component.org_id == org_id, Component.id == component_id))


def component_name_taken(db: Session, project_id: uuid.UUID, name: str, *, except_id: uuid.UUID | None = None) -> bool:
    stmt = select(func.count()).select_from(Component).where(
        Component.project_id == project_id, func.lower(Component.name) == name.lower())
    if except_id:
        stmt = stmt.where(Component.id != except_id)
    return db.scalar(stmt) != 0


def environments(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> list[Environment]:
    return list(db.scalars(select(Environment).where(Environment.org_id == org_id, Environment.project_id == project_id)
                           .order_by(Environment.sort_order, func.lower(Environment.name))))


def get_environment(db: Session, org_id: uuid.UUID, environment_id: uuid.UUID) -> Environment | None:
    return db.scalar(select(Environment).where(Environment.org_id == org_id, Environment.id == environment_id))


def environment_name_taken(db: Session, project_id: uuid.UUID, name: str, *, except_id: uuid.UUID | None = None) -> bool:
    stmt = select(func.count()).select_from(Environment).where(
        Environment.project_id == project_id, func.lower(Environment.name) == name.lower())
    if except_id:
        stmt = stmt.where(Environment.id != except_id)
    return db.scalar(stmt) != 0


def next_environment_order(db: Session, project_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.coalesce(func.max(Environment.sort_order), 0)).where(
        Environment.project_id == project_id)) or 0) + 1
