import uuid
from typing import Annotated

from pydantic import StringConstraints

from app.core.schemas import ApiModel
from app.modules.projects.domain.rules import DEFAULT_LABEL_COLOR, LabelColor

# Trimmed before the length check and before the uniqueness check, so " Regression " clashes with "regression"
LabelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class LabelIn(ApiModel):
    name: LabelName
    color: LabelColor = DEFAULT_LABEL_COLOR


class LabelOut(ApiModel):
    id: uuid.UUID
    name: str
    color: str
    bug_count: int = 0
