"""Org, member and invitation endpoints API-020 to API-031."""

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Path, Query, status

from app.core.deps import DB, CurrentUser, OrgContext, require
from app.core.errors import Unprocessable
from app.core.pagination import Page, PageParams, page_params
from app.core.permissions import Role
from app.core.schemas import errors
from app.modules.orgs.application import service
from app.modules.orgs.infrastructure.models import Invitation
from app.modules.orgs.schemas.orgs import (
    AcceptOut,
    InvitationCreatedOut,
    InvitationIn,
    InvitationOut,
    InvitationPreviewOut,
    MemberOut,
    MembershipOut,
    MemberUser,
    MyOrgOut,
    OrgCreatedOut,
    OrgCreateIn,
    OrgOut,
    OrgUpdateIn,
    OrgWithRoleOut,
    RoleIn,
)

router = APIRouter(tags=["orgs"])
ORG_ERR = errors(401, 403, 404, 422)


def _inv_out[T: InvitationOut](inv: Invitation, cls: type[T] = InvitationOut, **extra: Any) -> T:  # type: ignore[assignment]
    return cls(id=inv.id, email=inv.email, role=inv.role, status=service.invitation_status(inv),
               expires_at=inv.expires_at, created_at=inv.created_at, **extra)


@router.post("/orgs", status_code=status.HTTP_201_CREATED, response_model=OrgCreatedOut, responses=errors(401, 409, 422))
def create_org(body: OrgCreateIn, db: DB, user: CurrentUser) -> OrgCreatedOut:
    org, m = service.create_org(db, user_id=user.id, name=body.name, slug=body.slug)
    return OrgCreatedOut(org=OrgOut.model_validate(org), membership=MembershipOut.model_validate(m))


@router.get("/orgs", response_model=list[MyOrgOut], responses=errors(401))
def my_orgs(db: DB, user: CurrentUser) -> list[MyOrgOut]:
    return [MyOrgOut(org=OrgOut.model_validate(o), role=m.role) for o, m in service.memberships_for_user(db, user.id)]


@router.get("/orgs/{org_id}", response_model=OrgWithRoleOut, responses=ORG_ERR)
def get_org(ctx: Annotated[OrgContext, Depends(require("org.read"))]) -> OrgWithRoleOut:
    return OrgWithRoleOut(**OrgOut.model_validate(ctx.org).model_dump(), my_role=ctx.role)


@router.patch("/orgs/{org_id}", response_model=OrgOut, responses=ORG_ERR)
def update_org(body: OrgUpdateIn, db: DB, ctx: Annotated[OrgContext, Depends(require("org.update_settings"))]) -> OrgOut:
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise Unprocessable("Nothing to change.", details=[{"loc": ["body"], "msg": "Send at least one field."}])
    return OrgOut.model_validate(service.update_org(db, ctx.org, actor_id=ctx.user.id, changes=changes))


@router.get("/orgs/{org_id}/members", response_model=Page[MemberOut], responses=ORG_ERR)
def list_members(
    db: DB,
    ctx: Annotated[OrgContext, Depends(require("member.list_basic"))],
    params: Annotated[PageParams, Depends(page_params)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    role: Role | None = None,
) -> Page[MemberOut]:
    show_email = ctx.can("member.list")
    rows, total = service.list_members(db, ctx.org_id, params, q=q, role=role)
    items = [MemberOut(membership_id=r.membership.id, role=r.membership.role, joined_at=r.membership.created_at,
                       user=MemberUser(id=r.membership.user_id, full_name=r.full_name,
                                       email=r.email if show_email else None)) for r in rows]
    return Page(items=items, page=params.page, page_size=params.page_size, total=total)


MemberId = Annotated[uuid.UUID, Path(description="Membership id")]


@router.patch("/orgs/{org_id}/members/{membership_id}", response_model=MembershipOut, responses=errors(401, 403, 404, 409, 422))
def change_role(membership_id: MemberId, body: RoleIn, db: DB,
                ctx: Annotated[OrgContext, Depends(require("member.update_role"))]) -> MembershipOut:
    m = service.change_role(db, ctx.org_id, membership_id, role=body.role, actor_id=ctx.user.id)
    return MembershipOut.model_validate(m)


@router.delete("/orgs/{org_id}/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT,
               responses=errors(401, 403, 404, 409))
def remove_member(membership_id: MemberId, db: DB,
                  ctx: Annotated[OrgContext, Depends(require("member.remove"))]) -> None:
    service.remove_member(db, ctx.org_id, membership_id, actor_id=ctx.user.id)


@router.post("/orgs/{org_id}/invitations", status_code=status.HTTP_201_CREATED, response_model=InvitationCreatedOut,
             responses=errors(401, 403, 404, 409, 422))
def create_invitation(body: InvitationIn, db: DB,
                      ctx: Annotated[OrgContext, Depends(require("invitation.create"))]) -> InvitationCreatedOut:
    inv, url = service.create_invitation(db, ctx.org, email=body.email, role=body.role, actor_id=ctx.user.id)
    return _inv_out(inv, InvitationCreatedOut, invite_url=url)


@router.get("/orgs/{org_id}/invitations", response_model=list[InvitationOut], responses=ORG_ERR)
def list_invitations(
    db: DB, ctx: Annotated[OrgContext, Depends(require("invitation.list"))],
    status_filter: Annotated[Literal["pending", "accepted", "revoked", "expired"] | None, Query(alias="status")] = None,
) -> list[InvitationOut]:
    return [_inv_out(i) for i in service.list_invitations(db, ctx.org_id, status=status_filter)]


@router.delete("/orgs/{org_id}/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ORG_ERR)
def revoke_invitation(invitation_id: uuid.UUID, db: DB,
                      ctx: Annotated[OrgContext, Depends(require("invitation.revoke"))]) -> None:
    service.revoke_invitation(db, ctx.org_id, invitation_id, actor_id=ctx.user.id)


Token = Annotated[str, Path(min_length=10, max_length=200)]


@router.get("/invitations/{token}", response_model=InvitationPreviewOut, responses=errors(410, 422))
def preview_invitation(token: Token, db: DB) -> InvitationPreviewOut:
    inv, org, masked = service.preview_invitation(db, token)
    return InvitationPreviewOut(org_name=org.name, role=inv.role, email_masked=masked, expires_at=inv.expires_at)


@router.post("/invitations/{token}/accept", response_model=AcceptOut, responses=errors(401, 403, 409, 410, 422))
def accept_invitation(token: Token, db: DB, user: CurrentUser) -> AcceptOut:
    org, m = service.accept_invitation(db, token, user_id=user.id, user_email=user.email)
    return AcceptOut(org=OrgOut.model_validate(org), membership=MembershipOut.model_validate(m))
