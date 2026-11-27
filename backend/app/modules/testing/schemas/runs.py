"""Test runs and their results (API-101 to API-106, I-07)."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import ConfigDict, Field, StringConstraints, field_validator

from app.core.schemas import ApiModel
from app.modules.testing.domain.rules import MAX_CASES_PER_RUN, RunResult, RunStatus
from app.modules.testing.schemas.testing import StepOut

RunName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
ActualResult = Annotated[str, StringConstraints(max_length=5000)]
Note = Annotated[str, StringConstraints(max_length=2000)]


class RunCountsOut(ApiModel):
    """`pass` is a Python keyword, so the field is `pass_` here and `pass` in the JSON."""

    model_config = ConfigDict(from_attributes=True, extra="forbid", populate_by_name=True)

    pass_: int = Field(alias="pass")
    fail: int
    blocked: int
    skipped: int
    untested: int


class RunSummaryOut(ApiModel):
    id: uuid.UUID
    key: str
    number: int
    name: str
    project_id: uuid.UUID
    status: RunStatus
    environment_id: uuid.UUID | None
    environment: str | None
    release_id: uuid.UUID | None
    release_name: str | None
    counts: RunCountsOut
    total: int
    pass_rate: int | None
    created_by_id: uuid.UUID
    created_by_name: str
    started_at: datetime
    completed_at: datetime | None


class BugRefOut(ApiModel):
    id: uuid.UUID
    key: str


class RunResultOut(ApiModel):
    id: uuid.UUID
    case_id: uuid.UUID
    case_key: str
    case_title: str
    position: int
    preconditions: str
    steps: list[StepOut]
    result: RunResult
    failed_step_index: int | None
    actual_result: str
    note: str
    executed_by_id: uuid.UUID | None
    executed_by_name: str | None
    executed_at: datetime | None
    bugs: list[BugRefOut]


class RunOut(RunSummaryOut):
    results: list[RunResultOut]


class RunCreateIn(ApiModel):
    """The cases of the run are every case of `suite_ids` plus every case of `case_ids`, each once."""

    project_id: uuid.UUID
    name: RunName
    environment_id: uuid.UUID | None = None
    release_id: uuid.UUID | None = None
    suite_ids: Annotated[list[uuid.UUID], Field(max_length=50)] = Field(default_factory=list)
    case_ids: Annotated[list[uuid.UUID], Field(max_length=MAX_CASES_PER_RUN)] = Field(default_factory=list)


class RunUpdateIn(ApiModel):
    """Only the fields that are sent change. `status: completed` ends the run (it cannot be reopened). `release_id: null` unlinks."""

    name: RunName | None = None
    status: Literal["completed"] | None = None
    release_id: uuid.UUID | None = None

    @field_validator("name", "status", mode="before")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be cleared.")
        return value


class ResultUpdateIn(ApiModel):
    """`failed_step_index` (from 0) and `actual_result` only go with `fail`; any other result clears them."""

    result: RunResult
    failed_step_index: Annotated[int, Field(ge=0, le=49)] | None = None
    actual_result: ActualResult | None = None
    note: Note | None = None


class BugDraftOut(ApiModel):
    """What the New bug form is filled with (the same fields as API-061); nothing is saved by asking for it."""

    project_id: uuid.UUID
    title: str
    steps_to_reproduce: list[str]
    expected_result: str
    actual_result: str
    environment_id: uuid.UUID | None
    component_id: uuid.UUID | None
    release_id: uuid.UUID | None
    source_run_result_id: uuid.UUID
    case_key: str
    run_key: str
