"""Audit log endpoint API-150 (REQ-012)."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, OrgContext, require
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.audit.application import service
from app.modules.audit.schemas.audit import AuditActorOut, AuditEventOut
from app.modules.auth.application import service as auth

router = APIRouter(tags=["audit"])


@router.get("/orgs/{org_id}/audit-events/actors", response_model=list[AuditActorOut], responses=errors(401, 403, 404))
def list_audit_actors(db: DB, ctx: Annotated[OrgContext, Depends(require("audit.read"))]) -> list[AuditActorOut]:
    """People with at least one event in this workspace, by name, for the actor filter. Removed members stay listed."""
    users = auth.get_users_by_ids(db, service.actor_ids(db, ctx.org_id))
    return sorted((AuditActorOut(id=uid, full_name=u.full_name) for uid, u in users.items()),
                  key=lambda a: (a.full_name.lower(), str(a.id)))


@router.get("/orgs/{org_id}/audit-events", response_model=Page[AuditEventOut], responses=errors(401, 403, 404, 422))
def list_audit_events(
    db: DB,
    ctx: Annotated[OrgContext, Depends(require("audit.read"))],
    params: Annotated[PageParams, Depends(page_params)],
    action: Annotated[str | None, Query(max_length=60, description="Exact action, or a prefix such as 'member'")] = None,
    actor_id: uuid.UUID | None = None,
    entity_type: Annotated[str | None, Query(max_length=40)] = None,
    date_from: Annotated[datetime | None, Query(alias="from")] = None,
    date_to: Annotated[datetime | None, Query(alias="to")] = None,
) -> Page[AuditEventOut]:
    rows, total = service.list_events(db, ctx.org_id, params, action=action, actor_id=actor_id,
                                      entity_type=entity_type, date_from=date_from, date_to=date_to)
    targets = {r.id: service.target_user_id(r) for r in rows}
    wanted = {r.actor_id for r in rows if r.actor_id} | {t for t in targets.values() if t}
    names = {uid: u.full_name for uid, u in auth.get_users_by_ids(db, list(wanted)).items()}  # users stay after removal
    items = [AuditEventOut.model_validate(r).model_copy(update={
        "actor_name": names.get(r.actor_id) if r.actor_id else None,
        "target_name": names.get(t) if (t := targets[r.id]) and t != r.actor_id else None,  # an event about oneself names no target
    }) for r in rows]
    return Page(items=items, page=params.page,
                page_size=params.page_size, total=total)
