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

from app.core.db import Base, IdMixin, TimestampMixin, utcnow
from app.modules.testing.domain.rules import (
    CASE_TYPES,
    DEFAULT_CASE_TYPE,
    DEFAULT_PRIORITY,
    PRIORITIES,
    RUN_RESULTS,
    RUN_STATUSES,
)


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


class TestRun(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.4 and section 5. `number` comes from the per org run counter (the displayed id is `R-<number>`). Deleting a
    release leaves the run with none (D-015). A completed run is read only."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_runs"
    __table_args__ = (
        UniqueConstraint("org_id", "number", name="uq_test_runs_org_number"),
        CheckConstraint(_in("status", RUN_STATUSES), name="status"),
        Index("ix_test_runs_org_project_started", "org_id", "project_id", text("started_at DESC")),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(120))
    environment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("environments.id", ondelete="SET NULL"))
    release_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("releases.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(12), default="in_progress")
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TestRunResult(IdMixin, Base):
    """One case in one run, with a snapshot of the case (key, title, preconditions, steps and suite) taken when the run
    started, so editing or deleting the case later never changes the run (REQ-032)."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_run_results"
    __table_args__ = (
        CheckConstraint(_in("result", RUN_RESULTS), name="result"),
        Index("ix_test_run_results_run_position", "run_id", "position"),
        Index("ix_test_run_results_suite", "suite_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_runs.id", ondelete="CASCADE"))
    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("test_cases.id"))
    suite_id: Mapped[uuid.UUID] = mapped_column()  # snapshot: the suite the case was in when the run started
    position: Mapped[int] = mapped_column(Integer)
    case_key: Mapped[str] = mapped_column(String(16))
    case_title: Mapped[str] = mapped_column(String(200))
    preconditions: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    result: Mapped[str] = mapped_column(String(10), default="untested")
    failed_step_index: Mapped[int | None] = mapped_column(Integer)
    actual_result: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    executed_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TestRunCounter(Base):
    """Last run number handed out in an org (same UPSERT pattern as the case counter)."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_run_counters"

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)


class TestCaseCounter(Base):
    """Last case number handed out in an org. Updated with one UPSERT that holds the row lock until commit."""

    __test__ = False  # not a pytest class
    __tablename__ = "test_case_counters"

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)
