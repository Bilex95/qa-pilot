"""Dashboard and reports: API-130 to API-132 (I-09). The CSV export (API-133) lives with the bugs because it takes the bug list filters."""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.deps import DB, OrgContext, require
from app.core.schemas import errors
from app.modules.bugs.application import reporting as bug_reporting
from app.modules.dashboard.schemas.dashboard import (
    AssigneeRowOut,
    BugTrendPointOut,
    ComponentCountOut,
    DashboardOut,
    DashboardReleaseOut,
    Interval,
    OpenBySeverityOut,
    PassRateOut,
    RunRateOut,
    SeverityCountOut,
    StatusCountOut,
    SummaryOut,
    TopComponentOut,
    TrendDayOut,
)
from app.modules.releases.application import service as releases
from app.modules.testing.application import runs as testing

router = APIRouter(tags=["dashboard"])
Dashboard = Annotated[OrgContext, Depends(require("dashboard.read"))]
Report = Annotated[OrgContext, Depends(require("report.read"))]
TREND_DAYS = 30


def _midnight(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


@router.get("/orgs/{org_id}/dashboard", response_model=DashboardOut, responses=errors(401, 403, 404, 422))
def get_dashboard(db: DB, ctx: Dashboard, project_id: uuid.UUID | None = None) -> DashboardOut:
    """The headline numbers, the 30 day trend, the pass rate of the last 7 days, the components with most open bugs and the readiness of
    the releases that are not released yet. `project_id` narrows everything to one project."""
    now = bug_reporting.today()
    counts = bug_reporting.headline(db, ctx.org_id, project_id, ctx.user.id)
    trend = bug_reporting.trend(db, ctx.org_id, project_id, now - timedelta(days=TREND_DAYS - 1), now)
    rate, runs = testing.pass_rate_since(db, ctx.org_id, project_id, _midnight(now - timedelta(days=6)))
    return DashboardOut(
        has_data=counts["open"] + counts["finished"] > 0,
        open_total=counts["open"], finished_total=counts["finished"],
        open_by_severity=OpenBySeverityOut(**bug_reporting.open_by_severity(db, ctx.org_id, project_id)),
        critical_untriaged=counts["critical_untriaged"], sla_breached=counts["sla_breached"],
        trend=[TrendDayOut(date=p.date, opened=p.opened, closed=p.closed) for p in trend],
        pass_rate=PassRateOut(last_7_days=rate, runs=runs),
        top_components=[TopComponentOut(name=n, open=c) for n, c in bug_reporting.top_components(db, ctx.org_id, project_id)],
        releases=[DashboardReleaseOut(id=r.id, name=r.name, target_date=r.target_date, readiness=ev.verdict.status,
                                      reasons=ev.verdict.reasons)
                  for r, ev in releases.unreleased_readiness(db, ctx.org_id, project_id)],
        my_assigned_count=counts["mine"])


@router.get("/orgs/{org_id}/reports/bug-trend", response_model=list[BugTrendPointOut], responses=errors(401, 403, 404, 422))
def get_bug_trend(db: DB, ctx: Report, project_id: uuid.UUID | None = None, from_: Annotated[date | None, Query(alias="from")] = None,
                  to: date | None = None, interval: Interval = "day") -> list[BugTrendPointOut]:
    """Bugs opened and closed per day or week, with the number open at the end of each. Default: the last 30 days. At most 366 days."""
    end = to or bug_reporting.today()
    start = from_ or end - timedelta(days=TREND_DAYS - 1)
    return [BugTrendPointOut(date=p.date, opened=p.opened, closed=p.closed, open_total=p.open_total)
            for p in bug_reporting.trend(db, ctx.org_id, project_id, start, end, interval)]


@router.get("/orgs/{org_id}/reports/summary", response_model=SummaryOut, responses=errors(401, 403, 404, 422))
def get_summary(db: DB, ctx: Report, project_id: uuid.UUID | None = None, from_: Annotated[date | None, Query(alias="from")] = None,
                to: date | None = None) -> SummaryOut:
    """Breakdowns of the bugs created in the range (default: the last 30 days), and the pass rate of each run started in it."""
    end = to or bug_reporting.today()
    start = from_ or end - timedelta(days=TREND_DAYS - 1)
    got = bug_reporting.summary(db, ctx.org_id, project_id, start, end)
    unassigned = got["unassigned"]
    rows = [AssigneeRowOut(user_id=uid, name=name, open=o, critical=c, sla_breached=s)
            for uid, name, o, c, s in got["by_assignee"]]  # type: ignore[attr-defined]
    rows.append(AssigneeRowOut(user_id=None, name="Unassigned", open=unassigned[0], critical=unassigned[1],  # type: ignore[index]
                               sla_breached=unassigned[2]))  # type: ignore[index]
    rates = testing.rates_per_run(db, ctx.org_id, project_id, _midnight(start), _midnight(end + timedelta(days=1)))
    return SummaryOut(
        by_status=[StatusCountOut(status=s, count=n) for s, n in got["by_status"]],  # type: ignore[attr-defined,arg-type]
        by_severity=[SeverityCountOut(severity=s, count=n) for s, n in got["by_severity"]],  # type: ignore[attr-defined,arg-type]
        by_component=[ComponentCountOut(name=n, count=c) for n, c in got["by_component"]],  # type: ignore[attr-defined]
        by_assignee=rows, run_pass_rate=[RunRateOut(key=k, name=n, pass_rate=r) for k, n, r in rates],
        total=sum(n for _, n in got["by_status"]))  # type: ignore[attr-defined]
