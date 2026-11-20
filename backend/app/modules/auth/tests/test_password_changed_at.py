"""Access tokens issued before a password change are refused (D-055), including the edge where the token and the change fall in the
same second. `iat` has whole seconds only, so the token also carries `iat_us` (microseconds) and the exact order decides."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.security import create_access_token, to_microseconds
from app.modules.auth.application.service import access_token_predates_password_change
from app.modules.auth.infrastructure.models import User

ME = "/api/v1/auth/me"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def changed_at() -> datetime:
    """A password change 2 minutes ago, half a second into its second (so there is room before and after in that second)."""
    return (utcnow() - timedelta(minutes=2)).replace(microsecond=500_000)


def token_at(user: User, when: datetime) -> str:
    return create_access_token(user.id, now=when)[0]


def legacy_token(user: User, when: datetime) -> str:
    """A token from before `iat_us` existed: whole second `iat` only."""
    s = get_settings()
    payload = {"sub": str(user.id), "type": "access", "iat": when, "exp": when + timedelta(minutes=15), "jti": "legacy"}
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def test_a_user_who_never_changed_their_password_keeps_every_token(client, db, world) -> None:
    user = world.a.users["developer"]
    assert user.password_changed_at is None
    assert client.get(ME, headers=bearer(token_at(user, utcnow() - timedelta(minutes=5)))).status_code == 200


@pytest.mark.parametrize(("offset_us", "expected"), [
    (-1_000_000, 401),  # issued a second before the change
    (-300_000, 401),  # SAME SECOND, issued before the change: refused
    (-1, 401),  # one microsecond before
    (0, 401),  # the very same microsecond: not provably after, refused
    (1, 200),  # one microsecond after
    (100_000, 200),  # SAME SECOND, issued after the change: accepted
    (1_000_000, 200),  # the next second
])
def test_the_exact_order_decides_in_the_same_second(client, db, world, offset_us, expected) -> None:
    user = world.a.users["developer"]
    moment = changed_at()
    user.password_changed_at = moment
    db.flush()
    issued = moment + timedelta(microseconds=offset_us)
    # the same second means the whole second `iat` carries is identical for offsets inside the second
    if -500_000 <= offset_us < 500_000:
        assert int(issued.timestamp()) == int(moment.timestamp())
    assert client.get(ME, headers=bearer(token_at(user, issued))).status_code == expected, offset_us


def test_tokens_from_before_iat_us_existed_are_judged_by_the_whole_second(client, db, world) -> None:
    """Without microseconds the safe answer is to refuse everything issued in the second of the change or earlier."""
    user = world.a.users["developer"]
    moment = changed_at()
    user.password_changed_at = moment
    db.flush()
    cases = {-2: 401, -1: 401, 0: 401, 1: 200}  # seconds relative to the second of the change
    for seconds, expected in cases.items():
        when = moment.replace(microsecond=0) + timedelta(seconds=seconds, microseconds=900_000)  # late in that second
        assert client.get(ME, headers=bearer(legacy_token(user, when))).status_code == expected, seconds


def test_the_decision_function_directly() -> None:
    changed = datetime(2026, 11, 20, 12, 0, 0, 500_000, tzinfo=UTC)
    user = User(email="x@example.test", full_name="X", password_hash="x", password_changed_at=changed)
    before = {"iat": 1, "iat_us": to_microseconds(changed) - 1}
    after = {"iat": 1, "iat_us": to_microseconds(changed) + 1}
    assert access_token_predates_password_change(user, before) is True
    assert access_token_predates_password_change(user, after) is False
    assert access_token_predates_password_change(user, {}) is True  # no timing claim at all: refused
    user.password_changed_at = None
    assert access_token_predates_password_change(user, before) is False


def test_microseconds_are_exact_not_rounded_through_a_float() -> None:
    moment = datetime(2026, 11, 20, 12, 0, 0, 123_457, tzinfo=UTC)
    assert to_microseconds(moment) % 1_000_000 == 123_457
    assert to_microseconds(moment + timedelta(microseconds=1)) == to_microseconds(moment) + 1
