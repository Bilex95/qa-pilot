import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.core.schemas import ApiModel
from app.modules.testing.domain.rules import (
    MAX_BULK_CASES,
    MAX_STEPS,
    MAX_TAG_LENGTH,
    MAX_TAGS,
    MIN_STEPS,
    CaseType,
    Priority,
    normalise_tags,
)

SuiteName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
SuiteDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
CaseTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Preconditions = Annotated[str, StringConstraints(max_length=2000)]
StepText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_TAG_LENGTH)]
Tags = Annotated[list[Tag], Field(max_length=MAX_TAGS)]


# Suites -------------------------------------------------------------------

class SuiteIn(ApiModel):
    project_id: uuid.UUID
    name: SuiteName
    description: SuiteDescription = ""
    component_id: uuid.UUID | None = None


class SuiteUpdateIn(ApiModel):
    """Only the fields that are sent change. `component_id: null` clears the component."""

    name: SuiteName | None = None
    description: SuiteDescription | None = None
    component_id: uuid.UUID | None = None

    @field_validator("name", "description", mode="before")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be cleared.")
        return value


class SuiteOut(ApiModel):
    id: uuid.UUID
    name: str
    project_id: uuid.UUID
    description: str
    component_id: uuid.UUID | None
    component: str | None
    case_count: int
    last_run_pass_rate: float | None
    created_at: datetime
    updated_at: datetime


# Cases --------------------------------------------------------------------

class StepIn(ApiModel):
    """A step. Send the `id` of an existing step to keep it when steps are reordered; steps without one get a new id."""

    id: uuid.UUID | None = None
    action: StepText
    expected: StepText


class StepOut(ApiModel):
    id: uuid.UUID
    action: str
    expected: str


def _check_steps(steps: list[StepIn]) -> list[StepIn]:
    ids = [s.id for s in steps if s.id is not None]
    if len(ids) != len(set(ids)):
        raise ValueError("Step ids must be different from each other.")
    return steps


Steps = Annotated[list[StepIn], Field(min_length=MIN_STEPS, max_length=MAX_STEPS)]


class CaseIn(ApiModel):
    title: CaseTitle
    preconditions: Preconditions = ""
    steps: Steps
    tags: Tags = Field(default_factory=list)
    priority: Priority = "p3"
    case_type: CaseType = "positive"
    ai_generated: bool = False  # set by the generator (I-17) when cases come from AI

    @field_validator("steps")
    @classmethod
    def _unique_step_ids(cls, steps: list[StepIn]) -> list[StepIn]:
        return _check_steps(steps)

    @field_validator("tags")
    @classmethod
    def _normalise(cls, tags: list[str]) -> list[str]:
        return normalise_tags(tags)


class CaseUpdateIn(ApiModel):
    """Only the fields that are sent change. A case moves to another suite of the same project with `suite_id`."""

    title: CaseTitle | None = None
    preconditions: Preconditions | None = None
    steps: Steps | None = None
    tags: Tags | None = None
    priority: Priority | None = None
    case_type: CaseType | None = None
    suite_id: uuid.UUID | None = None

    @model_validator(mode="before")
    @classmethod
    def _no_nulls(cls, data: object) -> object:
        if isinstance(data, dict):
            for key, value in data.items():
                if value is None:
                    raise ValueError(f"{key} cannot be cleared.")
        return data

    @field_validator("steps")
    @classmethod
    def _unique_step_ids(cls, steps: list[StepIn] | None) -> list[StepIn] | None:
        return _check_steps(steps) if steps is not None else steps

    @field_validator("tags")
    @classmethod
    def _normalise(cls, tags: list[str] | None) -> list[str] | None:
        return normalise_tags(tags) if tags is not None else tags


class CaseSummaryOut(ApiModel):
    id: uuid.UUID
    key: str
    number: int
    suite_id: uuid.UUID
    title: str
    priority: Priority
    case_type: CaseType
    tags: list[str]
    step_count: int
    ai_generated: bool
    updated_at: datetime


class CaseOut(CaseSummaryOut):
    project_id: uuid.UUID
    preconditions: str
    steps: list[StepOut]
    created_at: datetime


class BulkCasesIn(ApiModel):
    cases: Annotated[list[CaseIn], Field(min_length=1, max_length=MAX_BULK_CASES)]
    ai_usage_id: uuid.UUID | None = None


class BulkCasesOut(ApiModel):
    created: list[CaseOut]
