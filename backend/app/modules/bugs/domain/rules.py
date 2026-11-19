"""Bug vocabulary and rules that do not touch the database (DOMAIN_MODEL sections 3 and 4, D-005, D-019, D-032)."""

from datetime import datetime, timedelta
from typing import Literal

Status = Literal["new", "triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed", "reopened", "wont_fix"]
Severity = Literal["critical", "high", "medium", "low"]
Priority = Literal["p1", "p2", "p3", "p4"]

# Stored as text with a check constraint (not a native enum), so a new status needs no type change. All nine exist now
# so the workflow in I-04 needs no schema change.
STATUSES: tuple[str, ...] = ("new", "triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed",
                             "reopened", "wont_fix")
SEVERITIES: tuple[str, ...] = ("critical", "high", "medium", "low")
PRIORITIES: tuple[str, ...] = ("p1", "p2", "p3", "p4")

DEFAULT_STATUS = "new"
DEFAULT_SEVERITY = "medium"  # forced for Developers (D-032)
DEFAULT_PRIORITY = "p3"

# Open means not finished: every status except these three (product owner, I-03). Fixed and Ready for retest still
# count as open. The query form of this rule lives in infrastructure/repository.py (`open_clause`), the single place
# the counters, the list filter and later the dashboard take it from.
FINISHED_STATUSES: tuple[str, ...] = ("verified", "closed", "wont_fix")
OPEN_STATUSES: tuple[str, ...] = tuple(s for s in STATUSES if s not in FINISHED_STATUSES)


def is_open(status: str) -> bool:
    return status not in FINISHED_STATUSES


# SLA (D-019). Separate from "open": the clock is about reaching Fixed, not about being finished.
SLA_HOURS: dict[str, int] = {"critical": 24, "high": 72, "medium": 14 * 24, "low": 30 * 24}
# Statuses where the clock has stopped at `resolved_at`. Won't fix stops it too. Reopened is not here: it restarts the
# clock from the original creation time.
SLA_STOPPED_STATUSES: tuple[str, ...] = ("fixed", "ready_for_retest", "verified", "closed", "wont_fix")


def sla_breached(severity: str, status: str, created_at: datetime, resolved_at: datetime | None, now: datetime) -> bool:
    """Python form of the SQL expression in the repository; a test keeps the two in agreement."""
    stopped = status in SLA_STOPPED_STATUSES and resolved_at is not None
    end = resolved_at if stopped and resolved_at is not None else now
    return end - created_at > timedelta(hours=SLA_HOURS[severity])


SORT_FIELDS: tuple[str, ...] = ("updated_at", "created_at", "severity", "priority")
