"""Release vocabulary and rules that do not touch the database (DOMAIN_MODEL 1.5 and section 5, D-014, D-015)."""

from typing import Literal

ReleaseStatus = Literal["planned", "in_progress", "released"]
RELEASE_STATUSES: tuple[str, ...] = ("planned", "in_progress", "released")
MAX_LINKS_PER_REQUEST = 100


def can_move(current: str, wanted: str) -> bool:
    """A release only moves forward: planned, then in progress, then released (a QA Lead may skip a step)."""
    return RELEASE_STATUSES.index(wanted) > RELEASE_STATUSES.index(current)
