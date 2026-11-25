"""AI usage (API-146 to API-148, I-14). No prompt and no answer text anywhere (D-018)."""

import uuid
from datetime import datetime
from typing import Literal

from app.core.schemas import ApiModel

Feature = Literal["bug_writer", "explain_log", "triage", "duplicates", "test_cases", "release_summary"]
Status = Literal["ok", "invalid_output", "error", "rate_limited", "fallback"]
Outcome = Literal["accepted", "edited", "discarded"]


class UsageOut(ApiModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    user_name: str | None = None  # filled by the route from the people of the page
    feature: Feature
    provider: str
    model: str
    status: Status
    input_tokens: int
    output_tokens: int
    latency_ms: int
    outcome: Outcome | None
    created_at: datetime


class FeatureTotalsOut(ApiModel):
    feature: Feature
    calls: int
    input_tokens: int
    output_tokens: int
    avg_latency_ms: int
    acceptance_rate: int | None  # percent of the suggestions with an outcome that were accepted or edited; null while none is set


class UsageSummaryOut(ApiModel):
    provider: str
    model: str
    ai_enabled: bool
    totals_by_feature: list[FeatureTotalsOut]
    daily_limit: int
    used_today: int


class OutcomeIn(ApiModel):
    outcome: Outcome
