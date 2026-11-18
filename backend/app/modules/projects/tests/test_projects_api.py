"""API-040 to API-051 (I-01): happy, invalid, forbidden and cross tenant for every endpoint.
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent

O = "/api/v1/orgs"
MANAGERS = ["org_admin", "qa_lead"]
NON_MANAGERS = ["qa_engineer", "developer", "viewer"]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def make_project(client, tenant, key="WEB", name="Customer portal"):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/projects", json={"name": name, "key": key, "description": "Shippers"},
                    headers=tenant.h("qa_lead"))
    assert r.status_code == 201, r.text
    return r.json()


# API-041 create, API-042 get --------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_managers_create_project_with_default_environments(client, db, world, role) -> None:
    r = client.post(f"{O}/{world.a.org.id}/projects", json={"name": "Customer portal", "key": " web "},
                    headers=world.a.h(role))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["key"] == "WEB" and body["open_bug_count"] == 0 and body["archived_at"] is None
    assert [e["name"] for e in body["environments"]] == ["dev", "staging", "prod"]
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "project.created"))


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_others_cannot_create_projects(client, world, role) -> None:
    r = client.post(f"{O}/{world.a.org.id}/projects", json={"name": "Nope", "key": "NOPE"}, headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"


def test_create_project_invalid_and_duplicate_key(client, world) -> None:
    make_project(client, world.a)
    h = world.a.h("org_admin")
    dup = client.post(f"{O}/{world.a.org.id}/projects", json={"name": "Again", "key": "web"}, headers=h)
    assert dup.status_code == 409 and code(dup) == "key_taken"
    for bad in ["W", "TOOLONGKEY", "W3B", "WE B", "WE-B"]:
        r = client.post(f"{O}/{world.a.org.id}/projects", json={"name": "Bad key", "key": bad}, headers=h)
        assert r.status_code == 422, bad
    assert client.post(f"{O}/{world.a.org.id}/projects", json={"name": "X", "key": "OK"}, headers=h).status_code == 422
    assert client.post(f"{O}/{world.a.org.id}/projects", json={"key": "OK"}, headers=h).status_code == 422


def test_same_key_is_allowed_in_another_org(client, world) -> None:
    make_project(client, world.a)
    make_project(client, world.b)


@pytest.mark.parametrize("role", ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"])
def test_every_role_reads_a_project(client, world, role) -> None:
    p = make_project(client, world.a)
    r = client.get(f"{O}/{world.a.org.id}/projects/{p['id']}", headers=world.a.h(role))
    assert r.status_code == 200 and r.json()["key"] == "WEB" and len(r.json()["environments"]) == 3


def test_project_of_another_org_is_not_found(client, world) -> None:
    foreign = make_project(client, world.b)
    h = world.a.h("org_admin")
    assert code(client.get(f"{O}/{world.a.org.id}/projects/{foreign['id']}", headers=h)) == "not_found"
    assert code(client.patch(f"{O}/{world.a.org.id}/projects/{foreign['id']}", json={"name": "Hijack"}, headers=h)) == "not_found"
    assert client.get(f"{O}/{world.a.org.id}/projects/not-a-uuid", headers=h).status_code == 422


# API-040 list -------------------------------------------------------------------------

def test_list_hides_archived_unless_asked_and_pages(client, world) -> None:
    make_project(client, world.a, "WEB", "Customer portal")
    api = make_project(client, world.a, "API", "Shipping API")
    make_project(client, world.a, "MOB", "Driver app")
    h = world.a.h("org_admin")
    client.patch(f"{O}/{world.a.org.id}/projects/{api['id']}", json={"archived": True}, headers=h)
    visible = client.get(f"{O}/{world.a.org.id}/projects", headers=world.a.h("viewer")).json()
    assert [p["name"] for p in visible["items"]] == ["Customer portal", "Driver app"]  # sorted by name
    assert visible["total"] == 2
    every = client.get(f"{O}/{world.a.org.id}/projects?include_archived=true&page_size=2", headers=h).json()
    assert every["total"] == 3 and len(every["items"]) == 2
    assert client.get(f"{O}/{world.a.org.id}/projects?page_size=0", headers=h).status_code == 422


def test_list_never_shows_other_tenants(client, world) -> None:
    make_project(client, world.b, "SEC", "Other tenant")
    assert client.get(f"{O}/{world.a.org.id}/projects", headers=world.a.h("org_admin")).json()["total"] == 0


# API-043 update and archive -------------------------------------------------------------

def test_update_and_archive_project(client, db, world) -> None:
    p = make_project(client, world.a)
    h = world.a.h("qa_lead")
    r = client.patch(f"{O}/{world.a.org.id}/projects/{p['id']}", json={"name": "Renamed portal"}, headers=h)
    assert r.status_code == 200 and r.json()["name"] == "Renamed portal" and r.json()["key"] == "WEB"
    first = client.patch(f"{O}/{world.a.org.id}/projects/{p['id']}", json={"archived": True}, headers=h).json()
    again = client.patch(f"{O}/{world.a.org.id}/projects/{p['id']}", json={"archived": True}, headers=h).json()
    assert first["archived_at"] is not None and again["archived_at"] == first["archived_at"]  # no op
    archived_events = db.scalars(select(AuditEvent).where(AuditEvent.action == "project.archived")).all()
    assert len(archived_events) == 1
    restored = client.patch(f"{O}/{world.a.org.id}/projects/{p['id']}", json={"archived": False}, headers=h).json()
    assert restored["archived_at"] is None


def test_update_project_invalid_and_forbidden(client, world) -> None:
    p = make_project(client, world.a)
    url = f"{O}/{world.a.org.id}/projects/{p['id']}"
    assert client.patch(url, json={}, headers=world.a.h("org_admin")).status_code == 422
    assert client.patch(url, json={"key": "NEW"}, headers=world.a.h("org_admin")).status_code == 422  # key never changes here
    assert client.patch(url, json={"name": "A"}, headers=world.a.h("org_admin")).status_code == 422
    for role in NON_MANAGERS:
        assert client.patch(url, json={"archived": True}, headers=world.a.h(role)).status_code == 403


# API-044 to API-047 components ------------------------------------------------------------

def test_components_crud(client, world) -> None:
    p = make_project(client, world.a)
    h = world.a.h("qa_lead")
    base = f"{O}/{world.a.org.id}"
    c1 = client.post(f"{base}/projects/{p['id']}/components", json={"name": "Checkout"}, headers=h)
    c2 = client.post(f"{base}/projects/{p['id']}/components", json={"name": "Accounts", "description": "Sign in"}, headers=h)
    assert c1.status_code == 201 and c2.status_code == 201  # two components in one project (index regression)
    listed = client.get(f"{base}/projects/{p['id']}/components", headers=world.a.h("viewer")).json()
    assert [c["name"] for c in listed] == ["Accounts", "Checkout"] and all(c["open_bug_count"] == 0 for c in listed)
    r = client.patch(f"{base}/components/{c1.json()['id']}", json={"name": "Checkout and cart"}, headers=h)
    assert r.status_code == 200 and r.json()["name"] == "Checkout and cart"
    assert client.delete(f"{base}/components/{c1.json()['id']}", headers=h).status_code == 204
    assert len(client.get(f"{base}/projects/{p['id']}/components", headers=h).json()) == 1


def test_component_names_are_unique_per_project_ignoring_case(client, world) -> None:
    p = make_project(client, world.a)
    other = make_project(client, world.a, "API", "Shipping API")
    h = world.a.h("org_admin")
    base = f"{O}/{world.a.org.id}"
    client.post(f"{base}/projects/{p['id']}/components", json={"name": "Checkout"}, headers=h)
    dup = client.post(f"{base}/projects/{p['id']}/components", json={"name": "CHECKOUT"}, headers=h)
    assert dup.status_code == 409 and code(dup) == "name_taken"
    assert client.post(f"{base}/projects/{other['id']}/components", json={"name": "Checkout"}, headers=h).status_code == 201
    second = client.post(f"{base}/projects/{p['id']}/components", json={"name": "Search"}, headers=h).json()
    rename = client.patch(f"{base}/components/{second['id']}", json={"name": "checkout"}, headers=h)
    assert rename.status_code == 409


def test_components_invalid_forbidden_and_cross_tenant(client, world) -> None:
    p = make_project(client, world.a)
    foreign_p = make_project(client, world.b)
    foreign_c = client.post(f"{O}/{world.b.org.id}/projects/{foreign_p['id']}/components", json={"name": "Theirs"},
                            headers=world.b.h("org_admin")).json()
    base = f"{O}/{world.a.org.id}"
    h = world.a.h("org_admin")
    assert client.post(f"{base}/projects/{p['id']}/components", json={"name": ""}, headers=h).status_code == 422
    assert client.post(f"{base}/projects/{p['id']}/components", json={"name": "x" * 61}, headers=h).status_code == 422
    for role in NON_MANAGERS:
        assert client.post(f"{base}/projects/{p['id']}/components", json={"name": "Nope"}, headers=world.a.h(role)).status_code == 403
    assert code(client.get(f"{base}/projects/{foreign_p['id']}/components", headers=h)) == "not_found"
    assert code(client.post(f"{base}/projects/{foreign_p['id']}/components", json={"name": "Sneak"}, headers=h)) == "not_found"
    assert code(client.patch(f"{base}/components/{foreign_c['id']}", json={"name": "Hijack"}, headers=h)) == "not_found"
    assert code(client.delete(f"{base}/components/{foreign_c['id']}", headers=h)) == "not_found"
    assert client.get(f"{base}/projects/{uuid.uuid4()}/components", headers=h).status_code == 404


# API-048 to API-051 environments -----------------------------------------------------------

def test_environments_crud_and_ordering(client, world) -> None:
    p = make_project(client, world.a)
    h = world.a.h("qa_lead")
    base = f"{O}/{world.a.org.id}"
    qa = client.post(f"{base}/projects/{p['id']}/environments", json={"name": "qa"}, headers=h)
    assert qa.status_code == 201 and qa.json()["sort_order"] == 4
    envs = client.get(f"{base}/projects/{p['id']}/environments", headers=world.a.h("developer")).json()
    assert [e["name"] for e in envs] == ["dev", "staging", "prod", "qa"]
    moved = client.patch(f"{base}/environments/{qa.json()['id']}", json={"sort_order": 0}, headers=h)
    assert moved.status_code == 200
    assert client.get(f"{base}/projects/{p['id']}/environments", headers=h).json()[0]["name"] == "qa"
    assert client.delete(f"{base}/environments/{qa.json()['id']}", headers=h).status_code == 204


def test_environments_invalid_duplicate_forbidden_cross_tenant(client, world) -> None:
    p = make_project(client, world.a)
    foreign_p = make_project(client, world.b)
    foreign_env = client.get(f"{O}/{world.b.org.id}/projects/{foreign_p['id']}/environments",
                             headers=world.b.h("org_admin")).json()[0]
    base = f"{O}/{world.a.org.id}"
    h = world.a.h("org_admin")
    dup = client.post(f"{base}/projects/{p['id']}/environments", json={"name": "PROD"}, headers=h)
    assert dup.status_code == 409 and code(dup) == "name_taken"
    assert client.post(f"{base}/projects/{p['id']}/environments", json={"name": " "}, headers=h).status_code == 422
    assert client.patch(f"{base}/environments/{foreign_env['id']}", json={"sort_order": -1}, headers=h).status_code == 422
    for role in NON_MANAGERS:
        assert client.post(f"{base}/projects/{p['id']}/environments", json={"name": "uat"}, headers=world.a.h(role)).status_code == 403
    assert code(client.patch(f"{base}/environments/{foreign_env['id']}", json={"name": "mine"}, headers=h)) == "not_found"
    assert code(client.delete(f"{base}/environments/{foreign_env['id']}", headers=h)) == "not_found"
    assert code(client.get(f"{base}/projects/{foreign_p['id']}/environments", headers=h)) == "not_found"


def test_environment_in_use_cannot_be_deleted(client, world) -> None:
    """The in use rule is a hook the testing module registers (I-07); simulate a run referencing the environment."""
    from app.modules.projects.application import hooks
    p = make_project(client, world.a)
    env = client.get(f"{O}/{world.a.org.id}/projects/{p['id']}/environments", headers=world.a.h("org_admin")).json()[0]
    hooks.environment_in_use.append(lambda db, org_id, env_id: str(env_id) == env["id"])
    try:
        r = client.delete(f"{O}/{world.a.org.id}/environments/{env['id']}", headers=world.a.h("org_admin"))
        assert r.status_code == 409 and code(r) == "in_use"
    finally:
        hooks.environment_in_use.pop()
