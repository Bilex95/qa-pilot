"""Bugs: API-060 to API-064 and saved views API-078 to API-080 (I-03); workflow and board API-065 to API-068 (I-04);
comments, attachments and activity API-069 to API-077 (I-05)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, Response

from app.core.deps import DB, OrgContext, require
from app.core.errors import AppError, Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.permissions import Role
from app.core.schemas import errors
from app.modules.bugs.application import detail, hooks, integration, reporting, service
from app.modules.bugs.domain import workflow
from app.modules.bugs.domain.filters import BugFilters
from app.modules.bugs.domain.rules import SORT_FIELDS, STATUSES, Priority, Severity, Status
from app.modules.bugs.infrastructure.models import Attachment, Bug, Comment
from app.modules.bugs.schemas.bugs import BugCreateIn, BugOut, BugSummaryOut, BugUpdateIn, SourceRunOut
from app.modules.bugs.schemas.detail import ActivityOut, AttachmentOut, CommentIn, CommentOut
from app.modules.bugs.schemas.views import SavedViewIn, SavedViewOut
from app.modules.bugs.schemas.workflow import (
    BoardColumnOut,
    BoardOut,
    TransitionIn,
    TransitionsOut,
    WorkflowOut,
    WorkflowTransitionOut,
)

integration.register()

router = APIRouter(tags=["bugs"])
ERR = errors(401, 403, 404, 422)
Read = Annotated[OrgContext, Depends(require("bug.read"))]


def _actor(ctx: OrgContext) -> service.Actor:
    return service.Actor(user_id=ctx.user.id, role=ctx.role)


_summary_fields = service.summary_fields  # moved to the service so other modules can list bugs the same way (I-15)


def _detail(db: DB, ctx: OrgContext, bug: Bug) -> BugOut:
    bc = service.context_for(db, ctx.org_id, [bug])
    comments, files = service.detail_counts(db, bug.id)
    found = hooks.source_run(db, ctx.org_id, bug.source_run_result_id) if bug.source_run_result_id else None
    source = SourceRunOut(run_id=found.run_id, run_key=found.run_key, run_name=found.run_name,
                          case_key=found.case_key) if found else None
    release_name = hooks.names_of_releases(db, ctx.org_id, [bug.release_id]).get(bug.release_id) if bug.release_id else None
    return BugOut(**_summary_fields(bug, bc), description=bug.description, steps_to_reproduce=bug.steps_to_reproduce,
                  source_run=source, release_name=release_name, expected_result=bug.expected_result, actual_result=bug.actual_result,
                  source_run_result_id=bug.source_run_result_id, ai_assisted=bug.ai_assisted,
                  status_changed_at=bug.status_changed_at, resolved_at=bug.resolved_at, closed_at=bug.closed_at,
                  comment_count=comments, attachment_count=files)


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


BOARD_PER_COLUMN = 50


@router.get("/orgs/{org_id}/bugs/board", response_model=BoardOut, responses=ERR)  # before /bugs/{bug_ref}
def get_board(
    db: DB, ctx: Read,
    project_id: uuid.UUID | None = None,
    assignee_id: uuid.UUID | None = None,
    severity: Annotated[list[Severity] | None, Query(description="Repeat the parameter for several values")] = None,
    q: Annotated[str | None, Query(max_length=200, description="Case insensitive match on key, title and description")] = None,
) -> BoardOut:
    filters = BugFilters(project_id=project_id, assignee_id=assignee_id, severity=list(severity or []), q=q)
    counts, rows = service.board(db, ctx.org_id, filters, BOARD_PER_COLUMN)
    bc = service.context_for(db, ctx.org_id, rows)
    by_status: dict[str, list[BugSummaryOut]] = {s: [] for s in STATUSES}
    for bug in rows:
        by_status[bug.status].append(BugSummaryOut(**_summary_fields(bug, bc)))
    return BoardOut(columns=[BoardColumnOut(status=s, total=counts.get(s, 0), items=by_status[s]) for s in STATUSES])


@router.get("/orgs/{org_id}/bug-workflow", response_model=WorkflowOut, responses=errors(401, 403, 404))
def get_workflow(ctx: Read) -> WorkflowOut:
    """The nine statuses and every move with the roles that may make it. A Developer's moves also need the record rule."""
    return WorkflowOut(
        statuses=list(STATUSES),  # type: ignore[arg-type]
        transitions=[WorkflowTransitionOut(from_status=t.from_status, to_status=t.to_status,  # type: ignore[arg-type]
                                           roles=sorted(t.roles, key=list(Role).index), meaning=t.meaning)
                     for t in workflow.TRANSITIONS])


@router.get("/orgs/{org_id}/bugs/{bug_id}/transitions", response_model=TransitionsOut, responses=ERR)
def get_transitions(bug_id: uuid.UUID, db: DB, ctx: Read) -> TransitionsOut:
    bug = service.get_bug(db, ctx.org_id, bug_id)
    return TransitionsOut(current=bug.status, allowed=service.allowed_for(_actor(ctx), bug))  # type: ignore[arg-type]


@router.post("/orgs/{org_id}/bugs/{bug_id}/transitions", response_model=BugOut, responses=errors(401, 403, 404, 409, 422))
def transition_bug(bug_id: uuid.UUID, body: TransitionIn, db: DB,
                   ctx: Annotated[OrgContext, Depends(require("bug.transition"))]) -> BugOut:
    return _detail(db, ctx, service.transition_bug(db, ctx.org_id, _actor(ctx), bug_id, body.to_status, body.comment))


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


# Comments, attachments and the timeline (I-05) ------------------------------

def _comment_out(db: DB, rows: list[Comment]) -> list[CommentOut]:
    names = detail.names_of(db, {c.author_id for c in rows})
    return [CommentOut(id=c.id, bug_id=c.bug_id, author_id=c.author_id, author_name=names.get(c.author_id, ""), body=c.body,
                       created_at=c.created_at, edited_at=c.edited_at) for c in rows]


def _attachment_out(db: DB, rows: list[Attachment]) -> list[AttachmentOut]:
    names = detail.names_of(db, {a.uploaded_by_id for a in rows})
    return [AttachmentOut(id=a.id, bug_id=a.bug_id, filename=a.filename, content_type=a.content_type, size_bytes=a.size_bytes,
                          uploaded_by_id=a.uploaded_by_id, uploaded_by_name=names.get(a.uploaded_by_id, ""),
                          created_at=a.created_at) for a in rows]


@router.get("/orgs/{org_id}/bugs/{bug_id}/comments", response_model=Page[CommentOut], responses=ERR)
def list_comments(bug_id: uuid.UUID, db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)]) -> Page[CommentOut]:
    """Newest first."""
    rows, total = detail.list_comments(db, ctx.org_id, bug_id, params)
    return Page(items=_comment_out(db, rows), page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/bugs/{bug_id}/comments", status_code=status.HTTP_201_CREATED, response_model=CommentOut,
             responses=errors(401, 403, 404, 422))
def add_comment(bug_id: uuid.UUID, body: CommentIn, db: DB,
                ctx: Annotated[OrgContext, Depends(require("comment.create"))]) -> CommentOut:
    return _comment_out(db, [detail.add_comment(db, ctx.org_id, _actor(ctx), bug_id, body.body)])[0]


@router.patch("/orgs/{org_id}/comments/{comment_id}", response_model=CommentOut, responses=errors(401, 403, 404, 422))
def edit_comment(comment_id: uuid.UUID, body: CommentIn, db: DB,
                 ctx: Annotated[OrgContext, Depends(require("comment.update"))]) -> CommentOut:
    return _comment_out(db, [detail.edit_comment(db, ctx.org_id, _actor(ctx), comment_id, body.body)])[0]


@router.delete("/orgs/{org_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def delete_comment(comment_id: uuid.UUID, db: DB, ctx: Annotated[OrgContext, Depends(require("comment.delete"))]) -> None:
    detail.delete_comment(db, ctx.org_id, _actor(ctx), comment_id)


@router.get("/orgs/{org_id}/bugs/{bug_id}/attachments", response_model=list[AttachmentOut], responses=ERR)
def list_attachments(bug_id: uuid.UUID, db: DB, ctx: Read) -> list[AttachmentOut]:
    return _attachment_out(db, detail.list_attachments(db, ctx.org_id, bug_id))


@router.post("/orgs/{org_id}/bugs/{bug_id}/attachments", status_code=status.HTTP_201_CREATED, response_model=AttachmentOut,
             responses=errors(401, 403, 404, 409, 413, 415, 422))
def upload_attachment(bug_id: uuid.UUID, request: Request, file: UploadFile, db: DB,
                      ctx: Annotated[OrgContext, Depends(require("attachment.upload"))]) -> AttachmentOut:
    """Multipart form with one `file`. At most 10 MB and 10 files per bug; the type is checked by extension and by the first
    bytes (D-009)."""
    limit = detail.max_upload_bytes()
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit + 1024 * 1024:  # the file plus the form overhead
        raise AppError(f"A file can be at most {limit // (1024 * 1024)} MB.", code="file_too_large", status_code=413,
                       details={"max_bytes": limit})
    data = file.file.read(limit + 1)  # one byte more than the limit is enough to know it is too big
    attachment = detail.add_attachment(db, ctx.org_id, _actor(ctx), bug_id, file.filename or "", data)
    return _attachment_out(db, [attachment])[0]


@router.get("/orgs/{org_id}/attachments/{attachment_id}/download", response_model=None,
            responses={**errors(401, 403, 404), 200: {"description": "The file", "content": {"application/octet-stream": {}}}})
def download_attachment(attachment_id: uuid.UUID, db: DB,
                        ctx: Annotated[OrgContext, Depends(require("attachment.download"))]) -> FileResponse:
    """Authenticated and tenant checked. Always `Content-Disposition: attachment` and `nosniff`; never a public path."""
    attachment, path = detail.open_attachment(db, ctx.org_id, attachment_id)
    return FileResponse(path, media_type=attachment.content_type, filename=attachment.filename,
                        content_disposition_type="attachment",
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.delete("/orgs/{org_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def delete_attachment(attachment_id: uuid.UUID, db: DB,
                      ctx: Annotated[OrgContext, Depends(require("attachment.delete"))]) -> None:
    detail.delete_attachment(db, ctx.org_id, _actor(ctx), attachment_id)


@router.get("/orgs/{org_id}/bugs/{bug_id}/activity", response_model=Page[ActivityOut], responses=ERR)
def list_activity(bug_id: uuid.UUID, db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)]) -> Page[ActivityOut]:
    """Every change of the bug, newest first: creation, field changes with the old and new value, status moves, assignments,
    comments and files."""
    rows, total = detail.list_activity(db, ctx.org_id, bug_id, params)
    names = detail.names_of(db, {a.actor_id for a in rows})
    items = [ActivityOut(id=a.id, kind=a.kind, actor_id=a.actor_id, actor_name=names.get(a.actor_id, ""),  # type: ignore[arg-type]
                         field=a.field, old_value=a.old_value, new_value=a.new_value, created_at=a.created_at) for a in rows]
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


# CSV export (API-133, I-09) -------------------------------------------------

@router.get("/orgs/{org_id}/reports/bugs.csv", response_model=None,
            responses={**errors(401, 403, 404, 422), 200: {"description": "The bugs as CSV", "content": {"text/csv": {}}}})
def export_bugs_csv(db: DB, ctx: Annotated[OrgContext, Depends(require("report.export"))],
                    filters: Annotated[BugFilters, Depends(_filters)]) -> Response:
    """The bugs the list filters select (the same query parameters as API-060), at most 50,000 rows. A cell that starts with =, +, -, @ is
    prefixed with a quote so a spreadsheet shows it as text. Built before the response starts, so the database session is still open."""
    body = "".join(reporting.csv_rows(db, ctx.org_id, filters))
    return Response(body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="bugs.csv"', "Cache-Control": "private, no-store"})


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
