"""AI: the bug writer, explain this log and the duplicate detector (API-140, API-141, API-143; I-15), triage (API-142; I-16), the test case
generator (API-144; I-17), the release summary (API-145; I-18) and the usage log (API-146 to API-148; I-14). All but the duplicate
detector go through `application/service.run`."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import DB, OrgContext, require
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.ai.application import features, integration, service
from app.modules.ai.schemas.features import (
    BugWriterIn,
    BugWriterOut,
    DuplicatesIn,
    DuplicatesOut,
    ExplainLogIn,
    GenerateCasesIn,
    GenerateCasesOut,
    LogExplanationOut,
    ReleaseSummaryIn,
    ReleaseSummarySuggestion,
    TriageIn,
    TriageOut,
)
from app.modules.ai.schemas.usage import Feature, FeatureTotalsOut, OutcomeIn, UsageOut, UsageSummaryOut
from app.modules.auth.application import service as auth

integration.register()
router = APIRouter(tags=["ai"])
UsageRead = Annotated[OrgContext, Depends(require("ai.usage_read"))]
Member = Annotated[OrgContext, Depends(require("org.read"))]


BugWriter = Annotated[OrgContext, Depends(require("ai.bug_writer"))]
LogReader = Annotated[OrgContext, Depends(require("ai.explain_log"))]
Triager = Annotated[OrgContext, Depends(require("ai.triage"))]
CaseWriter = Annotated[OrgContext, Depends(require("ai.test_cases"))]
SummaryWriter = Annotated[OrgContext, Depends(require("ai.release_summary"))]
Duplicates = Annotated[OrgContext, Depends(require("ai.duplicates"))]
FEATURE_ERR = errors(401, 403, 404, 422, 429)


@router.post("/orgs/{org_id}/ai/bug-writer", response_model=BugWriterOut, responses=FEATURE_ERR)
def bug_writer(body: BugWriterIn, db: DB, ctx: BugWriter) -> BugWriterOut:
    """Turn rough notes (and a log) into a structured bug report. A suggestion only: nothing is saved. `environment_id` and `component_id`
    are ids of the project, never invented; `fallback` is true when the model could not help."""
    return features.bug_writer(db, ctx.org, ctx.user.id, body)


@router.post("/orgs/{org_id}/ai/triage", response_model=TriageOut, responses=FEATURE_ERR)
def triage(body: TriageIn, db: DB, ctx: Triager) -> TriageOut:
    """Suggest severity, priority and component for a bug (`bug_id`) or for the fields of a bug not saved yet, with a reason. A suggestion
    only: accepting it is the normal bug update. `fallback` is true (and the suggestion empty) when the model could not help."""
    return features.triage(db, ctx.org, ctx.user.id, body)


@router.post("/orgs/{org_id}/ai/test-cases", response_model=GenerateCasesOut, responses=FEATURE_ERR)
def generate_test_cases(body: GenerateCasesIn, db: DB, ctx: CaseWriter) -> GenerateCasesOut:
    """Positive, negative and edge test cases for a story (3 to 15, at least one of each type when 3 or more). Nothing is saved: the person
    picks cases and saves them with the bulk endpoint, sending `usage_id` as `ai_usage_id`. `fallback` is true (no cases) when the model
    could not help."""
    return features.generate_test_cases(db, ctx.org, ctx.user.id, body)


@router.post("/orgs/{org_id}/ai/release-summary", response_model=ReleaseSummarySuggestion, responses=FEATURE_ERR)
def release_summary(body: ReleaseSummaryIn, db: DB, ctx: SummaryWriter) -> ReleaseSummarySuggestion:
    """A plain English risk summary of a release, written from numbers the server builds (readiness, open bugs, runs). Nothing is saved:
    the person accepts it with the release update, sending `usage_id` as `ai_usage_id`. A release of another workspace is a 404."""
    return features.release_readiness_summary(db, ctx.org, ctx.user.id, body)


@router.post("/orgs/{org_id}/ai/explain-log", response_model=LogExplanationOut, responses=FEATURE_ERR)
def explain_log(body: ExplainLogIn, db: DB, ctx: LogReader) -> LogExplanationOut:
    """Explain what a log shows: the error, the likely cause and the key lines (the last 300 lines, 12,000 characters, are used)."""
    return features.explain_log(db, ctx.org, ctx.user.id, body)


@router.post("/orgs/{org_id}/ai/duplicates", response_model=DuplicatesOut, responses=FEATURE_ERR)
def find_duplicates(body: DuplicatesIn, db: DB, ctx: Duplicates) -> DuplicatesOut:
    """Open bugs of the project that look like this one (TF-IDF, up to five with a score of at least 0.25). No model is called."""
    return features.duplicates(db, ctx.org, ctx.user.id, body)


@router.get("/orgs/{org_id}/ai/usage", response_model=Page[UsageOut], responses=errors(401, 403, 404, 422))
def list_usage(db: DB, ctx: UsageRead, params: Annotated[PageParams, Depends(page_params)], feature: Feature | None = None,
               user_id: uuid.UUID | None = None, from_: Annotated[date | None, Query(alias="from")] = None,
               to: date | None = None) -> Page[UsageOut]:
    """The log of AI calls, newest first: who asked, which feature, the status, tokens, latency and the outcome. Never the text."""
    rows, total = service.list_usage(db, ctx.org_id, params, feature=feature, user_id=user_id, start=from_, end=to)
    people = auth.get_users_by_ids(db, list({r.user_id for r in rows if r.user_id}))
    items = [UsageOut.model_validate(r).model_copy(update={"user_name": people[r.user_id].full_name if r.user_id in people else None})
             for r in rows]
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.get("/orgs/{org_id}/ai/usage/summary", response_model=UsageSummaryOut, responses=errors(401, 403, 404, 422))
def get_summary(db: DB, ctx: UsageRead, from_: Annotated[date | None, Query(alias="from")] = None,
                to: date | None = None) -> UsageSummaryOut:
    """Totals by feature (calls, tokens, average latency, acceptance rate), the provider and model in use, and today's calls against the
    daily limit."""
    got = service.summary(db, ctx.org, from_, to)
    return UsageSummaryOut(
        provider=got.provider, model=got.model, ai_enabled=got.ai_enabled, daily_limit=got.daily_limit, used_today=got.used_today,
        totals_by_feature=[FeatureTotalsOut(**t.__dict__) for t in got.totals_by_feature])  # type: ignore[arg-type]


@router.post("/orgs/{org_id}/ai/usage/{usage_id}/outcome", status_code=status.HTTP_204_NO_CONTENT,
             responses=errors(401, 403, 404, 409, 422))
def set_outcome(usage_id: uuid.UUID, body: OutcomeIn, db: DB, ctx: Member) -> None:
    """What the person who asked did with the suggestion: accepted, edited or discarded. Once; only the caller of the original request."""
    service.set_outcome(db, ctx.org_id, ctx.user.id, usage_id, body.outcome)
