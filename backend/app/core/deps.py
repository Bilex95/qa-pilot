"""Request dependencies: current user, org context and permission checks (REQ-007, REQ-008, D-002, D-003)."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Path
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.permissions import Role, can
from app.core.request_context import current as request_info
from app.core.security import decode_access_token
from app.modules.auth.application import service as auth
from app.modules.auth.infrastructure.models import User
from app.modules.orgs.application import service as orgs
from app.modules.orgs.infrastructure.models import Membership, Organization

_bearer = HTTPBearer(auto_error=False, description="Access token from POST /api/v1/auth/login")

DB = Annotated[Session, Depends(get_db)]


def get_current_user(db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise Unauthorized("Sign in to continue.")
    payload = decode_access_token(creds.credentials)
    if payload is None:
        raise Unauthorized("Your session has expired. Sign in again.")
    try:
        user_id = uuid.UUID(str(payload["sub"]))
    except ValueError as exc:
        raise Unauthorized("Sign in to continue.") from exc
    user = auth.get_active_user(db, user_id)
    if user is None:
        raise Unauthorized("Sign in to continue.")
    if auth.access_token_predates_password_change(user, payload):  # a reset or a password change ends every session (D-055)
        raise Unauthorized("Your session has expired. Sign in again.")
    request_info().user_id = str(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class OrgContext:
    org: Organization
    membership: Membership
    user: User

    @property
    def role(self) -> Role:
        return Role(self.membership.role)

    @property
    def org_id(self) -> uuid.UUID:
        return self.org.id

    def can(self, action: str) -> bool:
        return can(self.role, action)

    def require(self, action: str) -> None:
        if not self.can(action):
            raise Forbidden("Your role cannot do this.", details={"action": action, "role": self.role.value})


def get_org_context(db: DB, user: CurrentUser,
                    org_id: Annotated[uuid.UUID, Path(description="Organization id")]) -> OrgContext:
    membership = orgs.get_active_membership(db, org_id, user.id)
    org = orgs.get_org(db, org_id) if membership else None
    if membership is None or org is None:
        # Same answer whether the org exists or not (D-003)
        raise NotFound("Workspace not found.", code="org_not_found")
    request_info().org_id = str(org.id)
    return OrgContext(org=org, membership=membership, user=user)


Org = Annotated[OrgContext, Depends(get_org_context)]


def require(action: str) -> Callable[[OrgContext], OrgContext]:
    """Route dependency: org context plus an action check from the permission matrix."""
    can(Role.ORG_ADMIN, action)  # fail fast on unknown action keys at import time

    def _dep(ctx: Org) -> OrgContext:
        ctx.require(action)
        return ctx

    _dep.__name__ = f"require_{action.replace('.', '_')}"
    return _dep
