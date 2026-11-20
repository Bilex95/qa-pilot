"""Auth endpoints API-010 to API-016 and the password reset endpoints API-152, API-153. Thin: parse, call service, shape response."""

from typing import Annotated

from fastapi import APIRouter, Header, status

from app.core.deps import DB, CurrentUser
from app.core.schemas import errors
from app.modules.auth.application import service
from app.modules.auth.schemas.auth import (
    AuthOut,
    LoginIn,
    MeInvitation,
    MeMembership,
    MeOrg,
    MeOut,
    PasswordChangeIn,
    ProfileIn,
    RefreshIn,
    RegisterIn,
    ResetConfirmIn,
    ResetPreviewIn,
    ResetPreviewOut,
    TokensOut,
    UserOut,
)
from app.modules.orgs.application import service as orgs

router = APIRouter(prefix="/auth", tags=["auth"])
UA = Annotated[str | None, Header(alias="User-Agent")]


def _auth_out(user, pair) -> AuthOut:  # type: ignore[no-untyped-def]
    return AuthOut(access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in,
                   user=UserOut.model_validate(user))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=AuthOut, responses=errors(409, 422))
def register(body: RegisterIn, db: DB, user_agent: UA = None) -> AuthOut:
    user, pair = service.register(db, full_name=body.full_name, email=body.email, password=body.password,
                                  user_agent=user_agent)
    return _auth_out(user, pair)


@router.post("/login", response_model=AuthOut, responses=errors(401, 422, 429))
def login(body: LoginIn, db: DB, user_agent: UA = None) -> AuthOut:
    user, pair = service.login(db, email=body.email, password=body.password, user_agent=user_agent)
    return _auth_out(user, pair)


@router.post("/refresh", response_model=TokensOut, responses=errors(401, 422))
def refresh(body: RefreshIn, db: DB, user_agent: UA = None) -> TokensOut:
    pair = service.refresh(db, refresh_token=body.refresh_token, user_agent=user_agent)
    return TokensOut(access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, responses=errors(401, 422))
def logout(body: RefreshIn, db: DB, user: CurrentUser) -> None:
    service.logout(db, refresh_token=body.refresh_token, user=user)


@router.get("/me", response_model=MeOut, responses=errors(401))
def me(db: DB, user: CurrentUser) -> MeOut:
    memberships = [MeMembership(org=MeOrg.model_validate(o), role=m.role) for o, m in orgs.memberships_for_user(db, user.id)]
    member_org_ids = {mm.org.id for mm in memberships}
    invites = [MeInvitation(id=i.id, org_name=o.name, role=i.role, expires_at=i.expires_at)
               for i, o in orgs.pending_invitations_for_email(db, user.email) if o.id not in member_org_ids]
    return MeOut(user=UserOut.model_validate(user), memberships=memberships, pending_invitations=invites)


@router.patch("/me", response_model=UserOut, responses=errors(401, 422))
def update_me(body: ProfileIn, db: DB, user: CurrentUser) -> UserOut:
    return UserOut.model_validate(service.update_profile(db, user, full_name=body.full_name))


@router.post("/me/password", response_model=TokensOut, responses=errors(400, 401, 422))
def change_password(body: PasswordChangeIn, db: DB, user: CurrentUser, user_agent: UA = None) -> TokensOut:
    """Every other session ends (refresh tokens revoked, earlier access tokens refused). The response is a fresh token pair
    for this device, issued after the change, so the person stays signed in here (D-055)."""
    pair = service.change_password(db, user, current_password=body.current_password, new_password=body.new_password,
                                   user_agent=user_agent)
    return TokensOut(access_token=pair.access_token, refresh_token=pair.refresh_token, expires_in=pair.expires_in)


# The token travels in the body, never in the path or the query, so it stays out of logs, history and Referer (BL-014)
@router.post("/password-reset/preview", response_model=ResetPreviewOut, responses=errors(410, 422, 429))
def preview_password_reset(body: ResetPreviewIn, db: DB) -> ResetPreviewOut:
    masked, expires = service.preview_password_reset(db, token=body.token)
    return ResetPreviewOut(email_masked=masked, expires_at=expires)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT, responses=errors(410, 422, 429))
def confirm_password_reset(body: ResetConfirmIn, db: DB) -> None:
    service.confirm_password_reset(db, token=body.token, new_password=body.new_password)
