"""Auth use cases (REQ-001 to REQ-003, REQ-010, REQ-011). Public contract for other modules:
get_active_user, get_users_by_ids, get_user_by_email."""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import AppError, Conflict, RateLimited, Unauthorized, Unprocessable
from app.core.security import (
    create_access_token,
    hash_password,
    new_opaque_token,
    password_problem,
    token_hash,
    verify_password,
)
from app.modules.audit.application import service as audit
from app.modules.auth.infrastructure import repository as repo
from app.modules.auth.infrastructure.models import RefreshToken, User

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

def _issue(db: Session, user: User, user_agent: str | None) -> tuple[TokenPair, RefreshToken]:
    s = get_settings()
    raw = new_opaque_token()
    rt = RefreshToken(user_id=user.id, token_hash=token_hash(raw),
                      expires_at=utcnow() + timedelta(days=s.refresh_token_days),
                      user_agent=(user_agent or "")[:255] or None)
    db.add(rt)
    access, ttl = create_access_token(user.id)
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


def change_password(db: Session, user: User, *, current_password: str, new_password: str) -> None:
    if not verify_password(user.password_hash, current_password):
        raise AppError("Current password is incorrect.", code="wrong_password", status_code=400)
    problem = password_problem(new_password)
    if problem:
        raise Unprocessable("Password does not meet the policy.",
                            details=[{"loc": ["body", "new_password"], "msg": problem}])
    user.password_hash = hash_password(new_password)
    repo.revoke_all_for_user(db, user.id, utcnow())
    audit.record(db, "auth.password_changed", actor_id=user.id, entity_type="user", entity_id=user.id)
    db.commit()
