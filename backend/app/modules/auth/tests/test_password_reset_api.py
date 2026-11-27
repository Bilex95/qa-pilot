"""API-151 to API-153 (I-23, D-045, D-055): an Org Admin issues a single use, one hour reset link; the person previews it and
sets a new password with it. The token travels in the URL fragment and in request bodies only.
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.db import utcnow
from app.core.security import token_hash
from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.auth.application import service
from app.modules.auth.infrastructure.models import PasswordReset
from app.modules.orgs.infrastructure.models import Membership
from conftest import PASSWORD

O = "/api/v1/orgs"
A = "/api/v1/auth"
NEW_PASSWORD = "Brand-new-pass-77"
NON_ADMINS = ["qa_lead", "qa_engineer", "developer", "viewer"]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def link(client, world, role="developer", admin="org_admin"):  # type: ignore[no-untyped-def]
    """Create a reset link for the member with this role in org A through the API; returns (response, token)."""
    m = world.a.memberships[role]
    r = client.post(f"{O}/{world.a.org.id}/members/{m.id}/password-reset", headers=world.a.h(admin))
    token = r.json()["reset_url"].split("#", 1)[1] if r.status_code == 201 else ""
    return r, token


def preview(client, token):  # type: ignore[no-untyped-def]
    return client.post(f"{A}/password-reset/preview", json={"token": token})


def confirm(client, token, password=NEW_PASSWORD):  # type: ignore[no-untyped-def]
    return client.post(f"{A}/password-reset/confirm", json={"token": token, "new_password": password})


def login(client, user, password=PASSWORD):  # type: ignore[no-untyped-def]
    return client.post(f"{A}/login", json={"email": user.email, "password": password})


# API-151 create the link ------------------------------------------------------------------

def test_admin_creates_a_link_with_the_token_in_the_fragment(client, db, world) -> None:
    r, token = link(client, world)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["reset_url"] == f"http://localhost:3000/reset-password#{token}" and len(token) >= 40
    assert "?" not in body["reset_url"] and token not in body["reset_url"].split("#", 1)[0]
    expires = utcnow() + timedelta(minutes=60)
    assert abs((expires - datetime.fromisoformat(body["expires_at"])).total_seconds()) < 30  # one hour
    reset = db.scalar(select(PasswordReset))
    assert reset is not None and reset.token_hash == token_hash(token) and reset.token_hash != token  # only the hash is stored
    assert reset.user_id == world.a.users["developer"].id and reset.created_by_id == world.a.users["org_admin"].id
    assert reset.used_at is None and reset.revoked_at is None
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "auth.reset_link_created"))
    assert event is not None and event.org_id == world.a.org.id and event.actor_id == world.a.users["org_admin"].id
    assert event.entity_id == str(world.a.users["developer"].id) and token not in str(event.data)  # the audit never holds the token


@pytest.mark.parametrize("role", NON_ADMINS)
def test_only_an_org_admin_creates_a_link(client, world, role) -> None:
    r, _ = link(client, world, admin=role)
    assert r.status_code == 403 and code(r) == "forbidden"


def test_an_admin_cannot_reset_their_own_account(client, world) -> None:
    r, _ = link(client, world, role="org_admin")
    assert r.status_code == 409 and code(r) == "own_account" and "profile" in r.json()["error"]["message"]


def test_a_person_in_more_than_one_workspace_cannot_be_reset(client, db, world) -> None:
    """The password is global: an admin of one workspace must not take over access to another (D-055)."""
    person = world.a.users["developer"]
    db.add(Membership(org_id=world.b.org.id, user_id=person.id, role="viewer", status="active"))
    db.flush()
    r, _ = link(client, world)
    assert r.status_code == 409 and code(r) == "shared_account"
    assert db.scalar(select(PasswordReset)) is None  # nothing was created


def test_a_member_who_left_the_other_workspace_can_be_reset(client, db, world) -> None:
    person = world.a.users["developer"]
    db.add(Membership(org_id=world.b.org.id, user_id=person.id, role="viewer", status="removed"))
    db.flush()
    assert link(client, world)[0].status_code == 201


def test_unknown_foreign_and_removed_memberships_are_404(client, world) -> None:
    h = world.a.h("org_admin")
    for membership_id in (uuid.uuid4(), world.b.memberships["developer"].id):  # a member of org B is not found in org A
        r = client.post(f"{O}/{world.a.org.id}/members/{membership_id}/password-reset", headers=h)
        assert r.status_code == 404 and code(r) == "not_found"
    assert client.post(f"{O}/{world.a.org.id}/members/not-a-uuid/password-reset", headers=h).status_code == 422
    world.a.memberships["viewer"].status = "removed"
    assert link(client, world, role="viewer")[0].status_code == 404


def test_a_newer_link_replaces_the_older_one(client, world) -> None:
    _, first = link(client, world)
    _, second = link(client, world)
    assert preview(client, first).status_code == 410
    assert preview(client, second).status_code == 200


# API-152 preview ---------------------------------------------------------------------------

def test_preview_of_a_good_link_shows_the_masked_email_and_the_expiry(client, world) -> None:
    _, token = link(client, world)
    r = preview(client, token)
    assert r.status_code == 200
    local, _, domain = world.a.users["developer"].email.partition("@")  # type: ignore[attr-defined]
    assert r.json()["email_masked"] == f"{local[0]}•••{local[-1]}@{domain}" and "expires_at" in r.json()


def _bad_tokens(db, world, client):  # type: ignore[no-untyped-def]
    """An unknown, a used, an expired and a replaced link: four different reasons."""
    user, admin = world.a.users["developer"], world.a.users["org_admin"]
    used = service.issue_password_reset(db, user_id=user.id, org_id=world.a.org.id, actor_id=admin.id)
    expired = service.issue_password_reset(db, user_id=world.a.users["viewer"].id, org_id=world.a.org.id, actor_id=admin.id)
    db.execute(PasswordReset.__table__.update().where(PasswordReset.token_hash == token_hash(expired[0]))
               .values(expires_at=utcnow() - timedelta(seconds=1)))
    replaced = service.issue_password_reset(db, user_id=world.a.users["qa_engineer"].id, org_id=world.a.org.id, actor_id=admin.id)
    service.issue_password_reset(db, user_id=world.a.users["qa_engineer"].id, org_id=world.a.org.id, actor_id=admin.id)
    assert confirm(client, used[0]).status_code == 204  # now used
    return {"unknown": "z" * 64, "used": used[0], "expired": expired[0], "replaced": replaced[0]}


def test_every_kind_of_bad_link_gets_the_identical_answer(client, db, world) -> None:
    """Nothing tells an unknown link from a used, expired or replaced one (no oracle)."""
    bad = _bad_tokens(db, world, client)
    answers = {name: preview(client, token) for name, token in bad.items()}
    assert {r.status_code for r in answers.values()} == {410}
    assert len({r.text for r in answers.values()}) == 1 and code(answers["unknown"]) == "reset_invalid"
    confirms = {name: confirm(client, token) for name, token in bad.items()}
    assert {r.status_code for r in confirms.values()} == {410} and len({r.text for r in confirms.values()}) == 1
    assert confirms["used"].text == answers["unknown"].text  # the same text for preview and confirm too


@pytest.mark.parametrize("body", [{}, {"token": ""}, {"token": "short"}, {"token": "x" * 201}, {"token": 5}, {"token": None},
                                  {"token": "z" * 40, "extra": 1}])
def test_preview_invalid_input(client, body) -> None:
    r = client.post(f"{A}/password-reset/preview", json=body)
    assert r.status_code == 422 and code(r) == "validation_error"


def test_a_token_in_the_query_or_the_path_is_not_read(client, world) -> None:
    _, token = link(client, world)
    assert client.post(f"{A}/password-reset/preview?token={token}", json={}).status_code == 422
    assert client.get(f"{A}/password-reset/{token}").status_code in (404, 405)
    assert client.post(f"{A}/password-reset/{token}", json={}).status_code in (404, 405)


# API-153 confirm ---------------------------------------------------------------------------

def test_the_person_sets_a_new_password_and_every_session_ends(client, db, world) -> None:
    person = world.a.users["developer"]
    first = login(client, person).json()  # an open session with a refresh token
    assert client.get(f"{A}/me", headers={"Authorization": f"Bearer {first['access_token']}"}).status_code == 200
    _, token = link(client, world)
    r = confirm(client, token)
    assert r.status_code == 204 and r.content == b""
    assert login(client, person).status_code == 401  # the old password is gone
    new = login(client, person, NEW_PASSWORD)
    assert new.status_code == 200
    assert client.post(f"{A}/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401  # refresh tokens revoked
    old_access = client.get(f"{A}/me", headers={"Authorization": f"Bearer {first['access_token']}"})
    assert old_access.status_code == 401 and code(old_access) == "unauthorized"  # access tokens refused at once (D-055)
    fresh = client.get(f"{A}/me", headers={"Authorization": f"Bearer {new.json()['access_token']}"})
    assert fresh.status_code == 200  # a token issued after the change works, even in the same second
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "auth.password_reset"))
    assert event is not None and event.org_id == world.a.org.id and event.actor_id == person.id
    assert token not in str(event.data) and NEW_PASSWORD not in str(event.data)


def test_a_link_works_once(client, world) -> None:
    _, token = link(client, world)
    assert confirm(client, token).status_code == 204
    again = confirm(client, token, "Another-pass-88")
    assert again.status_code == 410 and code(again) == "reset_invalid"
    assert preview(client, token).status_code == 410
    assert login(client, world.a.users["developer"], NEW_PASSWORD).status_code == 200  # the first password still stands


def test_a_weak_password_is_refused_and_the_link_stays_usable(client, world) -> None:
    _, token = link(client, world)
    for weak in ("short1", "onlyletterslong", "1234567890123"):
        r = confirm(client, token, weak)
        assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "new_password"], weak
    assert preview(client, token).status_code == 200
    assert confirm(client, token).status_code == 204


def test_a_bad_link_is_a_410_whatever_the_password_so_there_is_no_policy_oracle(client) -> None:
    r = confirm(client, "z" * 40, "weak")
    assert r.status_code == 410 and code(r) == "reset_invalid"


@pytest.mark.parametrize("body", [{}, {"token": "z" * 40}, {"new_password": NEW_PASSWORD}, {"token": "short", "new_password": NEW_PASSWORD},
                                  {"token": "z" * 40, "new_password": ""}, {"token": "z" * 40, "new_password": "x" * 129},
                                  {"token": "z" * 40, "new_password": NEW_PASSWORD, "extra": 1}])
def test_confirm_invalid_input(client, body) -> None:
    r = client.post(f"{A}/password-reset/confirm", json=body)
    assert r.status_code == 422 and code(r) == "validation_error"


def test_an_expired_link_is_refused_at_the_second_it_expires(client, db, world) -> None:
    person, admin = world.a.users["developer"], world.a.users["org_admin"]
    raw, _ = service.issue_password_reset(db, user_id=person.id, org_id=world.a.org.id, actor_id=admin.id)
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_hash(raw)))
    assert reset is not None
    reset.expires_at = utcnow() + timedelta(seconds=30)
    db.flush()
    assert preview(client, raw).status_code == 200  # still inside the hour
    reset.expires_at = utcnow() - timedelta(microseconds=1)
    db.flush()
    assert preview(client, raw).status_code == 410 and confirm(client, raw).status_code == 410
    assert login(client, person).status_code == 200  # the password was not changed


def test_a_deactivated_person_cannot_use_a_link(client, db, world) -> None:
    _, token = link(client, world)
    world.a.users["developer"].is_active = False
    db.flush()
    assert preview(client, token).status_code == 410 and confirm(client, token).status_code == 410


def test_confirming_also_revokes_other_pending_links_of_the_person(client, db, world) -> None:
    person, admin = world.a.users["developer"], world.a.users["org_admin"]
    first = service.issue_password_reset(db, user_id=person.id, org_id=world.a.org.id, actor_id=admin.id)
    # a second row that is still pending (as if created by another path): confirming must revoke it
    second = PasswordReset(user_id=person.id, org_id=world.a.org.id, created_by_id=admin.id, token_hash=token_hash("second-token-123"),
                           expires_at=utcnow() + timedelta(minutes=30))
    db.add(second)
    db.flush()
    assert confirm(client, first[0]).status_code == 204
    db.refresh(second)
    assert second.revoked_at is not None and preview(client, "second-token-123").status_code == 410


def test_two_requests_with_the_same_link_cannot_both_win(engine) -> None:
    """Real concurrent sessions and commits (the shared test session cannot overlap). Cleans up what it creates."""
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import delete
    from sqlalchemy.orm import Session

    from app.core.errors import Gone
    from app.modules.auth.infrastructure.models import User
    from app.modules.orgs.infrastructure.models import Organization

    tag = uuid.uuid4().hex[:8]
    started = utcnow()
    with Session(engine) as s:
        admin = User(email=f"race-admin-{tag}@example.test", full_name="Admin", password_hash="x")
        person = User(email=f"race-person-{tag}@example.test", full_name="Person", password_hash="x")
        org = Organization(name="Race org", slug=f"race-{tag}", ai_daily_limit=1)
        s.add_all([admin, person, org])
        s.flush()
        s.add_all([Membership(org_id=org.id, user_id=admin.id, role="org_admin", status="active"),
                   Membership(org_id=org.id, user_id=person.id, role="developer", status="active")])
        s.commit()
        raw, _ = service.issue_password_reset(s, user_id=person.id, org_id=org.id, actor_id=admin.id)
        ids = (admin.id, person.id, org.id)

    def attempt(n: int) -> str:
        with Session(engine) as session:
            try:
                service.confirm_password_reset(session, token=raw, new_password=f"Race-winner-{n}-pass")
                return "won"
            except Gone:
                return "gone"

    try:
        with ThreadPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(attempt, range(6)))
        assert results.count("won") == 1 and results.count("gone") == 5, results
    finally:
        with Session(engine) as s:
            s.execute(delete(Organization).where(Organization.id == ids[2]))  # cascades to memberships, resets and org events
            s.execute(delete(User).where(User.id.in_(ids[:2])))
            # the losing attempts wrote failure events that belong to no org: remove the ones this test made
            s.execute(delete(AuditEvent).where(AuditEvent.action == "auth.reset_failed", AuditEvent.created_at >= started))
            s.commit()


# Throttle ---------------------------------------------------------------------------------

def test_failed_attempts_from_one_address_are_throttled_for_preview_and_confirm(client, world) -> None:
    _, good = link(client, world)
    for _ in range(10):
        assert preview(client, "z" * 40).status_code == 410
    for r in (preview(client, good), confirm(client, good)):  # even a good link waits: the address is blocked
        assert r.status_code == 429 and code(r) == "rate_limited" and r.headers["Retry-After"] == "900"
    assert login(client, world.a.users["developer"]).status_code == 200  # login has its own counters and is not affected


def test_a_failure_is_recorded_without_the_token(db, client) -> None:
    preview(client, "secret-looking-token-value")
    events = list(db.scalars(select(AuditEvent).where(AuditEvent.action == "auth.reset_failed")))
    assert len(events) == 1 and events[0].ip and "secret-looking-token-value" not in str(events[0].data)
    assert events[0].actor_id is None


# Sessions after a normal password change ---------------------------------------------------

def bearer(tokens: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def test_a_password_change_keeps_this_device_signed_in_and_ends_every_other_session(client, db, world) -> None:
    from app.core.security import decode_access_token, to_microseconds

    person = world.a.users["developer"]
    this_device = login(client, person).json()  # the device that makes the change
    other_device = login(client, person).json()  # another session of the same person
    r = client.post(f"{A}/me/password", json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
                    headers=bearer(this_device))
    assert r.status_code == 200, r.text
    fresh = r.json()
    assert set(fresh) >= {"access_token", "refresh_token", "expires_in", "token_type"}
    # the tokens in use before the change are refused, on this device and on the other one
    assert client.get(f"{A}/me", headers=bearer(this_device)).status_code == 401
    assert client.get(f"{A}/me", headers=bearer(other_device)).status_code == 401
    # every earlier refresh token is revoked: the other device cannot come back, and neither can the old pair of this one
    assert client.post(f"{A}/refresh", json={"refresh_token": other_device["refresh_token"]}).status_code == 401
    assert client.post(f"{A}/refresh", json={"refresh_token": this_device["refresh_token"]}).status_code == 401
    # the pair returned by the change works at once, even inside the second of the change, and its refresh token rotates
    assert client.get(f"{A}/me", headers=bearer(fresh)).status_code == 200
    claims = decode_access_token(fresh["access_token"])
    assert claims is not None and person.password_changed_at is not None
    assert claims["iat_us"] > to_microseconds(person.password_changed_at)  # issued after the change, never at or before it
    rotated = client.post(f"{A}/refresh", json={"refresh_token": fresh["refresh_token"]})
    assert rotated.status_code == 200 and client.get(f"{A}/me", headers=bearer(rotated.json())).status_code == 200
    assert login(client, person, NEW_PASSWORD).status_code == 200 and login(client, person).status_code == 401


def test_a_refused_password_change_changes_nothing(client, db, world) -> None:
    person = world.a.users["developer"]
    device = login(client, person).json()
    for body, status in (({"current_password": "Wrong-pass-123", "new_password": NEW_PASSWORD}, 400),
                         ({"current_password": PASSWORD, "new_password": "short"}, 422)):
        assert client.post(f"{A}/me/password", json=body, headers=bearer(device)).status_code == status
    assert client.get(f"{A}/me", headers=bearer(device)).status_code == 200  # the session and the password are untouched
    assert client.post(f"{A}/refresh", json={"refresh_token": device["refresh_token"]}).status_code == 200
    assert login(client, person).status_code == 200


# Removing a person ends their reset links (D-056, BL-020) ------------------------------------------

def remove(client, world, role="developer"):  # type: ignore[no-untyped-def]
    m = world.a.memberships[role]
    return client.delete(f"{O}/{world.a.org.id}/members/{m.id}", headers=world.a.h("org_admin"))


def test_removing_a_person_revokes_their_live_reset_link_and_ends_their_sessions(client, db, world) -> None:
    person = world.a.users["developer"]
    device = login(client, person).json()
    _, token = link(client, world)
    assert preview(client, token).status_code == 200
    assert remove(client, world).status_code == 204
    assert preview(client, token).status_code == 410 and confirm(client, token).status_code == 410
    reset = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_hash(token)))
    assert reset is not None and reset.revoked_at is not None and reset.used_at is None
    # no workspace is left, so the sessions end as well
    assert client.get(f"{A}/me", headers=bearer(device)).status_code == 401
    assert client.post(f"{A}/refresh", json={"refresh_token": device["refresh_token"]}).status_code == 401


def test_a_person_still_in_another_workspace_keeps_their_sessions(client, db, world) -> None:
    person = world.a.users["developer"]
    db.add(Membership(org_id=world.b.org.id, user_id=person.id, role="viewer", status="active"))
    db.flush()
    device = login(client, person).json()
    # a link cannot be issued for a shared account, so one that predates the second membership is simulated
    reset = PasswordReset(user_id=person.id, org_id=world.a.org.id, created_by_id=world.a.users["org_admin"].id,
                          token_hash=token_hash("old-link-token-1"), expires_at=utcnow() + timedelta(minutes=30))
    db.add(reset)
    db.flush()
    assert remove(client, world).status_code == 204
    assert preview(client, "old-link-token-1").status_code == 410  # the link still ends
    assert client.get(f"{A}/me", headers=bearer(device)).status_code == 200  # the account is shared: sessions stay
    assert client.post(f"{A}/refresh", json={"refresh_token": device["refresh_token"]}).status_code == 200
    assert client.get(f"{O}/{world.b.org.id}", headers=bearer(device)).status_code == 200  # the other workspace is untouched


def test_removing_a_person_leaves_other_people_links_alone(client, world) -> None:
    _, other = link(client, world, role="viewer")
    assert remove(client, world, role="developer").status_code == 204
    assert preview(client, other).status_code == 200
