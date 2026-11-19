"""The list filter set (API-060). One shape is used by the endpoint, the repository query and saved views (D-017)."""

import uuid
from dataclasses import dataclass, field


@dataclass(frozen=True)
class BugFilters:
    project_id: uuid.UUID | None = None
    status: list[str] = field(default_factory=list)
    severity: list[str] = field(default_factory=list)
    priority: list[str] = field(default_factory=list)
    assignee_id: uuid.UUID | None = None
    reporter_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    environment_id: uuid.UUID | None = None
    label_id: uuid.UUID | None = None
    release_id: uuid.UUID | None = None
    sla_breached: bool | None = None
    open: bool | None = None  # True: only open bugs, False: only finished ones (the shared definition)
    q: str | None = None
    sort: str = "-updated_at"
