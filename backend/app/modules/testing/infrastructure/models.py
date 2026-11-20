import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin
from app.modules.testing.domain.rules import CASE_TYPES, DEFAULT_CASE_TYPE, DEFAULT_PRIORITY, PRIORITIES


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class TestSuite(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.4. Soft deleted with `deleted_at` (D-016); its cases are soft deleted with it."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_suites"
    __table_args__ = (
        # Case insensitive unique name per project among suites that are not deleted, so a deleted suite frees its name.
        # text() so the index uses the column, not the string "name" (the I-01 lesson)
        Index("uq_test_suites_project_name_ci", "project_id", text("lower(name)"), unique=True,
              postgresql_where=text("deleted_at IS NULL")),
        Index("ix_test_suites_org_project", "org_id", "project_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(1000), default="")
    component_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("components.id", ondelete="SET NULL"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TestCase(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.4. `number` comes from the per org counter and is never reused, soft deleted cases included; the
    displayed id is `TC-<number>`. `steps` is a JSON list of {id, action, expected} (D-031)."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_cases"
    __table_args__ = (
        UniqueConstraint("org_id", "number", name="uq_test_cases_org_number"),
        CheckConstraint(_in("priority", PRIORITIES), name="priority"),
        CheckConstraint(_in("case_type", CASE_TYPES), name="case_type"),
        Index("ix_test_cases_org_suite", "org_id", "suite_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    suite_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_suites.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    preconditions: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    priority: Mapped[str] = mapped_column(String(2), default=DEFAULT_PRIORITY)
    case_type: Mapped[str] = mapped_column(String(10), default=DEFAULT_CASE_TYPE)
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TestCaseCounter(Base):
    """Last case number handed out in an org. Updated with one UPSERT that holds the row lock until commit."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_case_counters"

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
