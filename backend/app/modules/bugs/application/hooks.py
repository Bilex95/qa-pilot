"""Extension points other modules register with, so bugs never imports them. Releases (I-08) registers the release check
and testing (I-07) the run result check. Until a module registers, ids from it are refused with a 422."""

import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

# (db, org_id, project_id, release_id) -> True when the release exists in the org and belongs to the project
ReleaseExists = Callable[[Session, uuid.UUID, uuid.UUID, uuid.UUID], bool]
# (db, org_id, project_id, run_result_id) -> True when the run result exists in the org and belongs to the project
RunResultExists = Callable[[Session, uuid.UUID, uuid.UUID, uuid.UUID], bool]

release_exists: list[ReleaseExists] = []
run_result_exists: list[RunResultExists] = []


def any_accepts(checks: list[ReleaseExists] | list[RunResultExists], db: Session, org_id: uuid.UUID, project_id: uuid.UUID,
                ref_id: uuid.UUID) -> bool:
    return any(check(db, org_id, project_id, ref_id) for check in checks)
