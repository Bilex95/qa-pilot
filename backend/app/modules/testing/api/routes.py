"""Test suites and cases: API-090 to API-100 (I-06). Runs arrive with I-07."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import DB, OrgContext, require
from app.core.errors import Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.testing.application import service
from app.modules.testing.domain.rules import CaseType, case_key
from app.modules.testing.infrastructure.models import TestCase, TestSuite
from app.modules.testing.schemas.testing import (
    BulkCasesIn,
    BulkCasesOut,
    CaseIn,
    CaseOut,
    CaseSummaryOut,
    CaseUpdateIn,
    StepOut,
    SuiteIn,
    SuiteOut,
    SuiteUpdateIn,
)

router = APIRouter(tags=["testing"])
ERR = errors(401, 403, 404, 422)
Read = Annotated[OrgContext, Depends(require("test.read"))]
ManageSuites = Annotated[OrgContext, Depends(require("suite.manage"))]
ManageCases = Annotated[OrgContext, Depends(require("case.manage"))]


def _suites_out(db: Session, ctx: OrgContext, suites: list[TestSuite]) -> list[SuiteOut]:
    sc = service.suite_context(db, ctx.org_id, suites)
    return [SuiteOut(
        id=s.id, name=s.name, project_id=s.project_id, description=s.description, component_id=s.component_id,
        component=sc.component_names.get(s.component_id) if s.component_id else None,
        case_count=sc.case_counts.get(s.id, 0), last_run_pass_rate=sc.pass_rates.get(s.id),
        created_at=s.created_at, updated_at=s.updated_at) for s in suites]


def _summary(case: TestCase) -> CaseSummaryOut:
    return CaseSummaryOut(
        id=case.id, key=case_key(case.number), number=case.number, suite_id=case.suite_id, title=case.title,
        priority=case.priority, case_type=case.case_type, tags=case.tags, step_count=len(case.steps),  # type: ignore[arg-type]
        ai_generated=case.ai_generated, updated_at=case.updated_at)


def _cases_out(db: Session, ctx: OrgContext, cases: list[TestCase]) -> list[CaseOut]:
    projects = service.project_ids_of(db, ctx.org_id, cases)
    return [CaseOut(**_summary(c).model_dump(), project_id=projects[c.suite_id], preconditions=c.preconditions,
                    steps=[StepOut(**s) for s in c.steps], created_at=c.created_at) for c in cases]


# Suites -------------------------------------------------------------------

@router.get("/orgs/{org_id}/test-suites", response_model=Page[SuiteOut], responses=ERR)
def list_suites(db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)],
                project_id: uuid.UUID | None = None) -> Page[SuiteOut]:
    rows, total = service.list_suites(db, ctx.org_id, project_id, params)
    return Page(items=_suites_out(db, ctx, rows), page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/test-suites", status_code=status.HTTP_201_CREATED, response_model=SuiteOut,
             responses=errors(401, 403, 404, 409, 422))
def create_suite(body: SuiteIn, db: DB, ctx: ManageSuites) -> SuiteOut:
    return _suites_out(db, ctx, [service.create_suite(db, ctx.org_id, ctx.user.id, body)])[0]


@router.get("/orgs/{org_id}/test-suites/{suite_id}", response_model=SuiteOut, responses=ERR)
def get_suite(suite_id: uuid.UUID, db: DB, ctx: Read) -> SuiteOut:
    return _suites_out(db, ctx, [service.get_suite(db, ctx.org_id, suite_id)])[0]


@router.patch("/orgs/{org_id}/test-suites/{suite_id}", response_model=SuiteOut, responses=errors(401, 403, 404, 409, 422))
def update_suite(suite_id: uuid.UUID, body: SuiteUpdateIn, db: DB, ctx: ManageSuites) -> SuiteOut:
    if not body.model_fields_set:
        raise Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])
    return _suites_out(db, ctx, [service.update_suite(db, ctx.org_id, ctx.user.id, suite_id, body)])[0]


@router.delete("/orgs/{org_id}/test-suites/{suite_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def delete_suite(suite_id: uuid.UUID, db: DB, ctx: ManageSuites) -> None:
    service.delete_suite(db, ctx.org_id, ctx.user.id, suite_id)


# Cases --------------------------------------------------------------------

@router.get("/orgs/{org_id}/test-suites/{suite_id}/cases", response_model=Page[CaseSummaryOut], responses=ERR)
def list_cases(suite_id: uuid.UUID, db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)],
               tag: Annotated[str | None, Query(max_length=30)] = None,
               case_type: CaseType | None = None) -> Page[CaseSummaryOut]:
    rows, total = service.list_cases(db, ctx.org_id, suite_id, params, tag=tag, case_type=case_type)
    return Page(items=[_summary(c) for c in rows], page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/test-suites/{suite_id}/cases", status_code=status.HTTP_201_CREATED, response_model=CaseOut,
             responses=ERR)
def create_case(suite_id: uuid.UUID, body: CaseIn, db: DB, ctx: ManageCases) -> CaseOut:
    return _cases_out(db, ctx, service.create_cases(db, ctx.org_id, ctx.user.id, suite_id, [body]))[0]


@router.post("/orgs/{org_id}/test-suites/{suite_id}/cases/bulk", status_code=status.HTTP_201_CREATED,
             response_model=BulkCasesOut, responses=ERR)
def create_cases_bulk(suite_id: uuid.UUID, body: BulkCasesIn, db: DB, ctx: ManageCases) -> BulkCasesOut:
    created = service.create_cases(db, ctx.org_id, ctx.user.id, suite_id, body.cases, ai_usage_id=body.ai_usage_id)
    return BulkCasesOut(created=_cases_out(db, ctx, created))


@router.get("/orgs/{org_id}/test-cases/{case_ref}", response_model=CaseOut, responses=ERR)
def get_case(case_ref: str, db: DB, ctx: Read) -> CaseOut:
    return _cases_out(db, ctx, [service.get_case_by_ref(db, ctx.org_id, case_ref)])[0]


@router.patch("/orgs/{org_id}/test-cases/{case_id}", response_model=CaseOut, responses=ERR)
def update_case(case_id: uuid.UUID, body: CaseUpdateIn, db: DB, ctx: ManageCases) -> CaseOut:
    if not body.model_fields_set:
        raise Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])
    return _cases_out(db, ctx, [service.update_case(db, ctx.org_id, ctx.user.id, case_id, body)])[0]


@router.delete("/orgs/{org_id}/test-cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404))
def delete_case(case_id: uuid.UUID, db: DB, ctx: ManageCases) -> None:
    service.delete_case(db, ctx.org_id, ctx.user.id, case_id)
