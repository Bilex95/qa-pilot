"""Test runs: API-101 to API-106 (I-07)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import DB, OrgContext, require
from app.core.errors import Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.testing.application import integration, runs
from app.modules.testing.domain.rules import RunStatus
from app.modules.testing.infrastructure.models import TestRun, TestRunResult
from app.modules.testing.schemas.runs import (
    BugDraftOut,
    BugRefOut,
    ResultUpdateIn,
    RunCreateIn,
    RunOut,
    RunResultOut,
    RunSummaryOut,
    RunUpdateIn,
)
from app.modules.testing.schemas.testing import StepOut

integration.register()

router = APIRouter(tags=["test runs"])
ERR = errors(401, 403, 404, 422)
Read = Annotated[OrgContext, Depends(require("test.read"))]


def _summaries(db: Session, ctx: OrgContext, rows: list[TestRun]) -> list[RunSummaryOut]:
    return runs.summaries(db, ctx.org_id, rows)


def _result_out(res: TestRunResult, names: dict[uuid.UUID, str], bug_refs: dict[uuid.UUID, list[tuple[uuid.UUID, str]]]) -> RunResultOut:
    return RunResultOut(
        id=res.id, case_id=res.case_id, case_key=res.case_key, case_title=res.case_title, position=res.position,
        preconditions=res.preconditions, steps=[StepOut(**s) for s in res.steps], result=res.result,  # type: ignore[arg-type]
        failed_step_index=res.failed_step_index, actual_result=res.actual_result, note=res.note,
        executed_by_id=res.executed_by_id, executed_by_name=names.get(res.executed_by_id) if res.executed_by_id else None,
        executed_at=res.executed_at, bugs=[BugRefOut(id=i, key=k) for i, k in bug_refs.get(res.id, [])])


def _run_out(db: Session, ctx: OrgContext, run: TestRun) -> RunOut:
    summary = _summaries(db, ctx, [run])[0]
    results, names, bug_refs = runs.results_with_people(db, ctx.org_id, run)
    return RunOut(**summary.model_dump(by_alias=False), results=[_result_out(r, names, bug_refs) for r in results])


@router.get("/orgs/{org_id}/test-runs", response_model=Page[RunSummaryOut], responses=ERR)
def list_runs(db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)], project_id: uuid.UUID | None = None,
              status: RunStatus | None = None, release_id: uuid.UUID | None = None) -> Page[RunSummaryOut]:
    rows, total = runs.list_runs(db, ctx.org_id, params, project_id=project_id, status=status, release_id=release_id)
    return Page(items=_summaries(db, ctx, rows), page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/test-runs", status_code=status.HTTP_201_CREATED, response_model=RunOut,
             responses=errors(401, 403, 404, 422))
def create_run(body: RunCreateIn, db: DB, ctx: Annotated[OrgContext, Depends(require("run.create"))]) -> RunOut:
    return _run_out(db, ctx, runs.create_run(db, ctx.org_id, ctx.user.id, body))


@router.get("/orgs/{org_id}/test-runs/{run_ref}", response_model=RunOut, responses=ERR)
def get_run(run_ref: str, db: DB, ctx: Read) -> RunOut:
    """`run_ref` is the id or the key (R-31)."""
    return _run_out(db, ctx, runs.get_run_by_ref(db, ctx.org_id, run_ref))


@router.patch("/orgs/{org_id}/test-runs/{run_id}", response_model=RunOut, responses=errors(401, 403, 404, 409, 422))
def update_run(run_id: uuid.UUID, body: RunUpdateIn, db: DB, ctx: Annotated[OrgContext, Depends(require("run.complete"))]) -> RunOut:
    if not body.model_dump(exclude_unset=True):
        raise Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])
    return _run_out(db, ctx, runs.update_run(db, ctx.org_id, ctx.user.id, run_id, body))


@router.patch("/orgs/{org_id}/test-runs/{run_id}/results/{result_id}", response_model=RunResultOut,
              responses=errors(401, 403, 404, 409, 422))
def update_result(run_id: uuid.UUID, result_id: uuid.UUID, body: ResultUpdateIn, db: DB,
                  ctx: Annotated[OrgContext, Depends(require("run.execute"))]) -> RunResultOut:
    res = runs.update_result(db, ctx.org_id, ctx.user.id, run_id, result_id, body)
    _, names, bug_refs = runs.results_with_people(db, ctx.org_id, runs.get_run(db, ctx.org_id, run_id))
    return _result_out(res, names, bug_refs)


@router.get("/orgs/{org_id}/test-runs/{run_id}/results/{result_id}/bug-draft", response_model=BugDraftOut,
            responses=errors(401, 403, 404, 409))
def bug_draft(run_id: uuid.UUID, result_id: uuid.UUID, db: DB,
              ctx: Annotated[OrgContext, Depends(require("run.bug_from_failure"))]) -> BugDraftOut:
    return BugDraftOut(**runs.bug_draft(db, ctx.org_id, run_id, result_id))
