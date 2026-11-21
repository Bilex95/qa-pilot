import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator

from app.core.schemas import ApiModel
from app.modules.bugs.domain.rules import Priority, Severity, Status

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
LongText = Annotated[str, StringConstraints(max_length=20000)]
ResultText = Annotated[str, StringConstraints(max_length=5000)]
Step = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
Steps = Annotated[list[Step], Field(max_length=50)]
LabelIds = Annotated[list[uuid.UUID], Field(max_length=20)]


class LabelRef(ApiModel):
    id: uuid.UUID
    name: str
    color: str


class BugSummaryOut(ApiModel):
    id: uuid.UUID
    key: str
    number: int
    project_id: uuid.UUID
    title: str
    status: Status
    severity: Severity
    priority: Priority
    component_id: uuid.UUID | None
    environment_id: uuid.UUID | None
    reporter_id: uuid.UUID
    reporter_name: str
    assignee_id: uuid.UUID | None
    assignee_name: str | None
    release_id: uuid.UUID | None
    labels: list[LabelRef]
    sla_breached: bool
    created_at: datetime
    updated_at: datetime


class BugOut(BugSummaryOut):
    description: str
    steps_to_reproduce: list[str]
    expected_result: str
    actual_result: str
    source_run_result_id: uuid.UUID | None
    ai_assisted: bool
    status_changed_at: datetime
    resolved_at: datetime | None
    closed_at: datetime | None
    comment_count: int  # comments that are not deleted (REQ-018)
    attachment_count: int


class BugCreateIn(ApiModel):
    project_id: uuid.UUID
    title: Title
    description: LongText = ""
    steps_to_reproduce: Steps = Field(default_factory=list)
    expected_result: ResultText = ""
    actual_result: ResultText = ""
    severity: Severity | None = None  # Developers may not send it (D-032)
    priority: Priority | None = None
    component_id: uuid.UUID | None = None
    environment_id: uuid.UUID | None = None
    label_ids: LabelIds = Field(default_factory=list)
    assignee_id: uuid.UUID | None = None
    release_id: uuid.UUID | None = None
    source_run_result_id: uuid.UUID | None = None
    ai_assisted: bool = False


class BugUpdateIn(ApiModel):
    """Only the fields that are sent change. A field that is sent as null is cleared where that makes sense
    (component, environment, release, assignee) and is a 422 otherwise."""

    title: Title | None = None
    description: LongText | None = None
    steps_to_reproduce: Steps | None = None
    expected_result: ResultText | None = None
    actual_result: ResultText | None = None
    severity: Severity | None = None
    priority: Priority | None = None
    component_id: uuid.UUID | None = None
    environment_id: uuid.UUID | None = None
    label_ids: LabelIds | None = None
    assignee_id: uuid.UUID | None = None
    release_id: uuid.UUID | None = None

    @field_validator("title", "description", "steps_to_reproduce", "expected_result", "actual_result", "severity",
                     "priority", "label_ids", mode="before")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be cleared.")
        return value
