"""Extension points other modules register with, so bugs never imports them. Releases (I-08) registers the release check
and testing (I-07) the run result check and the run result info. Until a module registers, ids from it are refused with a 422."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy.orm import Session

# (db, org_id, project_id, release_id) -> True when the release exists in the org and belongs to the project
ReleaseExists = Callable[[Session, uuid.UUID, uuid.UUID, uuid.UUID], bool]
# (db, org_id, project_id, run_result_id) -> True when the run result exists in the org and belongs to the project
RunResultExists = Callable[[Session, uuid.UUID, uuid.UUID, uuid.UUID], bool]


@dataclass(frozen=True)
class SourceRun:
    """Where a bug was found: the run, the case and the result row (shown as a link on the bug detail)."""

    run_id: uuid.UUID
    run_key: str
    run_name: str
    case_key: str


# (db, org_id, run_result_id) -> the run the result belongs to, or None
RunResultInfo = Callable[[Session, uuid.UUID, uuid.UUID], SourceRun | None]

# (db, org_id, release_ids) -> {release id: name} for the releases that exist (registered by the releases module, I-08)
ReleaseNames = Callable[[Session, uuid.UUID, list[uuid.UUID]], dict[uuid.UUID, str]]

release_exists: list[ReleaseExists] = []
run_result_exists: list[RunResultExists] = []
run_result_info: list[RunResultInfo] = []
release_names: list[ReleaseNames] = []


def names_of_releases(db: Session, org_id: uuid.UUID, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    found: dict[uuid.UUID, str] = {}
    for lookup in release_names:
        found.update(lookup(db, org_id, ids))
    return found


def any_accepts(checks: list[ReleaseExists] | list[RunResultExists], db: Session, org_id: uuid.UUID, project_id: uuid.UUID,
                ref_id: uuid.UUID) -> bool:
    return any(check(db, org_id, project_id, ref_id) for check in checks)


def source_run(db: Session, org_id: uuid.UUID, run_result_id: uuid.UUID) -> SourceRun | None:
    for info in run_result_info:
        found = info(db, org_id, run_result_id)
        if found is not None:
            return found
    return None
