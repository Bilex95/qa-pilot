"""Releases: API-110 to API-119 (I-08)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import DB, OrgContext, require
from app.core.errors import Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.releases.application import integration, service
from app.modules.releases.domain.rules import ReleaseStatus
from app.modules.releases.infrastructure.models import Release
from app.modules.releases.schemas.releases import (
    LinkBugsIn,
    LinkedBugOut,
    LinkedOut,
    LinkRunsIn,
    OpenBySeverity,
    ReadinessMetrics,
    ReadinessOut,
    ReleaseIn,
    ReleaseOut,
    ReleaseSummaryOut,
    ReleaseUpdateIn,
)
from app.modules.testing.application import runs as testing

integration.register()

router = APIRouter(tags=["releases"])
ERR = errors(401, 403, 404, 422)
Read = Annotated[OrgContext, Depends(require("release.read"))]
Manage = Annotated[OrgContext, Depends(require("release.manage"))]


def _summaries(db: Session, ctx: OrgContext, rows: list[Release]) -> list[ReleaseSummaryOut]:
    evals = service.evaluate_many(db, ctx.org_id, rows)
    return [ReleaseSummaryOut(
        id=r.id, name=r.name, project_id=r.project_id, description=r.description, status=r.status,  # type: ignore[arg-type]
        target_date=r.target_date, released_at=r.released_at, readiness=evals[r.id].verdict.status,
        reasons=evals[r.id].verdict.reasons, open_bug_count=evals[r.id].open_total, linked_bug_count=evals[r.id].linked_bugs,
        linked_run_count=evals[r.id].linked_runs, pass_rate=evals[r.id].pass_rate, created_at=r.created_at) for r in rows]


def _metrics(db: Session, ctx: OrgContext, release: Release) -> ReadinessMetrics:
    ev = service.evaluate_many(db, ctx.org_id, [release])[release.id]
    return ReadinessMetrics(open_by_severity=OpenBySeverity(**ev.open_by_severity), pass_rate=ev.pass_rate,
                            runs_in_progress=ev.runs_in_progress, linked_runs=ev.linked_runs)


def _detail(db: Session, ctx: OrgContext, release: Release) -> ReleaseOut:
    summary = _summaries(db, ctx, [release])[0]
    rows, bc = service.linked_bugs(db, ctx.org_id, release.id)
    bug_items = [LinkedBugOut(
        id=b.id, key=b.key, title=b.title, status=b.status, severity=b.severity, priority=b.priority,  # type: ignore[arg-type]
        assignee_id=b.assignee_id, assignee_name=bc.names.get(b.assignee_id) if b.assignee_id else None,
        sla_breached=bc.sla(b), updated_at=b.updated_at) for b in rows]
    runs = testing.summaries(db, ctx.org_id, service.linked_runs(db, ctx.org_id, release.id))
    return ReleaseOut(**summary.model_dump(), metrics=_metrics(db, ctx, release), bugs=bug_items, runs=runs,
                      ai_summary=release.ai_summary, ai_summary_at=release.ai_summary_at,
                      ai_summary_by_name=service.person_name(db, release.ai_summary_by_id))


@router.get("/orgs/{org_id}/releases", response_model=Page[ReleaseSummaryOut], responses=ERR)
def list_releases(db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)], project_id: uuid.UUID | None = None,
                  status: ReleaseStatus | None = None) -> Page[ReleaseSummaryOut]:
    rows, total = service.list_releases(db, ctx.org_id, params, project_id=project_id, status=status)
    return Page(items=_summaries(db, ctx, rows), page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/releases", status_code=status.HTTP_201_CREATED, response_model=ReleaseOut,
             responses=errors(401, 403, 404, 409, 422))
def create_release(body: ReleaseIn, db: DB, ctx: Manage) -> ReleaseOut:
    return _detail(db, ctx, service.create_release(db, ctx.org_id, ctx.user.id, body))


@router.get("/orgs/{org_id}/releases/{release_id}", response_model=ReleaseOut, responses=ERR)
def get_release(release_id: uuid.UUID, db: DB, ctx: Read) -> ReleaseOut:
    return _detail(db, ctx, service.get_release(db, ctx.org_id, release_id))


@router.patch("/orgs/{org_id}/releases/{release_id}", response_model=ReleaseOut, responses=errors(401, 403, 404, 409, 422))
def update_release(release_id: uuid.UUID, body: ReleaseUpdateIn, db: DB, ctx: Manage) -> ReleaseOut:
    if not body.model_dump(exclude_unset=True):
        raise Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])
    return _detail(db, ctx, service.update_release(db, ctx.org_id, ctx.user.id, release_id, body))


@router.delete("/orgs/{org_id}/releases/{release_id}", status_code=status.HTTP_204_NO_CONTENT, responses=errors(401, 403, 404, 409))
def delete_release(release_id: uuid.UUID, db: DB, ctx: Manage) -> None:
    """Unlinks its bugs and runs. A released release cannot be deleted (409 `released`)."""
    service.delete_release(db, ctx.org_id, ctx.user.id, release_id)


@router.get("/orgs/{org_id}/releases/{release_id}/readiness", response_model=ReadinessOut, responses=ERR)
def get_readiness(release_id: uuid.UUID, db: DB, ctx: Read) -> ReadinessOut:
    release = service.get_release(db, ctx.org_id, release_id)
    ev = service.evaluate_many(db, ctx.org_id, [release])[release.id]
    return ReadinessOut(status=ev.verdict.status, reasons=ev.verdict.reasons, metrics=_metrics(db, ctx, release))


@router.post("/orgs/{org_id}/releases/{release_id}/bugs", response_model=LinkedOut, responses=errors(401, 403, 404, 422))
def link_bugs(release_id: uuid.UUID, body: LinkBugsIn, db: DB, ctx: Manage) -> LinkedOut:
    """Links bugs of the release's project to it (a bug in another release moves). All or nothing."""
    return LinkedOut(linked=service.link_bugs(db, ctx.org_id, ctx.user.id, release_id, body.bug_ids))


@router.delete("/orgs/{org_id}/releases/{release_id}/bugs/{bug_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def unlink_bug(release_id: uuid.UUID, bug_id: uuid.UUID, db: DB, ctx: Manage) -> None:
    service.unlink_bug(db, ctx.org_id, ctx.user.id, release_id, bug_id)


@router.post("/orgs/{org_id}/releases/{release_id}/runs", response_model=LinkedOut, responses=errors(401, 403, 404, 422))
def link_runs(release_id: uuid.UUID, body: LinkRunsIn, db: DB, ctx: Manage) -> LinkedOut:
    """Links runs of the release's project to it (completed runs too). All or nothing."""
    return LinkedOut(linked=service.link_runs(db, ctx.org_id, ctx.user.id, release_id, body.run_ids))


@router.delete("/orgs/{org_id}/releases/{release_id}/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def unlink_run(release_id: uuid.UUID, run_id: uuid.UUID, db: DB, ctx: Manage) -> None:
    service.unlink_run(db, ctx.org_id, ctx.user.id, release_id, run_id)
