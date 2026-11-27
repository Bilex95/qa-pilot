"""Bug figures for the dashboard and the reports, and the CSV export (I-09; REQ-038 to REQ-041; D-064). The dashboard module composes
these with the figures of the testing and releases modules; this module owns everything that reads bugs."""

import csv
import io
import uuid
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import NotFound, Unprocessable
from app.modules.auth.application import service as auth
from app.modules.bugs.application import hooks
from app.modules.bugs.domain.filters import BugFilters
from app.modules.bugs.domain.rules import SEVERITIES, STATUSES
from app.modules.bugs.infrastructure import reporting as q
from app.modules.bugs.infrastructure import repository as repo
from app.modules.projects.application import service as projects

MAX_RANGE_DAYS = 366
CSV_PAGE = 500
CSV_MAX_ROWS = 50_000
CSV_COLUMNS = ["Key", "Title", "Status", "Severity", "Priority", "Component", "Environment", "Assignee", "Reporter", "Release", "Created",
               "Updated"]


@dataclass(frozen=True)
class TrendPoint:
    date: date
    opened: int
    closed: int
    open_total: int


def check_range(start: date, end: date) -> None:
    if end < start:
        raise Unprocessable("Some fields are not valid.", details=[{
            "loc": ["query", "to"], "msg": "The end date is before the start date."}])
    if (end - start).days > MAX_RANGE_DAYS - 1:
        raise Unprocessable("Some fields are not valid.", details=[{
            "loc": ["query", "to"], "msg": f"A range is at most {MAX_RANGE_DAYS} days."}])


def today() -> date:
    return utcnow().date()


def headline(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, user_id: uuid.UUID) -> dict[str, int]:
    return q.headline_counts(db, org_id, project_id, utcnow(), user_id)


def open_by_severity(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None) -> dict[str, int]:
    have = q.open_by_severity(db, org_id, project_id)
    return {s: have.get(s, 0) for s in SEVERITIES}


def top_components(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, limit: int = 5) -> list[tuple[str, int]]:
    rows = q.top_components(db, org_id, project_id, limit)
    names = {c.id: c.name for c in projects.get_components(db, org_id, [cid for cid, _ in rows if cid])}
    return [(names.get(cid, "No component") if cid else "No component", n) for cid, n in rows]


def trend(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, start: date, end: date, interval: str = "day") -> list[TrendPoint]:
    """One point per day (or per week, starting on Monday) from `start` to `end`. `open_total` is the number of bugs that are open at
    the end of the bucket: bugs created, minus moves into a finished status, plus moves back out of one (D-064)."""
    check_range(start, end)
    flow, open_now = q.daily_flow(db, org_id, project_id, start, end)
    points: list[TrendPoint] = []
    bucket_start = start if interval == "day" else start - timedelta(days=start.weekday())
    while bucket_start <= end:
        bucket_end = bucket_start if interval == "day" else bucket_start + timedelta(days=6)
        opened = closed = 0
        day = max(bucket_start, start)
        while day <= min(bucket_end, end):
            o, f, r = flow.get(day, (0, 0, 0))
            opened += o
            closed += f
            open_now += o - f + r
            day += timedelta(days=1)
        points.append(TrendPoint(date=bucket_start, opened=opened, closed=closed, open_total=open_now))
        bucket_start = bucket_end + timedelta(days=1)
    return points


def summary(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None, start: date, end: date) -> dict[str, object]:
    """Breakdowns of the bugs created from `start` to `end`: every status and severity (zeros included), components, and the open ones
    per assignee with an Unassigned row that is always there."""
    check_range(start, end)
    got = q.breakdown(db, org_id, project_id, start, end, utcnow())
    components = {c.id: c.name for c in projects.get_components(db, org_id, [cid for cid, _ in got["by_component"] if cid])}
    by_component = sorted(((components.get(cid, "No component") if cid else "No component", n) for cid, n in got["by_component"]),
                          key=lambda x: (-x[1], x[0].lower()))
    people = {uid: user.full_name for uid, user in auth.get_users_by_ids(db, [u for u, *_ in got["by_assignee"] if u]).items()}
    rows = {uid: (o, c, s) for uid, o, c, s in got["by_assignee"]}
    by_assignee = sorted(((uid, people.get(uid, "Former member"), *rows[uid]) for uid in rows if uid), key=lambda x: (-x[2], x[1].lower()))
    unassigned = rows.get(None, (0, 0, 0))
    return {
        "by_status": [(s, got["by_status"].get(s, 0)) for s in STATUSES],
        "by_severity": [(s, got["by_severity"].get(s, 0)) for s in SEVERITIES],
        "by_component": by_component,
        "by_assignee": by_assignee,
        "unassigned": unassigned,
    }


# CSV ------------------------------------------------------------------------

def safe_cell(value: object) -> str:
    """A cell that a spreadsheet would read as a formula (starts with =, +, -, @, a tab or a carriage return) gets a leading quote, so it
    is shown as text (OWASP CSV injection)."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def csv_rows(db: Session, org_id: uuid.UUID, filters: BugFilters) -> Iterator[str]:
    """The bugs the list filters select, newest first by the chosen sort, as CSV text in chunks (header first). At most 50,000 rows."""
    def line(cells: Sequence[object]) -> str:
        buf = io.StringIO()
        csv.writer(buf, lineterminator="\r\n").writerow([safe_cell(c) for c in cells])
        return buf.getvalue()

    yield line(CSV_COLUMNS)
    stmt = repo.bugs_query(org_id, filters, utcnow())
    sent = 0
    environments: dict[uuid.UUID, str] = {}
    while sent < CSV_MAX_ROWS:
        rows = list(db.scalars(stmt.offset(sent).limit(min(CSV_PAGE, CSV_MAX_ROWS - sent))))
        if not rows:
            return
        components = {c.id: c.name for c in projects.get_components(db, org_id, list({b.component_id for b in rows if b.component_id}))}
        people = {uid: u.full_name for uid, u in auth.get_users_by_ids(
            db, list({b.reporter_id for b in rows} | {b.assignee_id for b in rows if b.assignee_id})).items()}
        for env_id in {b.environment_id for b in rows if b.environment_id} - environments.keys():
            try:
                environments[env_id] = projects.get_environment(db, org_id, env_id).name
            except NotFound:  # a deleted environment leaves the cell empty
                environments[env_id] = ""
        releases = hooks.names_of_releases(db, org_id, list({b.release_id for b in rows if b.release_id}))
        for b in rows:
            yield line([
                b.key, b.title, b.status, b.severity, b.priority,
                components.get(b.component_id, "") if b.component_id else "",
                environments.get(b.environment_id, "") if b.environment_id else "",
                people.get(b.assignee_id, "") if b.assignee_id else "", people.get(b.reporter_id, ""),
                releases.get(b.release_id, "") if b.release_id else "", b.created_at.isoformat(), b.updated_at.isoformat()])
        sent += len(rows)
        if len(rows) < CSV_PAGE:
            return
