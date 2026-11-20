"""Auth use cases (REQ-001 to REQ-003, REQ-010, REQ-011). Public contract for other modules:
get_active_user, get_users_by_ids, get_user_by_email, issue_password_reset, access_token_predates_password_change."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError, Conflict, Gone, RateLimited, Unauthorized, Unprocessable
from app.core.request_context import current as request_info
from app.core.security import (
    create_access_token,
    hash_password,
    new_opaque_token,
    password_problem,
    to_microseconds,
    token_hash,
    verify_password,
)
from app.modules.audit.application import service as audit
from app.modules.auth.infrastructure import repository as repo
from app.modules.auth.infrastructure.models import PasswordReset, RefreshToken, User
from app.modules.orgs.domain.rules import mask_email

REUSE_GRACE_SECONDS = 30


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    expires_in: int


def normalise_email(email: str) -> str:
    return email.strip().lower()


# Public contract ----------------------------------------------------------

def get_active_user(db: Session, user_id: uuid.UUID) -> User | None:
    user = repo.get_user(db, user_id)
    return user if user and user.is_active else None


def get_user_by_email(db: Session, email: str) -> User | None:
    return repo.get_user_by_email(db, normalise_email(email))


def get_users_by_ids(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
    return repo.get_users(db, ids)


# Use cases ----------------------------------------------------------------

def _issue(db: Session, user: User, user_agent: str | None, *,
           issued_at: datetime | None = None) -> tuple[TokenPair, RefreshToken]:
    s = get_settings()
    raw = new_opaque_token()
    rt = RefreshToken(user_id=user.id, token_hash=token_hash(raw),
                      expires_at=utcnow() + timedelta(days=s.refresh_token_days),
                      user_agent=(user_agent or "")[:255] or None)
    db.add(rt)
    access, ttl = create_access_token(user.id, now=issued_at)
    return TokenPair(access, raw, ttl), rt


def register(db: Session, *, full_name: str, email: str, password: str, user_agent: str | None) -> tuple[User, TokenPair]:
    email = normalise_email(email)
    problem = password_problem(password)
    if problem:
        raise Unprocessable("Password does not meet the policy.", details=[{"loc": ["body", "password"], "msg": problem}])
    if repo.get_user_by_email(db, email):
        raise Conflict("An account with this email already exists.", code="email_taken")
    user = User(email=email, full_name=full_name.strip(), password_hash=hash_password(password), last_login_at=utcnow())
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict("An account with this email already exists.", code="email_taken") from exc
    pair, _ = _issue(db, user, user_agent)
    audit.record(db, "auth.register", actor_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return user, pair


def login(db: Session, *, email: str, password: str, user_agent: str | None) -> tuple[User, TokenPair]:
    s = get_settings()
    email = normalise_email(email)
    if audit.count_recent(db, "auth.login_failed", email=email, minutes=s.login_window_minutes) >= s.login_max_failures:
        raise RateLimited("Too many failed sign in attempts. Try again in 15 minutes.",
                          retry_after=s.login_window_minutes * 60)
    user = repo.get_user_by_email(db, email)
    # Always run the hash check so response time does not reveal whether the email exists
    password_ok = verify_password(user.password_hash if user else None, password)
    if not user or not user.is_active or not password_ok:
        audit.record(db, "auth.login_failed", actor_id=user.id if user else None, data={"email": email})
        db.commit()
        raise Unauthorized("Email or password is incorrect.", code="invalid_credentials")
    user.last_login_at = utcnow()
    pair, _ = _issue(db, user, user_agent)
    audit.record(db, "auth.login", actor_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return user, pair


def refresh(db: Session, *, refresh_token: str, user_agent: str | None) -> TokenPair:
    invalid = Unauthorized("Your session has ended. Sign in again.", code="invalid_refresh_token")
    current = repo.get_refresh_token(db, token_hash(refresh_token))
    if current is None:
        raise invalid
    now = utcnow()
    if current.revoked_at is not None:
        successor = repo.get_refresh_token_by_id(db, current.replaced_by_id) if current.replaced_by_id else None
        recently_rotated = now - current.revoked_at < timedelta(seconds=REUSE_GRACE_SECONDS)
        if successor is not None and recently_rotated and successor.revoked_at is None and successor.expires_at > now:
            # Reuse interval (D-039): the browser never stored the successor (a reload or navigation aborted the
            # response that carried it) or two tabs refreshed at once. The successor was never used, so continue
            # the chain from it instead of signing the user out.
            user = get_active_user(db, current.user_id)
            if user is None:
                raise invalid
            pair, new = _issue(db, user, user_agent)
            db.flush()
            successor.revoked_at = now
            successor.replaced_by_id = new.id
            db.commit()
            return pair
        if successor is not None and not recently_rotated:
            # A rotated token was used again outside the window: treat as theft and end every session (D-010)
            repo.revoke_all_for_user(db, current.user_id, now)
            audit.record(db, "auth.refresh_reuse_detected", actor_id=current.user_id, entity_type="user",
                         entity_id=current.user_id)
            db.commit()
        raise invalid
    if current.expires_at <= now:
        raise invalid
    user = get_active_user(db, current.user_id)
    if user is None:
        raise invalid
    pair, new = _issue(db, user, user_agent)
    db.flush()
    current.revoked_at = now
    current.replaced_by_id = new.id
    db.commit()
    return pair


def logout(db: Session, *, refresh_token: str, user: User) -> None:
    current = repo.get_refresh_token(db, token_hash(refresh_token))
    if current is not None and current.user_id == user.id and current.revoked_at is None:
        current.revoked_at = utcnow()
    audit.record(db, "auth.logout", actor_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()


def update_profile(db: Session, user: User, *, full_name: str) -> User:
    user.full_name = full_name.strip()
    db.commit()
    return user


def change_password(db: Session, user: User, *, current_password: str, new_password: str,
                    user_agent: str | None = None) -> TokenPair:
    """Every other session ends; the device that made the change stays signed in with a fresh token pair (D-055)."""
    if not verify_password(user.password_hash, current_password):
        raise AppError("Current password is incorrect.", code="wrong_password", status_code=400)
    problem = password_problem(new_password)
    if problem:
        raise Unprocessable("Password does not meet the policy.",
                            details=[{"loc": ["body", "new_password"], "msg": problem}])
    now = utcnow()
    user.password_hash = hash_password(new_password)
    user.password_changed_at = now  # access tokens issued before this moment stop working (D-055)
    repo.revoke_all_for_user(db, user.id, now)
    repo.revoke_pending_resets(db, user.id, now)
    # The new pair is issued after the change, never at or before it: the access token is stamped at least one microsecond later
    pair, _ = _issue(db, user, user_agent, issued_at=max(utcnow(), now + timedelta(microseconds=1)))
    audit.record(db, "auth.password_changed", actor_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
    return pair


def access_token_predates_password_change(user: User, claims: dict[str, Any]) -> bool:
    """True when the access token was issued before the user's last password change (D-055).

    The exact order is decided in microseconds (`iat_us`), so a token issued in the same second as the change is judged
    by which came first, not by the whole second `iat` carries (equal microseconds count as not after).
    A token without `iat_us` (issued before this rule existed)
    only has whole seconds, so it is refused when issued in the same second as the change or earlier."""
    changed = user.password_changed_at
    if changed is None:
        return False
    issued_us = claims.get("iat_us")
    if isinstance(issued_us, int):
        return issued_us <= to_microseconds(changed)  # issued at the very same microsecond is not provably after: refuse
    iat = claims.get("iat")
    return not isinstance(iat, (int, float)) or int(iat) <= to_microseconds(changed) // 1_000_000


# Password reset links (D-045, D-055) -------------------------------------------

_RESET_GONE = "This reset link no longer works. Ask your workspace admin for a new link."


def issue_password_reset(db: Session, *, user_id: uuid.UUID, org_id: uuid.UUID, actor_id: uuid.UUID) -> tuple[str, datetime]:
    """Public contract for the orgs module, which checks who may reset whom. Returns the raw token (shown once) and its expiry.
    A newer link replaces any pending link of the same person."""
    now = utcnow()
    repo.revoke_pending_resets(db, user_id, now)
    raw = new_opaque_token()
    expires = now + timedelta(minutes=get_settings().password_reset_minutes)
    reset = PasswordReset(user_id=user_id, org_id=org_id, created_by_id=actor_id, token_hash=token_hash(raw), expires_at=expires)
    db.add(reset)
    db.flush()
    audit.record(db, "auth.reset_link_created", actor_id=actor_id, org_id=org_id, entity_type="user", entity_id=user_id,
                 data={"reset_id": str(reset.id)})
    db.commit()
    return raw, expires


def end_access_after_removal(db: Session, *, user_id: uuid.UUID, in_other_workspace: bool) -> None:
    """Public contract for the orgs module, called when a person is removed from a workspace (D-056). Every live reset link
    of that person ends. When no workspace is left for them, their sessions end too (refresh tokens revoked, access tokens
    issued before now refused); a person who still belongs to another workspace keeps their sessions. The caller commits."""
    now = utcnow()
    repo.revoke_pending_resets(db, user_id, now)
    if in_other_workspace:
        return
    user = get_active_user(db, user_id)
    if user is not None:
        user.password_changed_at = now
    repo.revoke_all_for_user(db, user_id, now)


def _reset_throttle(db: Session) -> None:
    s = get_settings()
    ip = request_info().client_ip
    if audit.count_recent_by_ip(db, "auth.reset_failed", ip=ip, minutes=s.reset_window_minutes) >= s.reset_max_failures:
        raise RateLimited("Too many attempts with a reset link. Try again in 15 minutes.",
                          retry_after=s.reset_window_minutes * 60)


def _reset_gone(db: Session) -> Gone:
    """One answer for an unknown, used, expired or replaced link, so nothing says which it was. The attempt is counted
    against the client address (never the token)."""
    audit.record(db, "auth.reset_failed", actor_id=None)
    db.commit()
    return Gone(_RESET_GONE, code="reset_invalid")


def _usable_reset(db: Session, token: str) -> tuple[PasswordReset, User] | None:
    reset = repo.get_reset_by_hash(db, token_hash(token))
    if reset is None or reset.used_at is not None or reset.revoked_at is not None or reset.expires_at <= utcnow():
        return None
    user = get_active_user(db, reset.user_id)
    return (reset, user) if user is not None else None


def preview_password_reset(db: Session, *, token: str) -> tuple[str, datetime]:
    """(masked email, expiry) of a usable link, otherwise the uniform 410."""
    _reset_throttle(db)
    found = _usable_reset(db, token)
    if found is None:
        raise _reset_gone(db)
    reset, user = found
    return mask_email(user.email), reset.expires_at


def confirm_password_reset(db: Session, *, token: str, new_password: str) -> None:
    """Set a new password with a reset link. The link is checked first (410 for any problem with it, whatever the password),
    then the password policy (422, the link stays usable), then the link is claimed in one statement (single use)."""
    _reset_throttle(db)
    found = _usable_reset(db, token)
    if found is None:
        raise _reset_gone(db)
    reset, user = found
    problem = password_problem(new_password)
    if problem:
        raise Unprocessable("Password does not meet the policy.", details=[{"loc": ["body", "new_password"], "msg": problem}])
    now = utcnow()
    if not repo.claim_reset(db, reset.id, now):  # another request used the link between the check and now
        raise _reset_gone(db)
    user.password_hash = hash_password(new_password)
    user.password_changed_at = now
    repo.revoke_all_for_user(db, user.id, now)  # every session ends (refresh tokens here, access tokens by password_changed_at)
    repo.revoke_pending_resets(db, user.id, now)
    audit.record(db, "auth.password_reset", actor_id=user.id, org_id=reset.org_id, entity_type="user", entity_id=user.id,
                 data={"reset_id": str(reset.id)})
    db.commit()
