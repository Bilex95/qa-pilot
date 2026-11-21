"""Aggregations over bugs for the dashboard and the reports (I-09). Everything is one SQL statement per figure, filtered by org_id
(NFR-TEN-02) and by project when asked; soft deleted bugs never count. Dates are UTC calendar days."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Select, and_, func, literal_column, not_, select
from sqlalchemy.orm import Session

from app.modules.bugs.domain.rules import FINISHED_STATUSES
from app.modules.bugs.infrastructure.models import Bug, BugActivity
from app.modules.bugs.infrastructure.repository import open_clause, sla_breached_clause


def _bugs(org_id: uuid.UUID, project_id: uuid.UUID | None) -> list[Any]:
    clauses: list[Any] = [Bug.org_id == org_id, Bug.deleted_at.is_(None)]
    if project_id:
        clauses.append(Bug.project_id == project_id)
    return clauses


def _day(column: Any) -> Any:
    # 'UTC' is inlined (not a bind parameter) so the SELECT and GROUP BY forms of the expression are textually the same
    return func.date(func.timezone(literal_column("'UTC'"), column))


def open_by_severity(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None) -> dict[str, int]:
    rows = db.execute(select(Bug.severity, func.count()).where(*_bugs(org_id, project_id), open_clause()).group_by(Bug.severity))
    return {severity: int(n) for severity, n in rows}


def headline_counts(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, now: datetime, user_id: uuid.UUID) -> dict[str, int]:
    """Open bugs, finished bugs, Critical open bugs still New, open bugs past SLA, open bugs assigned to `user_id`."""
    base = _bugs(org_id, project_id)
    open_ = open_clause()
    row = db.execute(select(
        func.count().filter(open_).label("open"),
        func.count().filter(not_(open_)).label("finished"),
        func.count().filter(and_(open_, Bug.severity == "critical", Bug.status == "new")).label("untriaged"),
        func.count().filter(and_(open_, sla_breached_clause(now))).label("sla"),
        func.count().filter(and_(open_, Bug.assignee_id == user_id)).label("mine"),
    ).where(*base)).one()
    return {"open": int(row.open), "finished": int(row.finished), "critical_untriaged": int(row.untriaged),
            "sla_breached": int(row.sla), "mine": int(row.mine)}


def top_components(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, limit: int) -> list[tuple[uuid.UUID | None, int]]:
    n = func.count().label("n")
    rows = db.execute(select(Bug.component_id, n).where(*_bugs(org_id, project_id), open_clause())
                      .group_by(Bug.component_id).order_by(n.desc(), Bug.component_id.asc().nulls_last()).limit(limit))
    return [(cid, int(count)) for cid, count in rows]


def _events(org_id: uuid.UUID, project_id: uuid.UUID | None, *, finishing: bool) -> Select[Any]:
    """Status moves into a finished status (`finishing`) or out of one, as (day) rows."""
    stmt = select(_day(BugActivity.created_at).label("day"), func.count().label("n")).join(Bug, Bug.id == BugActivity.bug_id).where(
        *_bugs(org_id, project_id), BugActivity.org_id == org_id, BugActivity.kind == "status_changed")
    if finishing:
        return stmt.where(BugActivity.new_value.in_(FINISHED_STATUSES))
    return stmt.where(BugActivity.old_value.in_(FINISHED_STATUSES), BugActivity.new_value.not_in(FINISHED_STATUSES))


def daily_flow(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, start: date, end: date) -> tuple[
        dict[date, tuple[int, int, int]], int]:
    """({day: (opened, finished, reopened)} for start..end, open bugs at the end of the day before `start`).
    Opened is bugs created that day; finished and reopened are status moves into and out of Verified, Closed and Won't fix."""
    base = _bugs(org_id, project_id)
    opened = {d: int(n) for d, n in db.execute(select(_day(Bug.created_at), func.count()).where(
        *base, _day(Bug.created_at) >= start, _day(Bug.created_at) <= end).group_by(_day(Bug.created_at)))}
    in_range = (_day(BugActivity.created_at) >= start, _day(BugActivity.created_at) <= end)
    finished = {d: int(n) for d, n in db.execute(_events(org_id, project_id, finishing=True).where(*in_range)
                                                 .group_by(_day(BugActivity.created_at)))}
    reopened = {d: int(n) for d, n in db.execute(_events(org_id, project_id, finishing=False).where(*in_range)
                                                 .group_by(_day(BugActivity.created_at)))}
    before_created = int(db.scalar(select(func.count()).where(*base, _day(Bug.created_at) < start)) or 0)
    before_finished = sum(int(n) for _, n in db.execute(_events(org_id, project_id, finishing=True).where(
        _day(BugActivity.created_at) < start).group_by(_day(BugActivity.created_at))))
    before_reopened = sum(int(n) for _, n in db.execute(_events(org_id, project_id, finishing=False).where(
        _day(BugActivity.created_at) < start).group_by(_day(BugActivity.created_at))))
    days = set(opened) | set(finished) | set(reopened)
    return {d: (opened.get(d, 0), finished.get(d, 0), reopened.get(d, 0)) for d in days}, before_created - before_finished + before_reopened


def breakdown(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, start: date, end: date, now: datetime) -> dict[str, Any]:
    """Counts of the bugs created from `start` to `end` (UTC days), by status, severity, component and assignee."""
    base = [*_bugs(org_id, project_id), _day(Bug.created_at) >= start, _day(Bug.created_at) <= end]
    by_status = {s: int(n) for s, n in db.execute(select(Bug.status, func.count()).where(*base).group_by(Bug.status))}
    by_severity = {s: int(n) for s, n in db.execute(select(Bug.severity, func.count()).where(*base).group_by(Bug.severity))}
    by_component = [(cid, int(n)) for cid, n in db.execute(select(Bug.component_id, func.count()).where(*base).group_by(Bug.component_id))]
    open_ = open_clause()
    by_assignee = [(uid, int(o), int(c), int(s)) for uid, o, c, s in db.execute(select(
        Bug.assignee_id, func.count(), func.count().filter(Bug.severity == "critical"), func.count().filter(sla_breached_clause(now))
    ).where(*base, open_).group_by(Bug.assignee_id))]
    return {"by_status": by_status, "by_severity": by_severity, "by_component": by_component, "by_assignee": by_assignee}
