"""Bugs: API-060 to API-064 and saved views API-078 to API-080 (I-03)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import DB, OrgContext, require
from app.core.errors import Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.bugs.application import integration, service
from app.modules.bugs.domain.filters import BugFilters
from app.modules.bugs.domain.rules import SORT_FIELDS, Priority, Severity, Status
from app.modules.bugs.infrastructure.models import Bug
from app.modules.bugs.schemas.bugs import BugCreateIn, BugOut, BugSummaryOut, BugUpdateIn, LabelRef
from app.modules.bugs.schemas.views import SavedViewIn, SavedViewOut

integration.register()

router = APIRouter(tags=["bugs"])
ERR = errors(401, 403, 404, 422)
Read = Annotated[OrgContext, Depends(require("bug.read"))]


def _actor(ctx: OrgContext) -> service.Actor:
    return service.Actor(user_id=ctx.user.id, role=ctx.role)


def _summary_fields(bug: Bug, bc: service.BugContext) -> dict[str, object]:
    return {
        "id": bug.id, "key": bug.key, "number": bug.number, "project_id": bug.project_id, "title": bug.title,
        "status": bug.status, "severity": bug.severity, "priority": bug.priority, "component_id": bug.component_id,
        "environment_id": bug.environment_id, "reporter_id": bug.reporter_id,
        "reporter_name": bc.names.get(bug.reporter_id, ""), "assignee_id": bug.assignee_id,
        "assignee_name": bc.names.get(bug.assignee_id) if bug.assignee_id else None, "release_id": bug.release_id,
        "labels": [LabelRef.model_validate(x) for x in bc.labels.get(bug.id, [])], "sla_breached": bc.sla(bug),
        "created_at": bug.created_at, "updated_at": bug.updated_at,
    }


def _detail(db: DB, ctx: OrgContext, bug: Bug) -> BugOut:
    bc = service.context_for(db, ctx.org_id, [bug])
    return BugOut(**_summary_fields(bug, bc), description=bug.description, steps_to_reproduce=bug.steps_to_reproduce,
                  expected_result=bug.expected_result, actual_result=bug.actual_result,
                  source_run_result_id=bug.source_run_result_id, ai_assisted=bug.ai_assisted,
                  status_changed_at=bug.status_changed_at, resolved_at=bug.resolved_at, closed_at=bug.closed_at)


def _filters(
    project_id: uuid.UUID | None = None,
    status: Annotated[list[Status] | None, Query(description="Repeat the parameter for several values")] = None,
    severity: Annotated[list[Severity] | None, Query()] = None,
    priority: Annotated[list[Priority] | None, Query()] = None,
    assignee_id: uuid.UUID | None = None,
    unassigned: Annotated[bool | None, Query(description="true: only bugs nobody is assigned to. Not with assignee_id")] = None,
    reporter_id: uuid.UUID | None = None,
    component_id: uuid.UUID | None = None,
    environment_id: uuid.UUID | None = None,
    label_id: uuid.UUID | None = None,
    release_id: uuid.UUID | None = None,
    sla_breached: bool | None = None,
    open: Annotated[bool | None, Query(description="true: only open bugs; false: only Verified, Closed and Won't fix")] = None,
    q: Annotated[str | None, Query(max_length=200, description="Case insensitive match on key, title and description")] = None,
    sort: Annotated[str, Query(pattern=rf"^-?({'|'.join(SORT_FIELDS)})$",
                               description="updated_at, created_at, severity or priority; prefix - for descending")] = "-updated_at",
) -> BugFilters:
    if assignee_id is not None and unassigned is True:
        raise Unprocessable("Some fields are not valid.", details=[{
            "loc": ["query", "unassigned"], "msg": "Send either assignee_id or unassigned=true, not both."}])
    return BugFilters(project_id=project_id, status=list(status or []), severity=list(severity or []),
                      priority=list(priority or []), assignee_id=assignee_id, unassigned=unassigned, reporter_id=reporter_id,
                      component_id=component_id, environment_id=environment_id, label_id=label_id,
                      release_id=release_id, sla_breached=sla_breached, open=open, q=q, sort=sort)


@router.get("/orgs/{org_id}/bugs", response_model=Page[BugSummaryOut], responses=ERR)
def list_bugs(db: DB, ctx: Read, filters: Annotated[BugFilters, Depends(_filters)],
              params: Annotated[PageParams, Depends(page_params)]) -> Page[BugSummaryOut]:
    rows, total = service.list_bugs(db, ctx.org_id, filters, params)
    bc = service.context_for(db, ctx.org_id, rows)
    items = [BugSummaryOut(**_summary_fields(b, bc)) for b in rows]
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/bugs", status_code=status.HTTP_201_CREATED, response_model=BugOut,
             responses=errors(401, 403, 404, 422))
def create_bug(body: BugCreateIn, db: DB, ctx: Annotated[OrgContext, Depends(require("bug.create"))]) -> BugOut:
    return _detail(db, ctx, service.create_bug(db, ctx.org_id, _actor(ctx), body))


@router.get("/orgs/{org_id}/bugs/{bug_ref}", response_model=BugOut, responses=ERR)
def get_bug(bug_ref: str, db: DB, ctx: Read) -> BugOut:
    return _detail(db, ctx, service.get_bug_by_ref(db, ctx.org_id, bug_ref))


@router.patch("/orgs/{org_id}/bugs/{bug_id}", response_model=BugOut, responses=ERR)
def update_bug(bug_id: uuid.UUID, body: BugUpdateIn, db: DB, ctx: Read) -> BugOut:
    # Field level permissions (update_fields, set_severity_priority, assign) are checked in the service, all before any change
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])
    return _detail(db, ctx, service.update_bug(db, ctx.org_id, _actor(ctx), bug_id, changes))


@router.delete("/orgs/{org_id}/bugs/{bug_id}", status_code=status.HTTP_204_NO_CONTENT, responses=errors(401, 403, 404))
def delete_bug(bug_id: uuid.UUID, db: DB, ctx: Annotated[OrgContext, Depends(require("bug.delete"))]) -> None:
    service.delete_bug(db, ctx.org_id, _actor(ctx), bug_id)


# Saved views --------------------------------------------------------------

Views = Annotated[OrgContext, Depends(require("saved_view.manage"))]


@router.get("/orgs/{org_id}/saved-views", response_model=list[SavedViewOut], responses=errors(401, 403, 404))
def list_saved_views(db: DB, ctx: Views) -> list[SavedViewOut]:
    return [SavedViewOut.model_validate(v) for v in service.list_saved_views(db, ctx.org_id, ctx.user.id)]


@router.post("/orgs/{org_id}/saved-views", status_code=status.HTTP_201_CREATED, response_model=SavedViewOut,
             responses=errors(401, 403, 404, 409, 422))
def create_saved_view(body: SavedViewIn, db: DB, ctx: Views) -> SavedViewOut:
    view = service.create_saved_view(db, ctx.org_id, ctx.user.id, name=body.name, filters=body.filters)
    return SavedViewOut.model_validate(view)


@router.delete("/orgs/{org_id}/saved-views/{view_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def delete_saved_view(view_id: uuid.UUID, db: DB, ctx: Views) -> None:
    service.delete_saved_view(db, ctx.org_id, ctx.user.id, view_id)
