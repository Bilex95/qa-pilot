"""API-150: audit log (REQ-012)."""

import pytest

O = "/api/v1/orgs"


def test_admin_reads_audit_events_newest_first(client, world) -> None:
    h = world.a.h("org_admin")
    client.patch(f"{O}/{world.a.org.id}", json={"name": "First"}, headers=h)
    client.patch(f"{O}/{world.a.org.id}", json={"ai_enabled": False}, headers=h)
    r = client.get(f"{O}/{world.a.org.id}/audit-events", headers=h)
    assert r.status_code == 200
    actions = [e["action"] for e in r.json()["items"]]
    assert actions[:3] == ["ai.disabled", "org.settings_updated", "org.settings_updated"]
    assert r.json()["total"] == 3


def test_filters_and_paging(client, world) -> None:
    h = world.a.h("org_admin")
    client.patch(f"{O}/{world.a.org.id}", json={"name": "Renamed"}, headers=h)
    exact = client.get(f"{O}/{world.a.org.id}/audit-events?action=org.settings_updated", headers=h).json()
    assert exact["total"] == 1
    prefix = client.get(f"{O}/{world.a.org.id}/audit-events?action=org&page_size=1", headers=h).json()
    assert prefix["total"] == 1 and len(prefix["items"]) == 1
    assert client.get(f"{O}/{world.a.org.id}/audit-events?from=yesterday", headers=h).status_code == 422


def test_audit_is_scoped_to_the_org(client, world) -> None:
    client.patch(f"{O}/{world.b.org.id}", json={"name": "B event"}, headers=world.b.h("org_admin"))
    items = client.get(f"{O}/{world.a.org.id}/audit-events", headers=world.a.h("org_admin")).json()["items"]
    assert all(e["action"] != "org.settings_updated" for e in items)


@pytest.mark.parametrize("role", ["qa_lead", "qa_engineer", "developer", "viewer"])
def test_only_admin_reads_audit(client, world, role) -> None:
    assert client.get(f"{O}/{world.a.org.id}/audit-events", headers=world.a.h(role)).status_code == 403
