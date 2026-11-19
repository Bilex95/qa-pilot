"""Extension points other modules register with, so projects never imports them (no circular imports, no
cross module repository access). Bugs (I-03) registers bug counts and the component unlink; testing (I-07)
registers the environment in use check."""

import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

# (db, org_id, project_ids) -> {project_id: open bug count}
OpenBugsByProject = Callable[[Session, uuid.UUID, list[uuid.UUID]], dict[uuid.UUID, int]]
# (db, org_id, component_ids) -> {component_id: open bug count}
OpenBugsByComponent = Callable[[Session, uuid.UUID, list[uuid.UUID]], dict[uuid.UUID, int]]
# (db, org_id, label_ids) -> {label_id: bug count}. Bugs (I-03) registers the real count; until then it is 0
LabelBugCounts = Callable[[Session, uuid.UUID, list[uuid.UUID]], dict[uuid.UUID, int]]
# (db, org_id, component_id) -> None, called before a component is deleted
ComponentDeleted = Callable[[Session, uuid.UUID, uuid.UUID], None]
# (db, org_id, environment_id) -> True when something still references the environment
EnvironmentInUse = Callable[[Session, uuid.UUID, uuid.UUID], bool]

open_bugs_by_project: list[OpenBugsByProject] = []
open_bugs_by_component: list[OpenBugsByComponent] = []
label_bug_counts: list[LabelBugCounts] = []
on_component_deleted: list[ComponentDeleted] = []
environment_in_use: list[EnvironmentInUse] = []


def count(hooks: list[OpenBugsByProject] | list[OpenBugsByComponent] | list[LabelBugCounts], db: Session, org_id: uuid.UUID,
          ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    totals: dict[uuid.UUID, int] = {}
    for hook in hooks:
        for key, value in hook(db, org_id, ids).items():
            totals[key] = totals.get(key, 0) + value
    return totals
