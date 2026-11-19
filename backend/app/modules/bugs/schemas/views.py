import uuid
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.core.schemas import ApiModel
from app.modules.bugs.domain.rules import SORT_FIELDS, Priority, Severity, Status

ViewName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
SortValue = Annotated[str, StringConstraints(pattern=rf"^-?({'|'.join(SORT_FIELDS)})$")]

class SavedViewFilters(ApiModel):
    """The stored filter set: the same keys as the list endpoint, plus a version number. Unknown keys are a 422.
    When a stored filter changes meaning, add version 2 to the Literal and a reader that upgrades version 1 rows."""

    version: Literal[1] = 1
    project_id: uuid.UUID | None = None
    status: list[Status] = Field(default_factory=list, max_length=9)
    severity: list[Severity] = Field(default_factory=list, max_length=4)
    priority: list[Priority] = Field(default_factory=list, max_length=4)
    assignee_id: uuid.UUID | None = None
    reporter_id: uuid.UUID | None = None
    component_id: uuid.UUID | None = None
    environment_id: uuid.UUID | None = None
    label_id: uuid.UUID | None = None
    release_id: uuid.UUID | None = None
    sla_breached: bool | None = None
    open: bool | None = None
    q: Annotated[str, StringConstraints(max_length=200)] | None = None
    sort: SortValue = "-updated_at"


class SavedViewIn(ApiModel):
    name: ViewName
    filters: SavedViewFilters


class SavedViewOut(ApiModel):
    id: uuid.UUID
    name: str
    filters: SavedViewFilters
