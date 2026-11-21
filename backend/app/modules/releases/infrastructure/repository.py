"""Release persistence. Every query takes org_id (NFR-TEN-02)."""

import uuid
from typing import Any

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session

from app.modules.releases.infrastructure.models import Release


def releases_query(org_id: uuid.UUID, *, project_id: uuid.UUID | None, status: str | None) -> Select[Any]:
    """Unreleased first (soonest target date first, no date last), then the released ones, newest first."""
    stmt = select(Release).where(Release.org_id == org_id)
    if project_id:
        stmt = stmt.where(Release.project_id == project_id)
    if status:
        stmt = stmt.where(Release.status == status)
    released = case((Release.status == "released", 1), else_=0)
    return stmt.order_by(released, Release.target_date.asc().nulls_last(), Release.released_at.desc().nulls_last(),
                         func.lower(Release.name), Release.id)


def get_release(db: Session, org_id: uuid.UUID, release_id: uuid.UUID, *, lock: bool = False) -> Release | None:
    stmt = select(Release).where(Release.org_id == org_id, Release.id == release_id)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def name_taken(db: Session, project_id: uuid.UUID, name: str, *, except_id: uuid.UUID | None = None) -> bool:
    stmt = select(func.count()).select_from(Release).where(Release.project_id == project_id, func.lower(Release.name) == name.lower())
    if except_id:
        stmt = stmt.where(Release.id != except_id)
    return db.scalar(stmt) != 0


def get_releases(db: Session, org_id: uuid.UUID, ids: list[uuid.UUID]) -> list[Release]:
    if not ids:
        return []
    return list(db.scalars(select(Release).where(Release.org_id == org_id, Release.id.in_(ids))))
