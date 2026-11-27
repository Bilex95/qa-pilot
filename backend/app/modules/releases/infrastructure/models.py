import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin
from app.modules.releases.domain.rules import RELEASE_STATUSES


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Release(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.5. Bugs and test runs point at a release with their own nullable `release_id` (D-015), a foreign key with
    ON DELETE SET NULL, so deleting a release unlinks them. Readiness is computed, never stored (D-014). The AI summary columns
    are filled by I-18 and only ever hold an accepted summary."""

    __tablename__ = "releases"
    __table_args__ = (
        CheckConstraint(_in("status", RELEASE_STATUSES), name="status"),
        # Case insensitive unique name per project (text() so the index uses the column, the I-01 lesson)
        Index("uq_releases_project_name_ci", "project_id", text("lower(name)"), unique=True),
        Index("ix_releases_org_project", "org_id", "project_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(1000), default="")
    target_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(12), default="planned")
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_summary_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_summary_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
