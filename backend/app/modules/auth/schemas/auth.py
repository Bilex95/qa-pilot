import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.core.permissions import Role
from app.core.schemas import ApiModel, Email, Name

Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]


class RegisterIn(ApiModel):
    full_name: Name
    email: Email
    password: Password = Field(description="At least 10 characters with a letter and a number")


class LoginIn(ApiModel):
    email: Email
    password: Password


class RefreshIn(ApiModel):
    refresh_token: Annotated[str, StringConstraints(min_length=10, max_length=200)]


class UserOut(ApiModel):
    id: uuid.UUID
    email: str
    full_name: str
    created_at: datetime


class TokensOut(ApiModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 (OAuth token type, not a secret)
    expires_in: int


class AuthOut(TokensOut):
    user: UserOut


class MeOrg(ApiModel):
    id: uuid.UUID
    name: str
    slug: str
    ai_enabled: bool


class MeMembership(ApiModel):
    org: MeOrg
    role: Role


class MeInvitation(ApiModel):
    id: uuid.UUID
    org_name: str
    role: Role
    expires_at: datetime


class MeOut(ApiModel):
    user: UserOut
    memberships: list[MeMembership]
    pending_invitations: list[MeInvitation]


class ProfileIn(ApiModel):
    full_name: Name


class PasswordChangeIn(ApiModel):
    current_password: Password
    new_password: Password


ResetToken = Annotated[str, StringConstraints(min_length=10, max_length=200)]


class ResetPreviewIn(ApiModel):
    token: ResetToken


class ResetPreviewOut(ApiModel):
    email_masked: str
    expires_at: datetime


class ResetConfirmIn(ApiModel):
    token: ResetToken
    new_password: Password = Field(description="At least 10 characters with a letter and a number")
