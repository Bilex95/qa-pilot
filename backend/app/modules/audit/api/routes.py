"""Audit log endpoint API-150 (REQ-012)."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, OrgContext, require
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.audit.application import service
from app.modules.audit.schemas.audit import AuditEventOut

router = APIRouter(tags=["audit"])


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
    return Page(items=[AuditEventOut.model_validate(r) for r in rows], page=params.page,
                page_size=params.page_size, total=total)
