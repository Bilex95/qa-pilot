import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.core.schemas import ApiModel

ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
ProjectKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=6)]
Description = Annotated[str, StringConstraints(max_length=1000)]
ComponentName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
ComponentDescription = Annotated[str, StringConstraints(max_length=500)]
EnvironmentName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]


class ProjectCreateIn(ApiModel):
    name: ProjectName
    key: ProjectKey = Field(description="2 to 6 letters; stored in capitals and used in bug ids such as WEB-42")
    description: Description = ""


class ProjectUpdateIn(ApiModel):
    name: ProjectName | None = None
    description: Description | None = None
    archived: bool | None = None


class ProjectOut(ApiModel):
    id: uuid.UUID
    name: str
    key: str
    description: str
    archived_at: datetime | None
    open_bug_count: int = 0
    created_at: datetime


class ComponentIn(ApiModel):
    name: ComponentName
    description: ComponentDescription = ""


class ComponentUpdateIn(ApiModel):
    name: ComponentName | None = None
    description: ComponentDescription | None = None


class ComponentOut(ApiModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str
    open_bug_count: int = 0


class EnvironmentIn(ApiModel):
    name: EnvironmentName


class EnvironmentUpdateIn(ApiModel):
    name: EnvironmentName | None = None
    sort_order: Annotated[int, Field(ge=0, le=1000)] | None = None


class EnvironmentOut(ApiModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    sort_order: int


class ProjectDetailOut(ProjectOut):
    components: list[ComponentOut]
    environments: list[EnvironmentOut]
