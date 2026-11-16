"""API-010 to API-016: register, login, refresh, logout, me, profile, password (REQ-001 to REQ-003, REQ-010, REQ-011)."""

from datetime import timedelta

from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.auth.infrastructure.models import RefreshToken
from conftest import PASSWORD, add_member, auth, make_org, make_user

URL = "/api/v1/auth"


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


# Register -------------------------------------------------------------------

def test_register_creates_user_and_returns_tokens(client, db) -> None:
    r = client.post(f"{URL}/register", json={"full_name": "Priya Raman", "email": " Priya@Example.TEST ",
                                             "password": "Longenough1"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["email"] == "priya@example.test" and body["token_type"] == "bearer"
    assert body["access_token"] and body["refresh_token"] and body["expires_in"] == 900
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "auth.register"))


def test_register_duplicate_email_conflicts(client, db) -> None:
    make_user(db, "taken@example.test")
    r = client.post(f"{URL}/register", json={"full_name": "X", "email": "TAKEN@example.test", "password": "Longenough1"})
    assert r.status_code == 409 and code(r) == "email_taken"


def test_register_rejects_weak_password_and_bad_email(client) -> None:
    weak = client.post(f"{URL}/register", json={"full_name": "X", "email": "a@example.test", "password": "short1"})
    assert weak.status_code == 422 and weak.json()["error"]["details"][0]["loc"][-1] == "password"
    no_digit = client.post(f"{URL}/register", json={"full_name": "X", "email": "b@example.test", "password": "onlyletters"})
    assert no_digit.status_code == 422
    bad = client.post(f"{URL}/register", json={"full_name": "X", "email": "not-an-email", "password": "Longenough1"})
    assert bad.status_code == 422 and code(bad) == "validation_error"


def test_register_forbids_unknown_fields(client) -> None:
    r = client.post(f"{URL}/register", json={"full_name": "X", "email": "c@example.test", "password": "Longenough1",
                                             "is_admin": True})
    assert r.status_code == 422


# Login ----------------------------------------------------------------------

def test_login_happy_path(client, db) -> None:
    make_user(db, "login@example.test")
    r = client.post(f"{URL}/login", json={"email": "LOGIN@example.test", "password": PASSWORD})
    assert r.status_code == 200, r.text
    me = client.get(f"{URL}/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.status_code == 200 and me.json()["user"]["email"] == "login@example.test"


def test_login_wrong_password_and_unknown_email_give_the_same_answer(client, db) -> None:
    make_user(db, "known@example.test")
    wrong = client.post(f"{URL}/login", json={"email": "known@example.test", "password": "Wrong-pass-1"})
    unknown = client.post(f"{URL}/login", json={"email": "nobody@example.test", "password": "Wrong-pass-1"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert code(wrong) == "invalid_credentials"


def test_login_inactive_user_is_rejected(client, db) -> None:
    u = make_user(db, "gone@example.test")
    u.is_active = False
    db.flush()
    assert client.post(f"{URL}/login", json={"email": "gone@example.test", "password": PASSWORD}).status_code == 401


def test_login_throttle_after_ten_failures(client, db) -> None:
    make_user(db, "brute@example.test")
    for _ in range(10):
        assert client.post(f"{URL}/login", json={"email": "brute@example.test", "password": "Wrong-pass-1"}).status_code == 401
    r = client.post(f"{URL}/login", json={"email": "brute@example.test", "password": PASSWORD})
    assert r.status_code == 429 and code(r) == "rate_limited" and r.headers["Retry-After"] == "900"


def test_login_invalid_body(client) -> None:
    assert client.post(f"{URL}/login", json={"email": "x@example.test"}).status_code == 422


# Refresh and logout ---------------------------------------------------------

def _login(client, db, email="rt@example.test"):  # type: ignore[no-untyped-def]
    make_user(db, email)
    return client.post(f"{URL}/login", json={"email": email, "password": PASSWORD}).json()


def test_refresh_rotates_the_token(client, db) -> None:
    first = _login(client, db)
    r = client.post(f"{URL}/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["refresh_token"] != first["refresh_token"]
    again = client.post(f"{URL}/refresh", json={"refresh_token": first["refresh_token"]})
    assert again.status_code == 401 and code(again) == "invalid_refresh_token"


def _age_rotation(db, seconds: int) -> None:  # type: ignore[no-untyped-def]
    for rt in db.scalars(select(RefreshToken).where(RefreshToken.revoked_at.is_not(None))):
        rt.revoked_at = rt.revoked_at - timedelta(seconds=seconds)
    db.flush()


def test_refresh_reuse_revokes_every_session(client, db) -> None:
    first = _login(client, db)
    second = client.post(f"{URL}/refresh", json={"refresh_token": first["refresh_token"]}).json()
    _age_rotation(db, 60)  # past the 30 second grace window
    client.post(f"{URL}/refresh", json={"refresh_token": first["refresh_token"]})  # reuse of a rotated token
    assert client.post(f"{URL}/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 401
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "auth.refresh_reuse_detected"))


def test_concurrent_refresh_inside_grace_window_is_not_treated_as_theft(client, db) -> None:
    """Two tabs refreshing at once: the loser gets 401 and retries with the new cookie; nobody is signed out."""
    first = _login(client, db)
    second = client.post(f"{URL}/refresh", json={"refresh_token": first["refresh_token"]}).json()
    loser = client.post(f"{URL}/refresh", json={"refresh_token": first["refresh_token"]})
    assert loser.status_code == 401 and code(loser) == "invalid_refresh_token"
    assert client.post(f"{URL}/refresh", json={"refresh_token": second["refresh_token"]}).status_code == 200
    assert not db.scalar(select(AuditEvent).where(AuditEvent.action == "auth.refresh_reuse_detected"))


def test_refresh_with_garbage_token(client) -> None:
    r = client.post(f"{URL}/refresh", json={"refresh_token": "x" * 40})
    assert r.status_code == 401 and code(r) == "invalid_refresh_token"


def test_logout_revokes_refresh_token(client, db) -> None:
    tokens = _login(client, db)
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.post(f"{URL}/logout", json={"refresh_token": tokens["refresh_token"]}, headers=h).status_code == 204
    assert client.post(f"{URL}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_logout_requires_auth(client) -> None:
    assert client.post(f"{URL}/logout", json={"refresh_token": "x" * 40}).status_code == 401


def test_cannot_logout_another_users_session(client, db) -> None:
    victim = _login(client, db, "victim@example.test")
    attacker = make_user(db, "attacker@example.test")
    client.post(f"{URL}/logout", json={"refresh_token": victim["refresh_token"]}, headers=auth(attacker))
    assert client.post(f"{URL}/refresh", json={"refresh_token": victim["refresh_token"]}).status_code == 200


# Me, profile, password ------------------------------------------------------

def test_me_lists_memberships_and_pending_invitations(client, db) -> None:
    u = make_user(db, "me@example.test")
    org = make_org(db, slug="me-org", name="Me Org")
    add_member(db, org, u, "qa_lead")  # type: ignore[arg-type]
    body = client.get(f"{URL}/me", headers=auth(u)).json()
    assert body["memberships"] == [{"org": {"id": str(org.id), "name": "Me Org", "slug": "me-org", "ai_enabled": True},
                                    "role": "qa_lead"}]
    assert body["pending_invitations"] == []


def test_me_rejects_bad_token(client) -> None:
    r = client.get(f"{URL}/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401 and code(r) == "unauthorized"


def test_update_profile(client, db) -> None:
    u = make_user(db)
    r = client.patch(f"{URL}/me", json={"full_name": "  New Name  "}, headers=auth(u))
    assert r.status_code == 200 and r.json()["full_name"] == "New Name"
    assert client.patch(f"{URL}/me", json={"full_name": ""}, headers=auth(u)).status_code == 422


def test_change_password(client, db) -> None:
    tokens = _login(client, db, "pw@example.test")
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    bad = client.post(f"{URL}/me/password", json={"current_password": "nope-123456", "new_password": "Brandnew-77"}, headers=h)
    assert bad.status_code == 400 and code(bad) == "wrong_password"
    weak = client.post(f"{URL}/me/password", json={"current_password": PASSWORD, "new_password": "short"}, headers=h)
    assert weak.status_code == 422
    ok = client.post(f"{URL}/me/password", json={"current_password": PASSWORD, "new_password": "Brandnew-77"}, headers=h)
    assert ok.status_code == 204
    assert client.post(f"{URL}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401
    assert client.post(f"{URL}/login", json={"email": "pw@example.test", "password": "Brandnew-77"}).status_code == 200


def test_audit_never_stores_secrets(client, db) -> None:
    _login(client, db, "secret@example.test")
    for ev in db.scalars(select(AuditEvent)):
        assert not {"password", "token", "refresh_token"} & set(ev.data)
