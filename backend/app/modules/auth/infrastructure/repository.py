import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.modules.auth.infrastructure.models import PasswordReset, RefreshToken, User


def get_user(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_users(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))}


def get_refresh_token(db: Session, token_hash: str) -> RefreshToken | None:
    return db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update())


def get_refresh_token_by_id(db: Session, token_id: uuid.UUID) -> RefreshToken | None:
    return db.scalar(select(RefreshToken).where(RefreshToken.id == token_id).with_for_update())


def get_reset_by_hash(db: Session, token_hash: str) -> PasswordReset | None:
    return db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_hash))


def revoke_pending_resets(db: Session, user_id: uuid.UUID, at: datetime) -> None:
    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user_id, PasswordReset.used_at.is_(None), PasswordReset.revoked_at.is_(None))
        .values(revoked_at=at)
        .execution_options(synchronize_session=False)
    )


def claim_reset(db: Session, reset_id: uuid.UUID, at: datetime) -> bool:
    """Mark a reset link used, in one statement that only succeeds for a link that is still unused, not revoked and not
    expired. Two requests with the same token cannot both win (single use)."""
    claimed = db.execute(
        update(PasswordReset)
        .where(PasswordReset.id == reset_id, PasswordReset.used_at.is_(None), PasswordReset.revoked_at.is_(None),
               PasswordReset.expires_at > at)
        .values(used_at=at)
        .returning(PasswordReset.id)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()
    return claimed is not None


def revoke_all_for_user(db: Session, user_id: uuid.UUID, at: datetime) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=at)
    )
