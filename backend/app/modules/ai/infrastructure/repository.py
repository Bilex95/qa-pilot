"""AI usage persistence. Every query takes org_id (NFR-TEN-02)."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, case, func, select, update
from sqlalchemy.orm import Session

from app.modules.ai.domain.rules import COUNTED
from app.modules.ai.infrastructure.models import AIUsage


def add(db: Session, *, org_id: uuid.UUID, user_id: uuid.UUID | None, feature: str, provider: str, model: str, status: str,
        input_tokens: int, output_tokens: int, latency_ms: int) -> AIUsage:
    row = AIUsage(org_id=org_id, user_id=user_id, feature=feature, provider=provider, model=model, status=status,
                  input_tokens=input_tokens, output_tokens=output_tokens, latency_ms=latency_ms)
    db.add(row)
    db.flush()
    return row


def get(db: Session, org_id: uuid.UUID, usage_id: uuid.UUID) -> AIUsage | None:
    return db.scalar(select(AIUsage).where(AIUsage.org_id == org_id, AIUsage.id == usage_id))


def exists(db: Session, org_id: uuid.UUID, usage_id: uuid.UUID) -> bool:
    """Public contract for the features that save something an AI suggested (`ai_usage_id`): the row exists in this workspace and the
    model was actually asked (a refused call has no suggestion)."""
    row = get(db, org_id, usage_id)
    return row is not None and row.status != "rate_limited"


def set_outcome(db: Session, org_id: uuid.UUID, usage_id: uuid.UUID, outcome: str) -> bool:
    """Set the outcome once: False when it was already set (the UPDATE only touches a row without an outcome, so races are safe)."""
    result = db.execute(update(AIUsage).where(AIUsage.org_id == org_id, AIUsage.id == usage_id, AIUsage.outcome.is_(None))
                        .values(outcome=outcome))
    return bool(result.rowcount)  # type: ignore[attr-defined]


def calls_since(db: Session, org_id: uuid.UUID, since: datetime) -> int:
    """Calls that count against the daily limit since `since`: the model was asked, or a fallback was served (not the refused ones)."""
    return int(db.scalar(select(func.count()).select_from(AIUsage).where(
        AIUsage.org_id == org_id, AIUsage.created_at >= since, AIUsage.status.in_(COUNTED),
        AIUsage.feature != "duplicates")) or 0)  # the duplicate detector costs nothing (D-070)


def usage_query(org_id: uuid.UUID, *, feature: str | None, user_id: uuid.UUID | None, since: datetime | None,
                until: datetime | None) -> Select[Any]:
    stmt = select(AIUsage).where(AIUsage.org_id == org_id)
    if feature:
        stmt = stmt.where(AIUsage.feature == feature)
    if user_id:
        stmt = stmt.where(AIUsage.user_id == user_id)
    if since:
        stmt = stmt.where(AIUsage.created_at >= since)
    if until:
        stmt = stmt.where(AIUsage.created_at < until)
    return stmt.order_by(AIUsage.created_at.desc(), AIUsage.id)


@dataclass(frozen=True)
class FeatureTotals:
    feature: str
    calls: int
    input_tokens: int
    output_tokens: int
    avg_latency_ms: int
    accepted: int
    edited: int
    discarded: int


def totals_by_feature(db: Session, org_id: uuid.UUID, since: datetime | None, until: datetime | None) -> list[FeatureTotals]:
    """One row per feature that has calls in the range (refused calls are not calls): counts, tokens, average latency and outcomes."""
    def outcome(name: str) -> Any:
        return func.coalesce(func.sum(case((AIUsage.outcome == name, 1), else_=0)), 0)

    stmt = (select(AIUsage.feature, func.count(), func.coalesce(func.sum(AIUsage.input_tokens), 0),
                   func.coalesce(func.sum(AIUsage.output_tokens), 0), func.coalesce(func.avg(AIUsage.latency_ms), 0),
                   outcome("accepted"), outcome("edited"), outcome("discarded"))
            .where(AIUsage.org_id == org_id, AIUsage.status != "rate_limited").group_by(AIUsage.feature).order_by(AIUsage.feature))
    if since:
        stmt = stmt.where(AIUsage.created_at >= since)
    if until:
        stmt = stmt.where(AIUsage.created_at < until)
    return [FeatureTotals(f, int(c), int(i), int(o), round(float(lat)), int(a), int(e), int(d))
            for f, c, i, o, lat, a, e, d in db.execute(stmt)]
