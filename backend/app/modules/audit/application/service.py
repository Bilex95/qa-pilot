"""Public audit contract used by every module. Events are written in the caller's transaction."""

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.pagination import PageParams, paginate
from app.core.request_context import current as request_info
from app.modules.audit.infrastructure.models import AuditEvent

_SECRET_KEYS = {"password", "token", "refresh_token", "access_token", "secret", "password_hash"}


def record(
    db: Session,
    action: str,
    *,
    actor_id: uuid.UUID | None,
    org_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: Any = None,
    data: dict[str, Any] | None = None,
) -> AuditEvent:
    clean = {k: v for k, v in (data or {}).items() if k.lower() not in _SECRET_KEYS}
    event = AuditEvent(
        action=action, actor_id=actor_id, org_id=org_id, entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None, data=clean,
        ip=request_info().client_ip, request_id=request_info().request_id,
    )
    db.add(event)
    return event


def count_recent(db: Session, action: str, *, email: str, minutes: int) -> int:
    since = utcnow() - timedelta(minutes=minutes)
    stmt = select(func.count()).select_from(AuditEvent).where(
        and_(AuditEvent.action == action, AuditEvent.created_at >= since, AuditEvent.data["email"].astext == email)
    )
    return int(db.scalar(stmt) or 0)


def count_recent_by_ip(db: Session, action: str, *, ip: str, minutes: int) -> int:
    """Events of one kind from one client address, for throttling endpoints that have no account to count against."""
    since = utcnow() - timedelta(minutes=minutes)
    stmt = select(func.count()).select_from(AuditEvent).where(
        and_(AuditEvent.action == action, AuditEvent.created_at >= since, AuditEvent.ip == ip))
    return int(db.scalar(stmt) or 0)


def list_events(
    db: Session,
    org_id: uuid.UUID,
    params: PageParams,
    *,
    action: str | None = None,
    actor_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> tuple[list[AuditEvent], int]:
    stmt = select(AuditEvent).where(AuditEvent.org_id == org_id)
    if action:
        stmt = stmt.where(AuditEvent.action == action) if "." in action else stmt.where(
            AuditEvent.action.startswith(action + "."))
    if actor_id:
        stmt = stmt.where(AuditEvent.actor_id == actor_id)
    if entity_type:
        stmt = stmt.where(AuditEvent.entity_type == entity_type)
    if date_from:
        stmt = stmt.where(AuditEvent.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditEvent.created_at <= date_to)
    return paginate(db, stmt.order_by(AuditEvent.created_at.desc(), AuditEvent.id), params)
