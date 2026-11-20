"""API-027 to API-031: invitations (REQ-006, D-011). The token travels in the request body and in the URL fragment of the
link, never in a path or a query string (BL-014, D-055)."""

from datetime import timedelta

import pytest

from app.core.db import utcnow
from app.modules.orgs.infrastructure.models import Invitation
from conftest import auth, make_user

O = "/api/v1/orgs"
PREVIEW = "/api/v1/invitations/preview"
ACCEPT = "/api/v1/invitations/accept"


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def _invite(client, world, email="new.person@example.test", role="qa_engineer"):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{world.a.org.id}/invitations", json={"email": email, "role": role},
                    headers=world.a.h("org_admin"))
    assert r.status_code == 201, r.text
    return r.json(), r.json()["invite_url"].split("#", 1)[1]


def _preview(client, token):  # type: ignore[no-untyped-def]
    return client.post(PREVIEW, json={"token": token})


def _accept(client, token, headers=None):  # type: ignore[no-untyped-def]
    return client.post(ACCEPT, json={"token": token}, headers=headers or {})


def test_create_preview_and_accept(client, db, world) -> None:
    body, token = _invite(client, world)
    assert body["status"] == "pending" and body["invite_url"] == f"http://localhost:3000/invite#{token}"
    preview = _preview(client, token)
    assert preview.status_code == 200
    assert preview.json()["org_name"] == "Org A" and preview.json()["role"] == "qa_engineer"
    assert preview.json()["email_masked"] == "n•••n@example.test"
    newcomer = make_user(db, "new.person@example.test")
    assert client.get("/api/v1/auth/me", headers=auth(newcomer)).json()["pending_invitations"][0]["org_name"] == "Org A"
    r = _accept(client, token, auth(newcomer))
    assert r.status_code == 200 and r.json()["membership"]["role"] == "qa_engineer"
    assert client.get(f"{O}/{world.a.org.id}", headers=auth(newcomer)).json()["my_role"] == "qa_engineer"
    # single use
    assert code(_accept(client, token, auth(newcomer))) == "invitation_invalid"
    assert _preview(client, token).status_code == 410


def test_the_invite_link_keeps_the_token_in_the_fragment_not_in_the_path_or_query(client, world) -> None:
    body, token = _invite(client, world)
    url = body["invite_url"]
    assert url.count("#") == 1 and "?" not in url
    assert token not in url.split("#", 1)[0]  # nothing before the fragment, which is all a server or a Referer header ever sees
    assert url.split("#", 1)[0] == "http://localhost:3000/invite"


def test_the_old_token_in_path_routes_are_gone(client, db, world) -> None:
    """Removed in I-23 (D-055): the app is not deployed, so no outstanding links need them."""
    _, token = _invite(client, world)
    newcomer = make_user(db, "new.person@example.test")
    assert client.get(f"/api/v1/invitations/{token}").status_code in (404, 405)
    assert client.post(f"/api/v1/invitations/{token}/accept", headers=auth(newcomer)).status_code == 404
    assert _preview(client, token).status_code == 200  # the token itself is still good


def test_accept_needs_matching_email(client, db, world) -> None:
    _, token = _invite(client, world)
    other = make_user(db, "someone.else@example.test")
    r = _accept(client, token, auth(other))
    assert r.status_code == 403 and code(r) == "email_mismatch"


def test_expired_and_revoked_links_are_gone(client, db, world) -> None:
    body, token = _invite(client, world)
    inv = db.get(Invitation, body["id"])
    assert inv is not None
    inv.expires_at = utcnow() - timedelta(minutes=1)
    db.flush()
    assert code(_preview(client, token)) == "invitation_invalid"
    body2, token2 = _invite(client, world, "second@example.test")
    assert client.delete(f"{O}/{world.a.org.id}/invitations/{body2['id']}", headers=world.a.h("org_admin")).status_code == 204
    assert _preview(client, token2).status_code == 410


def test_reinvite_revokes_the_previous_link(client, world) -> None:
    _, first = _invite(client, world)
    _, second = _invite(client, world)
    assert _preview(client, first).status_code == 410
    assert _preview(client, second).status_code == 200


def test_cannot_invite_an_existing_member(client, world) -> None:
    email = world.a.users["developer"].email  # type: ignore[index]
    r = client.post(f"{O}/{world.a.org.id}/invitations", json={"email": email, "role": "viewer"},
                    headers=world.a.h("org_admin"))
    assert r.status_code == 409 and code(r) == "already_member"


def test_invitation_invalid_input(client, world) -> None:
    h = world.a.h("org_admin")
    assert client.post(f"{O}/{world.a.org.id}/invitations", json={"email": "bad", "role": "viewer"}, headers=h).status_code == 422
    assert client.post(f"{O}/{world.a.org.id}/invitations", json={"email": "x@example.test", "role": "owner"}, headers=h).status_code == 422
    assert _preview(client, "short").status_code == 422
    assert _preview(client, "x" * 201).status_code == 422
    assert _preview(client, "z" * 40).status_code == 410
    for body in ({}, {"token": 5}, {"token": None}, {"token": "z" * 40, "extra": 1}):
        assert client.post(PREVIEW, json=body).status_code == 422, body


def test_a_token_in_the_query_string_is_not_read(client, world) -> None:
    _, token = _invite(client, world)
    r = client.post(f"{PREVIEW}?token={token}", json={})
    assert r.status_code == 422  # the body is what counts


def test_list_invitations_with_status_filter(client, world) -> None:
    _invite(client, world)
    r = client.get(f"{O}/{world.a.org.id}/invitations?status=pending", headers=world.a.h("qa_lead"))
    assert r.status_code == 200 and len(r.json()) == 1 and "invite_url" not in r.json()[0]
    assert client.get(f"{O}/{world.a.org.id}/invitations?status=nope", headers=world.a.h("qa_lead")).status_code == 422


@pytest.mark.parametrize("role", ["qa_lead", "qa_engineer", "developer", "viewer"])
def test_only_admin_creates_or_revokes(client, world, role) -> None:
    body, _ = _invite(client, world)
    h = world.a.h(role)
    assert client.post(f"{O}/{world.a.org.id}/invitations", json={"email": "z@example.test", "role": "viewer"},
                       headers=h).status_code == 403
    assert client.delete(f"{O}/{world.a.org.id}/invitations/{body['id']}", headers=h).status_code == 403


@pytest.mark.parametrize("role", ["qa_engineer", "developer", "viewer"])
def test_only_admin_and_lead_list(client, world, role) -> None:
    assert client.get(f"{O}/{world.a.org.id}/invitations", headers=world.a.h(role)).status_code == 403


def test_invitation_of_another_org_cannot_be_revoked(client, world) -> None:
    r = client.post(f"{O}/{world.b.org.id}/invitations", json={"email": "b.person@example.test", "role": "viewer"},
                    headers=world.b.h("org_admin"))
    foreign_id = r.json()["id"]
    assert code(client.delete(f"{O}/{world.a.org.id}/invitations/{foreign_id}", headers=world.a.h("org_admin"))) == "not_found"
    token = r.json()["invite_url"].split("#", 1)[1]
    assert _preview(client, token).status_code == 200  # still valid in org B


def test_accept_requires_sign_in(client, world) -> None:
    _, token = _invite(client, world)
    assert _accept(client, token).status_code == 401
