"""AI features of I-15: bug writer (API-140), explain this log (API-141), duplicate detector (API-143). Nothing here saves anything
(REQ-049): the answers are suggestions the person accepts, edits or discards, and says so through API-148 with `usage_id`."""

import uuid
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator, model_validator

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


# Triage (AI_SPEC 3.3) ---------------------------------------------------------------------------------------------------------------------

Priority = Literal["p1", "p2", "p3", "p4"]


class TriageAnswer(BaseModel):
    severity: Severity
    priority: Priority
    component: str | None = None  # a name the server maps to a component of the project, or drops
    reason: Annotated[str, StringConstraints(min_length=10, max_length=600)]
    confidence: Literal["low", "medium", "high"]


class TriageIn(ApiModel):
    """Either an existing bug (`bug_id`, nothing else) or the fields of a bug that is not saved yet (`project_id` and `title` at least)."""

    bug_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)] | None = None
    description: Annotated[str, StringConstraints(max_length=4000)] | None = None
    steps: Annotated[list[Step], Field(max_length=50)] | None = None
    actual_result: Annotated[str, StringConstraints(max_length=2000)] | None = None
    environment_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _one_or_the_other(self) -> "TriageIn":
        if self.bug_id is not None:
            others = (self.project_id, self.title, self.description, self.steps, self.actual_result, self.environment_id)
            if any(v is not None for v in others):
                raise ValueError("Send either bug_id or the fields of a new bug, not both.")
        elif self.project_id is None or self.title is None:
            raise ValueError("Send bug_id, or project_id and title.")
        return self


class TriageOut(ApiModel):
    severity: Severity | None  # all four are empty when `fallback` is true: no suggestion
    priority: Priority | None
    component: str | None
    component_id: uuid.UUID | None  # a component of the project, never an invented id
    reason: str
    confidence: Literal["low", "medium", "high"] | None
    fallback: bool
    usage_id: uuid.UUID


# Test case generator (AI_SPEC 3.5) -------------------------------------------------------------------------------------------------------

CaseKind = Literal["positive", "negative", "edge"]
Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class GeneratedStep(BaseModel):
    action: Line
    expected: Line


class GeneratedCase(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
    case_type: CaseKind
    preconditions: Annotated[str, StringConstraints(max_length=1000)] = ""
    steps: Annotated[list[GeneratedStep], Field(min_length=1, max_length=15)]
    priority: Priority = "p3"
    tags: Annotated[list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]], Field(max_length=5)] = []


class GeneratedTestCases(BaseModel):
    """What the model must answer. The rule "one case of each type when 3 or more were asked" is checked by the feature."""

    cases: Annotated[list[GeneratedCase], Field(min_length=1, max_length=15)]
    coverage_notes: Annotated[str, StringConstraints(max_length=1000)] = ""


class GenerateCasesIn(ApiModel):
    project_id: uuid.UUID
    story: Annotated[str, StringConstraints(strip_whitespace=True, min_length=20, max_length=12_000)]
    count: Annotated[int, Field(ge=3, le=15)] = 8


class GeneratedStepOut(ApiModel):
    action: str
    expected: str


class GeneratedCaseOut(ApiModel):
    title: str
    case_type: CaseKind
    preconditions: str
    steps: list[GeneratedStepOut]
    priority: Priority
    tags: list[str]


class GenerateCasesOut(ApiModel):
    cases: list[GeneratedCaseOut]  # empty when `fallback` is true
    coverage_notes: str
    fallback: bool
    usage_id: uuid.UUID


# Release readiness summary (AI_SPEC 3.6) -------------------------------------------------------------------------------------------------

Risk = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class ReleaseSummaryAnswer(BaseModel):
    """What the model must answer. That a blocked release is not recommended for shipping is checked by the feature."""

    headline: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    summary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1500)]
    top_risks: Annotated[list[Risk], Field(max_length=5)] = []
    recommendation: Literal["ship", "ship_with_caution", "do_not_ship"]


class ReleaseSummaryIn(ApiModel):
    release_id: uuid.UUID


class ReleaseSummarySuggestion(ApiModel):
    headline: str
    summary: str
    top_risks: list[str]
    recommendation: Literal["ship", "ship_with_caution", "do_not_ship"]
    readiness: Literal["ready", "at_risk", "blocked"]  # the readiness the summary was written for
    fallback: bool  # true when the text is the template, not the model's
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
