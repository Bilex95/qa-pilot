"""API-027 to API-031: invitations (REQ-006, D-011)."""

from datetime import timedelta

import pytest

from app.core.db import utcnow
from app.modules.orgs.infrastructure.models import Invitation
from conftest import auth, make_user

O = "/api/v1/orgs"


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def _invite(client, world, email="new.person@example.test", role="qa_engineer"):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{world.a.org.id}/invitations", json={"email": email, "role": role},
                    headers=world.a.h("org_admin"))
    assert r.status_code == 201, r.text
    return r.json(), r.json()["invite_url"].rsplit("/", 1)[1]


def test_create_preview_and_accept(client, db, world) -> None:
    body, token = _invite(client, world)
    assert body["status"] == "pending" and body["invite_url"].startswith("http://localhost:3000/invite/")
    preview = client.get(f"/api/v1/invitations/{token}")
    assert preview.status_code == 200
    assert preview.json()["org_name"] == "Org A" and preview.json()["role"] == "qa_engineer"
    assert preview.json()["email_masked"] == "n•••n@example.test"
    newcomer = make_user(db, "new.person@example.test")
    assert client.get("/api/v1/auth/me", headers=auth(newcomer)).json()["pending_invitations"][0]["org_name"] == "Org A"
    r = client.post(f"/api/v1/invitations/{token}/accept", headers=auth(newcomer))
    assert r.status_code == 200 and r.json()["membership"]["role"] == "qa_engineer"
    assert client.get(f"{O}/{world.a.org.id}", headers=auth(newcomer)).json()["my_role"] == "qa_engineer"
    # single use
    assert code(client.post(f"/api/v1/invitations/{token}/accept", headers=auth(newcomer))) == "invitation_invalid"
    assert client.get(f"/api/v1/invitations/{token}").status_code == 410


def test_accept_needs_matching_email(client, db, world) -> None:
    _, token = _invite(client, world)
    other = make_user(db, "someone.else@example.test")
    r = client.post(f"/api/v1/invitations/{token}/accept", headers=auth(other))
    assert r.status_code == 403 and code(r) == "email_mismatch"


def test_expired_and_revoked_links_are_gone(client, db, world) -> None:
    body, token = _invite(client, world)
    inv = db.get(Invitation, body["id"])
    assert inv is not None
    inv.expires_at = utcnow() - timedelta(minutes=1)
    db.flush()
    assert code(client.get(f"/api/v1/invitations/{token}")) == "invitation_invalid"
    body2, token2 = _invite(client, world, "second@example.test")
    assert client.delete(f"{O}/{world.a.org.id}/invitations/{body2['id']}", headers=world.a.h("org_admin")).status_code == 204
    assert client.get(f"/api/v1/invitations/{token2}").status_code == 410


def test_reinvite_revokes_the_previous_link(client, world) -> None:
    _, first = _invite(client, world)
    _, second = _invite(client, world)
    assert client.get(f"/api/v1/invitations/{first}").status_code == 410
    assert client.get(f"/api/v1/invitations/{second}").status_code == 200


def test_cannot_invite_an_existing_member(client, world) -> None:
    email = world.a.users["developer"].email  # type: ignore[index]
    r = client.post(f"{O}/{world.a.org.id}/invitations", json={"email": email, "role": "viewer"},
                    headers=world.a.h("org_admin"))
    assert r.status_code == 409 and code(r) == "already_member"


def test_invitation_invalid_input(client, world) -> None:
    h = world.a.h("org_admin")
    assert client.post(f"{O}/{world.a.org.id}/invitations", json={"email": "bad", "role": "viewer"}, headers=h).status_code == 422
    assert client.post(f"{O}/{world.a.org.id}/invitations", json={"email": "x@example.test", "role": "owner"}, headers=h).status_code == 422
    assert client.get("/api/v1/invitations/short").status_code == 422
    assert client.get(f"/api/v1/invitations/{'z' * 40}").status_code == 410


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
    token = r.json()["invite_url"].rsplit("/", 1)[1]
    assert client.get(f"/api/v1/invitations/{token}").status_code == 200  # still valid in org B


def test_accept_requires_sign_in(client, world) -> None:
    _, token = _invite(client, world)
    assert client.post(f"/api/v1/invitations/{token}/accept").status_code == 401
