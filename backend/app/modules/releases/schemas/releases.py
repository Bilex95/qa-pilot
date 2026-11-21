"""Releases and their readiness (API-110 to API-119, I-08)."""

import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from app.core.schemas import ApiModel
from app.modules.bugs.domain.rules import Priority, Severity, Status
from app.modules.releases.domain.readiness import Readiness
from app.modules.releases.domain.rules import MAX_LINKS_PER_REQUEST, ReleaseStatus
from app.modules.testing.schemas.runs import RunSummaryOut

ReleaseName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
ReleaseDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class ReleaseIn(ApiModel):
    project_id: uuid.UUID
    name: ReleaseName
    target_date: date | None = None
    description: ReleaseDescription = ""


class ReleaseUpdateIn(ApiModel):
    """Only the fields that are sent change. `target_date: null` clears the date. `status` only moves forward (planned, in progress,
    released). The AI summary fields arrive with I-18; until then sending them is a 422."""

    name: ReleaseName | None = None
    description: ReleaseDescription | None = None
    target_date: date | None = None
    status: ReleaseStatus | None = None
    ai_summary: str | None = None
    ai_usage_id: uuid.UUID | None = None

    @field_validator("name", "description", "status", mode="before")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be cleared.")
        return value


class OpenBySeverity(ApiModel):
    critical: int
    high: int
    medium: int
    low: int


class ReadinessMetrics(ApiModel):
    open_by_severity: OpenBySeverity
    pass_rate: int | None
    runs_in_progress: int
    linked_runs: int


class ReadinessOut(ApiModel):
    status: Readiness
    reasons: list[str]
    metrics: ReadinessMetrics


class ReleaseSummaryOut(ApiModel):
    id: uuid.UUID
    name: str
    project_id: uuid.UUID
    description: str
    status: ReleaseStatus
    target_date: date | None
    released_at: datetime | None
    readiness: Readiness
    reasons: list[str]
    open_bug_count: int
    linked_bug_count: int
    linked_run_count: int
    pass_rate: int | None
    created_at: datetime


class LinkedBugOut(ApiModel):
    id: uuid.UUID
    key: str
    title: str
    status: Status
    severity: Severity
    priority: Priority
    assignee_id: uuid.UUID | None
    assignee_name: str | None
    sla_breached: bool
    updated_at: datetime


class ReleaseOut(ReleaseSummaryOut):
    metrics: ReadinessMetrics
    bugs: list[LinkedBugOut]
    runs: list[RunSummaryOut]
    ai_summary: str | None
    ai_summary_at: datetime | None
    ai_summary_by_name: str | None


class LinkBugsIn(ApiModel):
    bug_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=MAX_LINKS_PER_REQUEST)]


class LinkRunsIn(ApiModel):
    run_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=MAX_LINKS_PER_REQUEST)]


class LinkedOut(ApiModel):
    linked: int
