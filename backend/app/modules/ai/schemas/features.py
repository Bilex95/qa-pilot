"""AI features of I-15: bug writer (API-140), explain this log (API-141), duplicate detector (API-143). Nothing here saves anything
(REQ-049): the answers are suggestions the person accepts, edits or discards, and says so through API-148 with `usage_id`."""

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

from app.core.schemas import ApiModel
from app.modules.bugs.schemas.bugs import BugSummaryOut

Severity = Literal["critical", "high", "medium", "low"]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12_000)]
Text = Annotated[str, StringConstraints(max_length=12_000)]
Step = Annotated[str, StringConstraints(max_length=500)]


# Bug writer (AI_SPEC 3.1) ----------------------------------------------------------------------------------------------------------------

class BugDraftSuggestion(BaseModel):
    """What the model must answer. Unknown keys are ignored; the severity must be one of the four."""

    title: Annotated[str, StringConstraints(min_length=5, max_length=200)]
    description: Annotated[str, StringConstraints(max_length=4000)] = ""
    steps_to_reproduce: Annotated[list[Step], Field(min_length=1, max_length=20)]
    expected_result: Annotated[str, StringConstraints(max_length=2000)] = ""
    actual_result: Annotated[str, StringConstraints(max_length=2000)] = ""
    environment: str | None = None  # a name the server maps to an environment of the project, or drops
    component: str | None = None  # likewise for a component
    suggested_severity: Severity
    missing_information: Annotated[list[Annotated[str, StringConstraints(max_length=300)]], Field(max_length=10)] = []


class BugWriterIn(ApiModel):
    project_id: uuid.UUID
    notes: Notes
    log: Text | None = None


class BugWriterOut(ApiModel):
    title: str
    description: str
    steps_to_reproduce: list[str]
    expected_result: str
    actual_result: str
    environment: str | None
    environment_id: uuid.UUID | None  # the environment of the project the name maps to, never an invented id
    component: str | None
    component_id: uuid.UUID | None
    suggested_severity: Severity
    missing_information: list[str]
    fallback: bool  # True: the model could not help; the title is the first line of the notes and the rest is the notes
    usage_id: uuid.UUID  # for the outcome (API-148)


# Explain this log (AI_SPEC 3.2) ----------------------------------------------------------------------------------------------------------

class LogExplanationAnswer(BaseModel):
    summary: Annotated[str, StringConstraints(max_length=1000)]
    likely_cause: Annotated[str, StringConstraints(max_length=1000)] = ""
    key_lines: Annotated[list[Annotated[str, StringConstraints(max_length=300)]], Field(max_length=10)] = []
    error_type: str | None = None


class ExplainLogIn(ApiModel):
    log: Annotated[str, StringConstraints(min_length=1, max_length=200_000)]  # the server keeps the last 300 lines and 12,000 characters

    @field_validator("log")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Paste a log.")
        return value


class LogExplanationOut(ApiModel):
    summary: str
    likely_cause: str
    key_lines: list[str]
    error_type: str | None
    fallback: bool
    usage_id: uuid.UUID


# Duplicate detector (AI_SPEC 3.4) --------------------------------------------------------------------------------------------------------

class DuplicatesIn(ApiModel):
    project_id: uuid.UUID
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    actual_result: Annotated[str, StringConstraints(max_length=2000)] | None = None
    steps: Annotated[list[Step], Field(max_length=50)] | None = None
    exclude_bug_id: uuid.UUID | None = None


class DuplicateCandidateOut(ApiModel):
    bug: BugSummaryOut
    score: Annotated[float, Field(ge=0, le=1)]


class DuplicatesOut(ApiModel):
    candidates: list[DuplicateCandidateOut]
    usage_id: uuid.UUID
