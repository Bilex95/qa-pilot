import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.core.permissions import Role
from app.core.schemas import ApiModel, Email

OrgName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
Slug = Annotated[str, StringConstraints(strip_whitespace=True, to_lower=True, min_length=2, max_length=40)]


class OrgCreateIn(ApiModel):
    name: OrgName
    slug: Slug = Field(description="Workspace address, lowercase letters, numbers and hyphens")


class OrgUpdateIn(ApiModel):
    name: OrgName | None = None
    ai_enabled: bool | None = None
    ai_daily_limit: Annotated[int, Field(ge=1, le=100_000)] | None = None


class OrgOut(ApiModel):
    id: uuid.UUID
    name: str
    slug: str
    ai_enabled: bool
    ai_daily_limit: int


class OrgWithRoleOut(OrgOut):
    my_role: Role


class MembershipOut(ApiModel):
    id: uuid.UUID
    org_id: uuid.UUID
    user_id: uuid.UUID
    role: Role


class OrgCreatedOut(ApiModel):
    org: OrgOut
    membership: MembershipOut


class MyOrgOut(ApiModel):
    org: OrgOut
    role: Role


class MemberUser(ApiModel):
    id: uuid.UUID
    full_name: str
    email: str | None = Field(default=None, description="Only for roles with member.list")


class MemberOut(ApiModel):
    membership_id: uuid.UUID
    user: MemberUser
    role: Role
    joined_at: datetime


class RoleIn(ApiModel):
    role: Role


class InvitationIn(ApiModel):
    email: Email
    role: Role


class InvitationOut(ApiModel):
    id: uuid.UUID
    email: str
    role: Role
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: datetime
    created_at: datetime


class InvitationCreatedOut(InvitationOut):
    invite_url: str = Field(description="Shown once. Send it yourself; no email is sent (D-011). The token is in the "
                                        "URL fragment (`/invite#<token>`), which browsers never send to a server.")


class InvitationTokenIn(ApiModel):
    """The token goes in the body, never in the path or the query (BL-014, D-055)."""

    token: Annotated[str, StringConstraints(min_length=10, max_length=200)]


class PasswordResetLinkOut(ApiModel):
    reset_url: str = Field(description="Shown once. Send it to the person yourself; no email is sent (D-045). The token is "
                                       "in the URL fragment (`/reset-password#<token>`).")
    expires_at: datetime


class InvitationPreviewOut(ApiModel):
    org_name: str
    role: Role
    email_masked: str
    expires_at: datetime


class AcceptOut(ApiModel):
    org: OrgOut
    membership: MembershipOut
