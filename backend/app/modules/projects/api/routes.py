"""Projects, components and environments: API-040 to API-051 (I-01)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import DB, OrgContext, require
from app.core.errors import Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.schemas import errors
from app.modules.projects.application import service
from app.modules.projects.infrastructure.models import Component, Project
from app.modules.projects.schemas.projects import (
    ComponentIn,
    ComponentOut,
    ComponentUpdateIn,
    EnvironmentIn,
    EnvironmentOut,
    EnvironmentUpdateIn,
    ProjectCreateIn,
    ProjectDetailOut,
    ProjectOut,
    ProjectUpdateIn,
)

router = APIRouter(tags=["projects"])
ERR = errors(401, 403, 404, 422)
Read = Annotated[OrgContext, Depends(require("project.read"))]


def _project_out(db: Session, ctx: OrgContext, project: Project) -> ProjectOut:
    counts = service.open_bug_counts(db, ctx.org_id, [project.id])
    return ProjectOut.model_validate(project).model_copy(update={"open_bug_count": counts.get(project.id, 0)})


def _components_out(db: Session, ctx: OrgContext, items: list[Component]) -> list[ComponentOut]:
    counts = service.component_bug_counts(db, ctx.org_id, [c.id for c in items])
    return [ComponentOut.model_validate(c).model_copy(update={"open_bug_count": counts.get(c.id, 0)}) for c in items]


def _no_changes() -> Unprocessable:
    return Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])


@router.get("/orgs/{org_id}/projects", response_model=Page[ProjectOut], responses=ERR)
def list_projects(db: DB, ctx: Read, params: Annotated[PageParams, Depends(page_params)],
                  include_archived: Annotated[bool, Query()] = False) -> Page[ProjectOut]:
    rows, total = service.list_projects(db, ctx.org_id, params, include_archived=include_archived)
    counts = service.open_bug_counts(db, ctx.org_id, [p.id for p in rows])
    items = [ProjectOut.model_validate(p).model_copy(update={"open_bug_count": counts.get(p.id, 0)}) for p in rows]
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


@router.post("/orgs/{org_id}/projects", status_code=status.HTTP_201_CREATED, response_model=ProjectDetailOut,
             responses=errors(401, 403, 404, 409, 422))
def create_project(body: ProjectCreateIn, db: DB,
                   ctx: Annotated[OrgContext, Depends(require("project.create"))]) -> ProjectDetailOut:
    project = service.create_project(db, ctx.org_id, actor_id=ctx.user.id, name=body.name, key=body.key,
                                     description=body.description)
    return _detail(db, ctx, project)


def _detail(db: Session, ctx: OrgContext, project: Project) -> ProjectDetailOut:
    base = _project_out(db, ctx, project)
    comps = _components_out(db, ctx, service.list_components(db, ctx.org_id, project.id))
    envs = [EnvironmentOut.model_validate(e) for e in service.list_environments(db, ctx.org_id, project.id)]
    return ProjectDetailOut(**base.model_dump(), components=comps, environments=envs)


@router.get("/orgs/{org_id}/projects/{project_id}", response_model=ProjectDetailOut, responses=ERR)
def get_project(project_id: uuid.UUID, db: DB, ctx: Read) -> ProjectDetailOut:
    return _detail(db, ctx, service.get_project(db, ctx.org_id, project_id))


@router.patch("/orgs/{org_id}/projects/{project_id}", response_model=ProjectOut, responses=ERR)
def update_project(project_id: uuid.UUID, body: ProjectUpdateIn, db: DB,
                   ctx: Annotated[OrgContext, Depends(require("project.update"))]) -> ProjectOut:
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise _no_changes()
    if "archived" in changes:
        ctx.require("project.archive")
    project = service.update_project(db, ctx.org_id, project_id, actor_id=ctx.user.id, changes=changes)
    return _project_out(db, ctx, project)


# Components ---------------------------------------------------------------

ManageComponents = Annotated[OrgContext, Depends(require("component.manage"))]


@router.get("/orgs/{org_id}/projects/{project_id}/components", response_model=list[ComponentOut], responses=ERR)
def list_components(project_id: uuid.UUID, db: DB, ctx: Read) -> list[ComponentOut]:
    return _components_out(db, ctx, service.list_components(db, ctx.org_id, project_id))


@router.post("/orgs/{org_id}/projects/{project_id}/components", status_code=status.HTTP_201_CREATED,
             response_model=ComponentOut, responses=errors(401, 403, 404, 409, 422))
def create_component(project_id: uuid.UUID, body: ComponentIn, db: DB, ctx: ManageComponents) -> ComponentOut:
    component = service.create_component(db, ctx.org_id, project_id, name=body.name, description=body.description)
    return ComponentOut.model_validate(component)


@router.patch("/orgs/{org_id}/components/{component_id}", response_model=ComponentOut,
              responses=errors(401, 403, 404, 409, 422))
def update_component(component_id: uuid.UUID, body: ComponentUpdateIn, db: DB, ctx: ManageComponents) -> ComponentOut:
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise _no_changes()
    return _components_out(db, ctx, [service.update_component(db, ctx.org_id, component_id, changes=changes)])[0]


@router.delete("/orgs/{org_id}/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ERR)
def delete_component(component_id: uuid.UUID, db: DB, ctx: ManageComponents) -> None:
    service.delete_component(db, ctx.org_id, component_id)


# Environments -------------------------------------------------------------

ManageEnvironments = Annotated[OrgContext, Depends(require("environment.manage"))]


@router.get("/orgs/{org_id}/projects/{project_id}/environments", response_model=list[EnvironmentOut], responses=ERR)
def list_environments(project_id: uuid.UUID, db: DB, ctx: Read) -> list[EnvironmentOut]:
    return [EnvironmentOut.model_validate(e) for e in service.list_environments(db, ctx.org_id, project_id)]


@router.post("/orgs/{org_id}/projects/{project_id}/environments", status_code=status.HTTP_201_CREATED,
             response_model=EnvironmentOut, responses=errors(401, 403, 404, 409, 422))
def create_environment(project_id: uuid.UUID, body: EnvironmentIn, db: DB, ctx: ManageEnvironments) -> EnvironmentOut:
    return EnvironmentOut.model_validate(service.create_environment(db, ctx.org_id, project_id, name=body.name))


@router.patch("/orgs/{org_id}/environments/{environment_id}", response_model=EnvironmentOut,
              responses=errors(401, 403, 404, 409, 422))
def update_environment(environment_id: uuid.UUID, body: EnvironmentUpdateIn, db: DB,
                       ctx: ManageEnvironments) -> EnvironmentOut:
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise _no_changes()
    return EnvironmentOut.model_validate(service.update_environment(db, ctx.org_id, environment_id, changes=changes))


@router.delete("/orgs/{org_id}/environments/{environment_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404, 409))
def delete_environment(environment_id: uuid.UUID, db: DB, ctx: ManageEnvironments) -> None:
    service.delete_environment(db, ctx.org_id, environment_id)
