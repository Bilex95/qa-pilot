"""The bug state machine (DOMAIN_MODEL section 4, D-005, D-006). Pure rules, no database.

One table says which move exists and which roles may make it: Org Admin and QA Lead may make every move, the other roles
are listed per move. A Developer may only make a move on a bug assigned to them or on a bug nobody is assigned to (the move
to In progress then assigns it to them, D-006). A Viewer makes no move.
"""

from dataclasses import dataclass
from datetime import datetime

from app.core.permissions import ADMIN, DEV, LEAD, QA, Role

LEADS_ONLY = frozenset({ADMIN, LEAD})
WITH_QA = frozenset({ADMIN, LEAD, QA})
WITH_DEV = frozenset({ADMIN, LEAD, DEV})  # DEV is Role.DEVELOPER, the assignee rule is can_move_this_bug


@dataclass(frozen=True)
class Transition:
    from_status: str
    to_status: str
    roles: frozenset[Role]
    meaning: str


TRANSITIONS: tuple[Transition, ...] = (
    Transition("new", "triaged", WITH_QA, "Severity and priority confirmed"),
    Transition("new", "wont_fix", LEADS_ONLY, "Rejected at triage"),
    Transition("triaged", "in_progress", WITH_DEV, "Work started"),
    Transition("triaged", "wont_fix", LEADS_ONLY, "Decided not to fix"),
    Transition("in_progress", "fixed", WITH_DEV, "Code fix done"),
    Transition("in_progress", "triaged", WITH_DEV, "Handed back to backlog"),
    Transition("fixed", "ready_for_retest", WITH_DEV, "Fix deployed to a test environment"),
    Transition("fixed", "reopened", WITH_QA, "Fix found not to work before deploy"),
    Transition("ready_for_retest", "verified", WITH_QA, "Retest passed"),
    Transition("ready_for_retest", "reopened", WITH_QA, "Retest failed"),
    Transition("verified", "closed", WITH_QA, "Done"),
    Transition("verified", "reopened", WITH_QA, "Regression found"),
    Transition("closed", "reopened", WITH_QA, "Came back"),
    Transition("wont_fix", "reopened", LEADS_ONLY, "Decision reversed"),
    Transition("reopened", "triaged", LEADS_ONLY, "Back to triage"),
    Transition("reopened", "in_progress", WITH_DEV, "Work restarted"),
)

# Statuses that stop the SLA clock when they are entered (`resolved_at`), and the one that records `closed_at`
RESOLVING = ("fixed", "wont_fix")


def find(from_status: str, to_status: str) -> Transition | None:
    return next((t for t in TRANSITIONS if t.from_status == from_status and t.to_status == to_status), None)


def targets_from(status: str) -> list[str]:
    """Every status a bug can move to from `status`, whoever asks (the order of the table)."""
    return [t.to_status for t in TRANSITIONS if t.from_status == status]


def can_move_this_bug(role: Role, *, assignee_is_me: bool, unassigned: bool) -> bool:
    """The record rule on top of the table: a Developer only moves a bug assigned to them or unassigned (D-006)."""
    if role is Role.VIEWER:
        return False
    if role is Role.DEVELOPER:
        return assignee_is_me or unassigned
    return True


def allowed_targets(status: str, role: Role, *, assignee_is_me: bool, unassigned: bool) -> list[str]:
    """What this person may do with a bug in `status`: the moves of the table their role has, none when the record rule
    refuses (a Developer and a bug assigned to someone else)."""
    if not can_move_this_bug(role, assignee_is_me=assignee_is_me, unassigned=unassigned):
        return []
    return [t.to_status for t in TRANSITIONS if t.from_status == status and role in t.roles]


def effects_of(to_status: str, now: datetime) -> dict[str, datetime | None]:
    """The columns a move changes besides `status` and `status_changed_at`, as {column: new value}; a column that is not in
    the result keeps its value. resolved_at is set on entering Fixed or Won't fix and cleared on Reopened; closed_at is set on
    Closed and cleared on Reopened (DOMAIN_MODEL section 4)."""
    if to_status in RESOLVING:
        return {"resolved_at": now}
    if to_status == "closed":
        return {"closed_at": now}
    if to_status == "reopened":
        return {"resolved_at": None, "closed_at": None}
    return {}
