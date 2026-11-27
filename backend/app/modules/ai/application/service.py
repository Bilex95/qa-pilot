"""The AI service (AI_SPEC section 1): the one place every AI feature goes through. It checks the switch and the limits, builds nothing
itself (the feature gives it a task and tagged blocks), asks the provider, validates the answer with Pydantic, retries once, falls back,
and writes one usage row per call. AI only suggests (REQ-049): nothing here saves anything for the caller."""

import time
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Protocol

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import utcnow
from app.core.errors import Conflict, Forbidden, NotFound, RateLimited
from app.core.pagination import PageParams, paginate
from app.modules.ai.domain.prompt import Block, system_prompt
from app.modules.ai.domain.provider import AIProvider, ProviderError, ProviderResult
from app.modules.ai.domain.rules import FEATURES, OUTCOMES, SlidingWindow, acceptance_rate
from app.modules.ai.infrastructure import repository as repo
from app.modules.ai.infrastructure.factory import get_provider
from app.modules.ai.infrastructure.models import AIUsage


class Organization(Protocol):
    """The three things of a workspace that the AI service reads (the request context's organization has them): the AI module never
    imports the organizations module."""

    id: uuid.UUID
    ai_enabled: bool
    ai_daily_limit: int

_limiter: SlidingWindow | None = None


def limiter() -> SlidingWindow:
    """One window per process (documented limit for several backend processes, D-012)."""
    global _limiter
    if _limiter is None:
        _limiter = SlidingWindow(get_settings().ai_user_rate_per_minute)
    return _limiter


@dataclass(frozen=True)
class AIResult[T: BaseModel]:
    value: T  # the validated answer, or the feature's fallback
    fallback: bool  # True when `value` is the fallback ("AI could not produce a suggestion. You can continue manually.")
    usage_id: uuid.UUID  # for the outcome call (API-148) and for `ai_usage_id` when the suggestion is saved
    status: str


def _start_of_today(now: datetime) -> datetime:
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


def _refuse(db: Session, org: Organization, user_id: uuid.UUID, feature: str, provider: AIProvider, message: str, code: str,
            retry_after: int) -> RateLimited:
    repo.add(db, org_id=org.id, user_id=user_id, feature=feature, provider=provider.name, model=provider.model, status="rate_limited",
             input_tokens=0, output_tokens=0, latency_ms=0)
    db.commit()
    return RateLimited(message, retry_after=retry_after, code=code)


def run[T: BaseModel](db: Session, org: Organization, user_id: uuid.UUID, *, feature: str, task: str, blocks: Sequence[Block],
                      output_model: type[T], fallback: T, max_tokens: int = 1024, provider: AIProvider | None = None,
                      window: SlidingWindow | None = None, settings: Settings | None = None,
                      check: Callable[[T], str | None] | None = None) -> AIResult[T]:
    """Run one AI feature for one person. Raises 403 `ai_disabled`, or 429 `rate_limited` (per user per minute) and 429 `daily_limit`
    (the organization's limit); every refusal and every call writes a usage row. Never raises for a provider problem: the fallback is
    returned instead, with the status `error` or `invalid_output`."""
    if feature not in FEATURES:
        raise ValueError(f"unknown AI feature {feature!r}")
    provider = provider or get_provider(settings)
    window = window or limiter()
    if not org.ai_enabled:
        raise Forbidden("AI is turned off for this workspace.", code="ai_disabled", details={"action": f"ai.{feature}"})
    key = f"{org.id}:{user_id}"
    if not window.allow(key):
        raise _refuse(db, org, user_id, feature, provider, "Too many AI requests. Wait a moment and try again.", "rate_limited",
                      window.retry_after(key))
    now = utcnow()
    if repo.calls_since(db, org.id, _start_of_today(now)) >= org.ai_daily_limit:
        raise _refuse(db, org, user_id, feature, provider, f"This workspace reached its daily limit of {org.ai_daily_limit} AI calls.",
                      "daily_limit", int((_start_of_today(now) + timedelta(days=1) - now).total_seconds()) + 1)

    system = system_prompt(task)
    started = time.perf_counter()
    status, input_tokens, output_tokens, model = "ok", 0, 0, provider.model
    answered, attempts, fallback_reason = provider.name, 0, None  # who answered, calls made, why the primary was skipped (D-085)
    value: T | None = None
    correction: str | None = None
    for attempt in (1, 2):
        try:
            result: ProviderResult = provider.complete_json(feature=feature, system=system, blocks=blocks, output_model=output_model,
                                                            max_tokens=max_tokens, correction=correction)
        except ProviderError as exc:
            status = "error"
            attempts += exc.attempts
            fallback_reason = exc.reasons or exc.reason
            answered = provider.name  # every provider failed: the row names the primary
            break
        attempts += result.attempts
        answered = result.provider or provider.name
        fallback_reason = result.fallback_reason or fallback_reason
        input_tokens += result.input_tokens
        output_tokens += result.output_tokens
        model = result.model
        try:
            value = output_model.model_validate_json(result.raw_text)
            problem = check(value) if check else None  # a rule the schema cannot state (for example "one case of each type")
            if problem:
                value = None
                correction = problem
            else:
                break
        except ValidationError as exc:
            correction = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:5])
        if attempt == 2:
            status = "invalid_output"
    used_fallback = value is None
    row = repo.add(db, org_id=org.id, user_id=user_id, feature=feature, provider=answered, model=model, status=status,
                   input_tokens=input_tokens, output_tokens=output_tokens, latency_ms=int((time.perf_counter() - started) * 1000),
                   attempts=max(attempts, 1), fallback_reason=fallback_reason)
    db.commit()
    return AIResult(value=fallback if value is None else value, fallback=used_fallback, usage_id=row.id, status=status)


def fallback_only[T: BaseModel](db: Session, org: Organization, user_id: uuid.UUID, *, feature: str, value: T,
                                provider: AIProvider | None = None) -> AIResult[T]:
    """A feature that decides not to ask the model (nothing to analyse, or the duplicate detector, D-013): one `fallback` row with no
    tokens, still subject to the switch."""
    provider = provider or get_provider()
    if not org.ai_enabled:
        raise Forbidden("AI is turned off for this workspace.", code="ai_disabled", details={"action": f"ai.{feature}"})
    row = repo.add(db, org_id=org.id, user_id=user_id, feature=feature, provider=provider.name, model=provider.model, status="fallback",
                   input_tokens=0, output_tokens=0, latency_ms=0)
    db.commit()
    return AIResult(value=value, fallback=True, usage_id=row.id, status="fallback")


def log_local(db: Session, org: Organization, user_id: uuid.UUID, feature: str) -> uuid.UUID:
    """The usage row of a feature that never asks a model and costs nothing (the duplicate detector, D-013, D-070): status `ok`, no tokens.
    It is subject to the switch but not to the per minute window (the screen calls it while the person types, debounced) and does not
    count against the daily limit of model calls."""
    if not org.ai_enabled:
        raise Forbidden("AI is turned off for this workspace.", code="ai_disabled", details={"action": f"ai.{feature}"})
    row = repo.add(db, org_id=org.id, user_id=user_id, feature=feature, provider="local", model="tf-idf", status="ok", input_tokens=0,
                   output_tokens=0, latency_ms=0)
    db.commit()
    return row.id


# Usage log and outcome (API-146 to API-148) ---------------------------------------------------------------------------------------------

def _range(start: date | None, end: date | None) -> tuple[datetime | None, datetime | None]:
    """A date range as UTC instants: the end day is included."""
    since = datetime(start.year, start.month, start.day, tzinfo=UTC) if start else None
    until = datetime(end.year, end.month, end.day, tzinfo=UTC) + timedelta(days=1) if end else None
    return since, until


def list_usage(db: Session, org_id: uuid.UUID, params: PageParams, *, feature: str | None, user_id: uuid.UUID | None,
               start: date | None, end: date | None) -> tuple[list[AIUsage], int]:
    since, until = _range(start, end)
    return paginate(db, repo.usage_query(org_id, feature=feature, user_id=user_id, since=since, until=until), params)


@dataclass(frozen=True)
class FeatureSummary:
    feature: str
    calls: int
    input_tokens: int
    output_tokens: int
    avg_latency_ms: int
    acceptance_rate: int | None


@dataclass(frozen=True)
class Summary:
    provider: str
    model: str
    ai_enabled: bool
    totals_by_feature: list[FeatureSummary]
    daily_limit: int
    used_today: int


def summary(db: Session, org: Organization, start: date | None, end: date | None, settings: Settings | None = None) -> Summary:
    since, until = _range(start, end)
    provider = get_provider(settings)
    rows = [FeatureSummary(t.feature, t.calls, t.input_tokens, t.output_tokens, t.avg_latency_ms,
                           acceptance_rate(t.accepted, t.edited, t.discarded))
            for t in repo.totals_by_feature(db, org.id, since, until)]
    return Summary(provider=provider.name, model=provider.model, ai_enabled=org.ai_enabled, totals_by_feature=rows,
                   daily_limit=org.ai_daily_limit, used_today=repo.calls_since(db, org.id, _start_of_today(utcnow())))


def set_outcome(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, usage_id: uuid.UUID, outcome: str) -> None:
    """Only the person who asked records what they did with the suggestion, once. Another person's id, a refused call and an unknown id
    are all 404 (no suggestion of theirs exists); a second outcome is 409 `outcome_set`."""
    if outcome not in OUTCOMES:
        raise ValueError(f"unknown outcome {outcome!r}")
    row = repo.get(db, org_id, usage_id)
    if row is None or row.user_id != user_id or row.status == "rate_limited":
        raise NotFound("AI suggestion not found.")
    if not repo.set_outcome(db, org_id, usage_id, outcome):
        raise Conflict("The outcome of this suggestion is already recorded.", code="outcome_set", details={"outcome": row.outcome})
    db.commit()
