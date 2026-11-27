"""Password hashing (argon2id, D-020) and tokens (D-010)."""

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()  # argon2id with library defaults
_PASSWORD_RE = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{10,128}$")
# Dummy hash used to keep login timing similar when the email does not exist
_DUMMY_HASH = _hasher.hash("timing-equaliser-0")


def password_problem(password: str) -> str | None:
    """Return a user facing problem with the password, or None when it meets the policy."""
    if not _PASSWORD_RE.match(password):
        return "Use at least 10 characters with at least one letter and one number."
    return None


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def to_microseconds(moment: datetime) -> int:
    """Whole microseconds since the epoch, exact (no float rounding)."""
    return (moment.astimezone(UTC) - _EPOCH) // timedelta(microseconds=1)


def create_access_token(user_id: uuid.UUID, now: datetime | None = None) -> tuple[str, int]:
    """`iat` is whole seconds (JWT standard). `iat_us` is the same moment in microseconds: a password change is compared
    with it, so a token issued in the same second as the change is judged by the exact order (D-055)."""
    s = get_settings()
    now = now or datetime.now(UTC)
    ttl = s.access_token_minutes * 60
    payload = {"sub": str(user_id), "type": "access", "iat": now, "iat_us": to_microseconds(now),
               "exp": now + timedelta(seconds=ttl), "jti": uuid.uuid4().hex}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm), ttl


def decode_access_token(token: str) -> dict[str, Any] | None:
    s = get_settings()
    try:
        data: dict[str, Any] = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm],
                                          options={"require": ["sub", "exp", "type"]})
    except jwt.PyJWTError:
        return None
    return data if data.get("type") == "access" else None


def new_opaque_token() -> str:
    return secrets.token_urlsafe(48)


# Only hashes high entropy random opaque tokens: refresh, reset and invitation
# tokens from new_opaque_token() (secrets.token_urlsafe(48)) and the invite
# tokens of the local only seed. SHA-256 is appropriate for those, as they
# cannot be guessed or brute forced. Passwords use argon2id through
# hash_password, never this function.
def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
