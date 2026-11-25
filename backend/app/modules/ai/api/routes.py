"""AI usage: API-146 to API-148 (I-14). The feature endpoints (API-140 to API-145) arrive with I-15 to I-18 and go through
`application/service.run`."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.deps import DB, OrgContext, require
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.ai.application import integration, service
from app.modules.ai.schemas.usage import Feature, FeatureTotalsOut, OutcomeIn, UsageOut, UsageSummaryOut
from app.modules.auth.application import service as auth

integration.register()
router = APIRouter(tags=["ai"])
UsageRead = Annotated[OrgContext, Depends(require("ai.usage_read"))]
Member = Annotated[OrgContext, Depends(require("org.read"))]


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
