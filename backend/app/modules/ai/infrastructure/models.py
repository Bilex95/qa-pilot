import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin
from app.modules.ai.domain.rules import FEATURES, OUTCOMES, STATUSES


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class AIUsage(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.7: one row per AI call, with its status, tokens and latency. **No prompt and no answer text is stored** (D-018).
    `outcome` is set once by the person who asked (API-148). `created_at` is the time of the call."""

    __tablename__ = "ai_usage"
    __table_args__ = (
        CheckConstraint(_in("feature", FEATURES), name="feature"),
        CheckConstraint(_in("status", STATUSES), name="status"),
        CheckConstraint("outcome IS NULL OR " + _in("outcome", OUTCOMES), name="outcome"),
        Index("ix_ai_usage_org_created", "org_id", "created_at"),
        Index("ix_ai_usage_org_feature", "org_id", "feature"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    feature: Mapped[str] = mapped_column(String(20))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(16))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    outcome: Mapped[str | None] = mapped_column(String(10))
    attempts: Mapped[int] = mapped_column(Integer, nullable=True, default=1, server_default="1")  # calls made to providers (D-085)
    fallback_reason: Mapped[str | None] = mapped_column(String(24))  # why the primary was not used, for example http_503
