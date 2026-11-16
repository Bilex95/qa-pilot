"""API-020 to API-026: orgs and members (REQ-004, REQ-005, REQ-007 to REQ-009, REQ-053).
Each endpoint: happy, invalid, unauthorized (see core contract test), forbidden, cross tenant."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from conftest import auth, make_org, make_user

O = "/api/v1/orgs"
ROLES = ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


# API-020 create org ---------------------------------------------------------

def test_create_org_makes_creator_admin(client, db) -> None:
    u = make_user(db)
    r = client.post(O, json={"name": "Lumen Freight", "slug": "Lumen-Freight"}, headers=auth(u))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["org"]["slug"] == "lumen-freight" and body["membership"]["role"] == "org_admin"
    assert client.get(f"{O}/{body['org']['id']}", headers=auth(u)).json()["my_role"] == "org_admin"


def test_create_org_slug_taken_and_invalid(client, db) -> None:
    u = make_user(db)
    make_org(db, slug="taken")
    assert code(client.post(O, json={"name": "X Co", "slug": "taken"}, headers=auth(u))) == "slug_taken"
    for bad in ["a", "-bad", "bad-", "has space", "dou--ble", "api"]:
        r = client.post(O, json={"name": "X Co", "slug": bad}, headers=auth(u))
        assert r.status_code == 422, bad
    assert client.post(O, json={"name": "X", "slug": "fine-slug"}, headers=auth(u)).status_code == 422  # name too short


# API-021 my orgs, API-022 get org ------------------------------------------------

def test_my_orgs_lists_only_my_memberships(client, world) -> None:
    r = client.get(O, headers=world.a.h("viewer"))
    assert [o["org"]["id"] for o in r.json()] == [str(world.a.org.id)]
    assert r.json()[0]["role"] == "viewer"


@pytest.mark.parametrize("role", ROLES)
def test_every_role_can_read_its_org(client, world, role) -> None:
    r = client.get(f"{O}/{world.a.org.id}", headers=world.a.h(role))
    assert r.status_code == 200 and r.json()["my_role"] == role


def test_removed_member_loses_access(client, db, world) -> None:
    world.a.memberships["viewer"].status = "removed"  # type: ignore[index]
    db.flush()
    assert code(client.get(f"{O}/{world.a.org.id}", headers=world.a.h("viewer"))) == "org_not_found"


# API-023 update settings --------------------------------------------------------

def test_admin_updates_settings_and_it_is_audited(client, db, world) -> None:
    r = client.patch(f"{O}/{world.a.org.id}", json={"name": "Renamed", "ai_enabled": False, "ai_daily_limit": 300},
                     headers=world.a.h("org_admin"))
    assert r.status_code == 200 and r.json()["ai_enabled"] is False and r.json()["ai_daily_limit"] == 300
    actions = set(db.scalars(select(AuditEvent.action).where(AuditEvent.org_id == world.a.org.id)))
    assert {"org.settings_updated", "ai.disabled", "ai.limit_changed"} <= actions


@pytest.mark.parametrize("role", ["qa_lead", "qa_engineer", "developer", "viewer"])
def test_non_admins_cannot_update_settings(client, world, role) -> None:
    r = client.patch(f"{O}/{world.a.org.id}", json={"name": "Nope"}, headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"


def test_update_settings_invalid(client, world) -> None:
    h = world.a.h("org_admin")
    assert client.patch(f"{O}/{world.a.org.id}", json={}, headers=h).status_code == 422
    assert client.patch(f"{O}/{world.a.org.id}", json={"ai_daily_limit": 0}, headers=h).status_code == 422
    assert client.patch(f"{O}/{world.a.org.id}", json={"slug": "new"}, headers=h).status_code == 422


# API-024 list members -------------------------------------------------------------

def test_members_list_pages_and_shows_email_to_leads_only(client, world) -> None:
    lead = client.get(f"{O}/{world.a.org.id}/members?page_size=2", headers=world.a.h("qa_lead")).json()
    assert lead["total"] == 5 and len(lead["items"]) == 2 and lead["items"][0]["user"]["email"]
    dev = client.get(f"{O}/{world.a.org.id}/members", headers=world.a.h("developer")).json()
    assert dev["total"] == 5 and all(m["user"]["email"] is None for m in dev["items"])


def test_members_filters(client, world) -> None:
    r = client.get(f"{O}/{world.a.org.id}/members?role=developer", headers=world.a.h("org_admin")).json()
    assert [m["role"] for m in r["items"]] == ["developer"]
    q = client.get(f"{O}/{world.a.org.id}/members?q=VIEWER", headers=world.a.h("org_admin")).json()
    assert q["total"] == 1
    assert client.get(f"{O}/{world.a.org.id}/members?role=king", headers=world.a.h("org_admin")).status_code == 422
    assert client.get(f"{O}/{world.a.org.id}/members?page_size=101", headers=world.a.h("org_admin")).status_code == 422


def test_members_never_include_other_tenants(client, world) -> None:
    ids = {m["user"]["id"] for m in client.get(f"{O}/{world.a.org.id}/members", headers=world.a.h("org_admin")).json()["items"]}
    assert not ids & {str(u.id) for u in world.b.users.values()}


# API-025 change role, API-026 remove ----------------------------------------------

def test_admin_changes_role(client, db, world) -> None:
    mid = world.a.memberships["developer"].id  # type: ignore[index]
    r = client.patch(f"{O}/{world.a.org.id}/members/{mid}", json={"role": "qa_lead"}, headers=world.a.h("org_admin"))
    assert r.status_code == 200 and r.json()["role"] == "qa_lead"
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "member.role_changed"))
    # takes effect on the next request
    assert client.get(f"{O}/{world.a.org.id}", headers=world.a.h("developer")).json()["my_role"] == "qa_lead"


def test_last_admin_cannot_be_demoted_or_removed(client, world) -> None:
    mid = world.a.memberships["org_admin"].id  # type: ignore[index]
    h = world.a.h("org_admin")
    r = client.patch(f"{O}/{world.a.org.id}/members/{mid}", json={"role": "viewer"}, headers=h)
    assert r.status_code == 409 and code(r) == "last_admin"
    r = client.delete(f"{O}/{world.a.org.id}/members/{mid}", headers=h)
    assert r.status_code == 409 and code(r) == "last_admin"


def test_second_admin_can_demote_first(client, world) -> None:
    h = world.a.h("org_admin")
    lead_mid = world.a.memberships["qa_lead"].id  # type: ignore[index]
    client.patch(f"{O}/{world.a.org.id}/members/{lead_mid}", json={"role": "org_admin"}, headers=h)
    admin_mid = world.a.memberships["org_admin"].id  # type: ignore[index]
    assert client.patch(f"{O}/{world.a.org.id}/members/{admin_mid}", json={"role": "viewer"},
                        headers=world.a.h("qa_lead")).status_code == 200


def test_remove_member(client, world) -> None:
    mid = world.a.memberships["viewer"].id  # type: ignore[index]
    assert client.delete(f"{O}/{world.a.org.id}/members/{mid}", headers=world.a.h("org_admin")).status_code == 204
    assert client.get(f"{O}/{world.a.org.id}", headers=world.a.h("viewer")).status_code == 404


@pytest.mark.parametrize("role", ["qa_lead", "qa_engineer", "developer", "viewer"])
def test_only_admin_manages_members(client, world, role) -> None:
    mid = world.a.memberships["viewer"].id  # type: ignore[index]
    h = world.a.h(role)
    assert client.patch(f"{O}/{world.a.org.id}/members/{mid}", json={"role": "qa_lead"}, headers=h).status_code == 403
    assert client.delete(f"{O}/{world.a.org.id}/members/{mid}", headers=h).status_code == 403


def test_member_of_another_org_is_not_found(client, world) -> None:
    """Membership id from org B used under org A's path: 404, not a change in org B."""
    foreign = world.b.memberships["developer"].id  # type: ignore[index]
    h = world.a.h("org_admin")
    assert code(client.patch(f"{O}/{world.a.org.id}/members/{foreign}", json={"role": "viewer"}, headers=h)) == "not_found"
    assert code(client.delete(f"{O}/{world.a.org.id}/members/{foreign}", headers=h)) == "not_found"
    assert client.get(f"{O}/{world.b.org.id}", headers=world.b.h("developer")).json()["my_role"] == "developer"


def test_change_role_invalid(client, world) -> None:
    mid = world.a.memberships["viewer"].id  # type: ignore[index]
    h = world.a.h("org_admin")
    assert client.patch(f"{O}/{world.a.org.id}/members/{mid}", json={"role": "god"}, headers=h).status_code == 422
    assert client.patch(f"{O}/{world.a.org.id}/members/not-a-uuid", json={"role": "viewer"}, headers=h).status_code == 422
    assert client.patch(f"{O}/{world.a.org.id}/members/{uuid.uuid4()}", json={"role": "viewer"}, headers=h).status_code == 404
