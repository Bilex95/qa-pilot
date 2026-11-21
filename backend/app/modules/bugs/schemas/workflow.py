from typing import Annotated

from pydantic import Field, StringConstraints

from app.core.permissions import Role
from app.core.schemas import ApiModel
from app.modules.bugs.domain.rules import Status
from app.modules.bugs.schemas.bugs import BugSummaryOut

Comment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class TransitionIn(ApiModel):
    to_status: Status
    comment: Comment | None = None  # kept in the audit event until comments exist (I-05, D-058)


class TransitionsOut(ApiModel):
    current: Status
    allowed: list[Status]  # for the caller: the moves of their role, none when the record rule refuses


class WorkflowTransitionOut(ApiModel):
    from_status: Status = Field(serialization_alias="from")  # `from` is a Python keyword: the field is renamed, the JSON is not
    to_status: Status = Field(serialization_alias="to")
    roles: list[Role]
    meaning: str


class WorkflowOut(ApiModel):
    statuses: list[Status]
    transitions: list[WorkflowTransitionOut]


class BoardColumnOut(ApiModel):
    status: Status
    total: int
    items: list[BugSummaryOut]  # the first 50, newest update first


class BoardOut(ApiModel):
    columns: list[BoardColumnOut]
