"""Dashboard and report figures (API-130 to API-132, I-09)."""

import uuid
from datetime import date
from typing import Literal

from app.core.schemas import ApiModel
from app.modules.bugs.domain.rules import Severity, Status
from app.modules.releases.domain.readiness import Readiness


class OpenBySeverityOut(ApiModel):
    critical: int
    high: int
    medium: int
    low: int


class TrendDayOut(ApiModel):
    date: date
    opened: int
    closed: int


class PassRateOut(ApiModel):
    last_7_days: int | None
    runs: int


class TopComponentOut(ApiModel):
    name: str
    open: int


class DashboardReleaseOut(ApiModel):
    id: uuid.UUID
    name: str
    target_date: date | None
    readiness: Readiness
    reasons: list[str]


class DashboardOut(ApiModel):
    has_data: bool
    open_total: int
    finished_total: int
    open_by_severity: OpenBySeverityOut
    critical_untriaged: int
    sla_breached: int
    trend: list[TrendDayOut]
    pass_rate: PassRateOut
    top_components: list[TopComponentOut]
    releases: list[DashboardReleaseOut]
    my_assigned_count: int


class BugTrendPointOut(ApiModel):
    date: date
    opened: int
    closed: int
    open_total: int


class StatusCountOut(ApiModel):
    status: Status
    count: int


class SeverityCountOut(ApiModel):
    severity: Severity
    count: int


class ComponentCountOut(ApiModel):
    name: str
    count: int


class AssigneeRowOut(ApiModel):
    user_id: uuid.UUID | None
    name: str
    open: int
    critical: int
    sla_breached: int


class RunRateOut(ApiModel):
    key: str
    name: str
    pass_rate: int


class SummaryOut(ApiModel):
    by_status: list[StatusCountOut]
    by_severity: list[SeverityCountOut]
    by_component: list[ComponentCountOut]
    by_assignee: list[AssigneeRowOut]
    run_pass_rate: list[RunRateOut]
    total: int


Interval = Literal["day", "week"]
