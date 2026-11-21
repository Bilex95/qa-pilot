"""Bug persistence. Every query takes org_id (NFR-TEN-02) and hides soft deleted bugs (D-016) unless it says otherwise."""

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, Interval, Select, and_, case, delete, exists, func, literal, or_, select
from sqlalchemy.orm import Session

from app.modules.bugs.domain.filters import BugFilters
from app.modules.bugs.domain.rules import FINISHED_STATUSES, SLA_HOURS, SLA_STOPPED_STATUSES
from app.modules.bugs.infrastructure.models import Bug, BugLabel, SavedView

# Shared definitions -------------------------------------------------------


def open_clause() -> ColumnElement[bool]:
    """THE definition of an open bug: not soft deleted and not Verified, Closed or Won't fix. The counters, the list filter
    and (later) the dashboard all take it from here. The SLA clock rules are separate (`sla_breached_clause`)."""
    return and_(Bug.deleted_at.is_(None), Bug.status.not_in(FINISHED_STATUSES))


def sla_breached_clause(now: datetime) -> ColumnElement[bool]:
    """D-019: time from creation to Fixed (or Won't fix) against the threshold of the bug's current severity. A bug whose
    clock is still running (including a reopened one) is measured up to `now`."""
    stopped = and_(Bug.status.in_(SLA_STOPPED_STATUSES), Bug.resolved_at.is_not(None))
    end = case((stopped, Bug.resolved_at), else_=literal(now))
    threshold = case(*[(Bug.severity == sev, literal(timedelta(hours=hours), Interval)) for sev, hours in SLA_HOURS.items()],
                     else_=literal(timedelta(hours=SLA_HOURS["low"]), Interval))
    return end - Bug.created_at > threshold


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# Queries ------------------------------------------------------------------

def bugs_query(org_id: uuid.UUID, f: BugFilters, now: datetime) -> Select[Bug]:
    stmt = select(Bug).where(Bug.org_id == org_id, Bug.deleted_at.is_(None))
    if f.project_id:
        stmt = stmt.where(Bug.project_id == f.project_id)
    if f.status:
        stmt = stmt.where(Bug.status.in_(f.status))
    if f.severity:
        stmt = stmt.where(Bug.severity.in_(f.severity))
    if f.priority:
        stmt = stmt.where(Bug.priority.in_(f.priority))
    if f.assignee_id:
        stmt = stmt.where(Bug.assignee_id == f.assignee_id)
    if f.unassigned is True:
        stmt = stmt.where(Bug.assignee_id.is_(None))
    elif f.unassigned is False:
        stmt = stmt.where(Bug.assignee_id.is_not(None))
    if f.reporter_id:
        stmt = stmt.where(Bug.reporter_id == f.reporter_id)
    if f.component_id:
        stmt = stmt.where(Bug.component_id == f.component_id)
    if f.environment_id:
        stmt = stmt.where(Bug.environment_id == f.environment_id)
    if f.release_id:
        stmt = stmt.where(Bug.release_id == f.release_id)
    if f.label_id:
        stmt = stmt.where(exists().where(BugLabel.bug_id == Bug.id, BugLabel.label_id == f.label_id))
    if f.open is True:
        stmt = stmt.where(open_clause())
    elif f.open is False:
        stmt = stmt.where(Bug.status.in_(FINISHED_STATUSES))
    if f.sla_breached is True:
        stmt = stmt.where(sla_breached_clause(now))
    elif f.sla_breached is False:
        stmt = stmt.where(~sla_breached_clause(now))
    if f.q and f.q.strip():
        pattern = f"%{_escape_like(f.q.strip())}%"
        stmt = stmt.where(or_(Bug.key.ilike(pattern, escape="\\"), Bug.title.ilike(pattern, escape="\\"),
                              Bug.description.ilike(pattern, escape="\\")))
    return stmt.order_by(*_order(f.sort), Bug.id)


def board_rows(db: Session, org_id: uuid.UUID, f: BugFilters, now: datetime,
               per_column: int) -> tuple[dict[str, int], list[Bug]]:
    """The board in two queries: how many bugs each status has, and the `per_column` most recently updated of each (a window
    function ranks the bugs inside their status). The status filter is ignored; every other filter applies."""
    base = bugs_query(org_id, BugFilters(**{**f.__dict__, "status": []}), now).order_by(None)
    every = base.subquery()
    counts: dict[str, int] = {status: int(n) for status, n in db.execute(
        select(every.c.status, func.count()).group_by(every.c.status)).all()}
    ranked = base.with_only_columns(
        Bug.id.label("id"),
        func.row_number().over(partition_by=Bug.status, order_by=(Bug.updated_at.desc(), Bug.id)).label("rn"),
    ).subquery()
    rows = db.scalars(select(Bug).join(ranked, ranked.c.id == Bug.id).where(ranked.c.rn <= per_column)
                      .order_by(Bug.status, ranked.c.rn))
    return counts, list(rows)


def _order(sort: str) -> list[ColumnElement[object]]:
    desc = sort.startswith("-")
    field = sort.lstrip("-")
    column: Any
    if field == "severity":  # critical first when ascending
        column = case({"critical": 1, "high": 2, "medium": 3, "low": 4}, value=Bug.severity, else_=5)
    else:
        column = {"updated_at": Bug.updated_at, "created_at": Bug.created_at, "priority": Bug.priority}[field]
    return [column.desc() if desc else column.asc()]


def get_bug(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID, *, lock: bool = False) -> Bug | None:
    stmt = select(Bug).where(Bug.org_id == org_id, Bug.id == bug_id, Bug.deleted_at.is_(None))
    return db.scalar(stmt.with_for_update() if lock else stmt)


def get_bug_by_key(db: Session, org_id: uuid.UUID, key: str) -> Bug | None:
    return db.scalar(select(Bug).where(Bug.org_id == org_id, Bug.key == key, Bug.deleted_at.is_(None)))


def label_ids_by_bug(db: Session, bug_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[uuid.UUID]]:
    result: dict[uuid.UUID, list[uuid.UUID]] = {bug_id: [] for bug_id in bug_ids}
    if bug_ids:
        for bug_id, label_id in db.execute(select(BugLabel.bug_id, BugLabel.label_id).where(BugLabel.bug_id.in_(bug_ids))):
            result[bug_id].append(label_id)
    return result


def replace_labels(db: Session, org_id: uuid.UUID, bug_id: uuid.UUID, label_ids: list[uuid.UUID]) -> None:
    db.execute(delete(BugLabel).where(BugLabel.bug_id == bug_id))
    for label_id in label_ids:
        db.add(BugLabel(bug_id=bug_id, label_id=label_id, org_id=org_id))


# Counters for the projects module hooks ------------------------------------

def label_bug_counts(db: Session, org_id: uuid.UUID, label_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    """Bugs tagged with each label, whatever their status (a label delete takes it off all of them); soft deleted bugs
    are not counted."""
    if not label_ids:
        return {}
    rows = db.execute(
        select(BugLabel.label_id, func.count()).join(Bug, Bug.id == BugLabel.bug_id)
        .where(Bug.org_id == org_id, Bug.deleted_at.is_(None), BugLabel.label_id.in_(label_ids))
        .group_by(BugLabel.label_id))
    return {label_id: int(n) for label_id, n in rows}


def open_counts_by_project(db: Session, org_id: uuid.UUID, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not project_ids:
        return {}
    rows = db.execute(select(Bug.project_id, func.count()).where(
        Bug.org_id == org_id, Bug.project_id.in_(project_ids), open_clause()).group_by(Bug.project_id))
    return {project_id: int(n) for project_id, n in rows}


def open_counts_by_component(db: Session, org_id: uuid.UUID, component_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not component_ids:
        return {}
    rows = db.execute(select(Bug.component_id, func.count()).where(
        Bug.org_id == org_id, Bug.component_id.in_(component_ids), open_clause()).group_by(Bug.component_id))
    return {component_id: int(n) for component_id, n in rows if component_id is not None}


# Saved views --------------------------------------------------------------

def saved_views(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> list[SavedView]:
    return list(db.scalars(select(SavedView).where(SavedView.org_id == org_id, SavedView.user_id == user_id)
                           .order_by(func.lower(SavedView.name), SavedView.id)))


def get_saved_view(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, view_id: uuid.UUID) -> SavedView | None:
    return db.scalar(select(SavedView).where(
        SavedView.org_id == org_id, SavedView.user_id == user_id, SavedView.id == view_id))


def saved_view_name_taken(db: Session, org_id: uuid.UUID, user_id: uuid.UUID, name: str) -> bool:
    return db.scalar(select(func.count()).select_from(SavedView).where(
        SavedView.org_id == org_id, SavedView.user_id == user_id, func.lower(SavedView.name) == name.lower())) != 0
