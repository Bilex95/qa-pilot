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


# What an Org Admin must be able to see on the Audit log tab (I-11) ----------------------------------------

A = "/api/v1/auth"


def events(client, org_id, headers, query=""):  # type: ignore[no-untyped-def]
    return client.get(f"{O}/{org_id}/audit-events{query}", headers=headers).json()["items"]


def test_org_settings_changes_are_audited_and_the_limit_is_kept_while_ai_is_off(client, world) -> None:
    h = world.a.h("org_admin")
    assert client.patch(f"{O}/{world.a.org.id}", json={"ai_daily_limit": 250}, headers=h).status_code == 200
    off = client.patch(f"{O}/{world.a.org.id}", json={"ai_enabled": False}, headers=h).json()
    assert off["ai_enabled"] is False and off["ai_daily_limit"] == 250  # switching AI off keeps the limit
    on = client.patch(f"{O}/{world.a.org.id}", json={"ai_enabled": True}, headers=h).json()
    assert on["ai_enabled"] is True and on["ai_daily_limit"] == 250
    actions = [e["action"] for e in events(client, world.a.org.id, h)]
    assert {"ai.limit_changed", "ai.disabled", "ai.enabled"} <= set(actions)
    changed = events(client, world.a.org.id, h, "?action=ai.limit_changed")[0]
    assert changed["data"] == {"from": 500, "to": 250} and changed["actor_name"]


def test_a_password_change_is_audited_in_every_workspace_of_the_person_and_holds_no_secret(client, db, world) -> None:
    from app.core.permissions import Role
    from conftest import PASSWORD, add_member
    person = world.a.users[Role.DEVELOPER]
    add_member(db, world.b.org, person, Role.VIEWER)
    r = client.post(f"{A}/me/password", json={"current_password": PASSWORD, "new_password": "Brand-new-pass-77"},
                    headers=world.a.h("developer"))
    assert r.status_code == 200
    for tenant in (world.a, world.b):
        found = events(client, tenant.org.id, tenant.h("org_admin"), "?action=auth.password_changed")
        assert len(found) == 1 and found[0]["actor_id"] == str(person.id) and found[0]["entity_type"] == "user"
        assert "Brand-new-pass-77" not in str(found[0]) and PASSWORD not in str(found[0])


def test_a_refused_password_change_is_not_audited_as_a_change(client, world) -> None:
    client.post(f"{A}/me/password", json={"current_password": "Wrong-pass-123", "new_password": "Brand-new-pass-77"},
                headers=world.a.h("developer"))
    assert events(client, world.a.org.id, world.a.h("org_admin"), "?action=auth.password_changed") == []


def test_a_name_change_is_audited_with_the_old_and_new_name(client, world) -> None:
    assert client.patch(f"{A}/me", json={"full_name": "Renamed Person"}, headers=world.a.h("developer")).status_code == 200
    found = events(client, world.a.org.id, world.a.h("org_admin"), "?action=auth.profile_updated")
    assert len(found) == 1 and found[0]["data"]["full_name"]["to"] == "Renamed Person"
    assert found[0]["actor_name"] == "Renamed Person"
    # the same name again changes nothing and adds no event
    client.patch(f"{A}/me", json={"full_name": "Renamed Person"}, headers=world.a.h("developer"))
    assert len(events(client, world.a.org.id, world.a.h("org_admin"), "?action=auth.profile_updated")) == 1


def test_the_log_keeps_the_name_of_a_person_who_was_removed(client, world) -> None:
    dev = world.a.users["developer"]
    client.patch(f"{A}/me", json={"full_name": "Dana Developer"}, headers=world.a.h("developer"))
    admin = world.a.h("org_admin")
    m = world.a.memberships["developer"]
    assert client.delete(f"{O}/{world.a.org.id}/members/{m.id}", headers=admin).status_code == 204
    found = events(client, world.a.org.id, admin, f"?actor_id={dev.id}")
    assert found and all(e["actor_name"] == "Dana Developer" for e in found)  # still named after the removal
    removed = events(client, world.a.org.id, admin, "?action=member.removed")[0]
    assert removed["actor_name"] != "Dana Developer" and removed["data"]["user_id"] == str(dev.id)


def test_events_of_another_workspace_never_carry_over(client, world) -> None:
    client.patch(f"{A}/me", json={"full_name": "Only In B"}, headers=world.b.h("developer"))
    assert events(client, world.a.org.id, world.a.h("org_admin"), "?action=auth.profile_updated") == []


# The person an event is about, named like the actor (role changes, removals, reset links) ----------------------------

def test_role_change_removal_and_reset_link_name_the_person_they_are_about(client, db, world) -> None:
    admin = world.a.h("org_admin")
    world.a.users["developer"].full_name = "Dana Developer"
    world.a.users["viewer"].full_name = "Victor Viewer"
    db.flush()
    dev, viewer = world.a.memberships["developer"], world.a.memberships["viewer"]
    assert client.patch(f"{O}/{world.a.org.id}/members/{dev.id}", json={"role": "qa_engineer"}, headers=admin).status_code == 200
    assert client.post(f"{O}/{world.a.org.id}/members/{viewer.id}/password-reset", headers=admin).status_code == 201
    assert client.delete(f"{O}/{world.a.org.id}/members/{dev.id}", headers=admin).status_code == 204
    changed = events(client, world.a.org.id, admin, "?action=member.role_changed")[0]
    removed = events(client, world.a.org.id, admin, "?action=member.removed")[0]
    reset = events(client, world.a.org.id, admin, "?action=auth.reset_link_created")[0]
    assert changed["target_name"] == "Dana Developer" and changed["actor_name"] != "Dana Developer"
    assert removed["target_name"] == "Dana Developer"  # still named after the removal: the user record stays
    assert reset["target_name"] == "Victor Viewer"
    assert all(set(e) >= {"actor_name", "target_name"} for e in (changed, removed, reset))


def test_an_event_about_oneself_or_not_about_a_person_has_no_target(client, world) -> None:
    admin = world.a.h("org_admin")
    client.patch(f"{A}/me", json={"full_name": "Renamed Person"}, headers=world.a.h("developer"))
    client.post(f"{A}/me/password", json={"current_password": "wrong-pass-123", "new_password": "Brand-new-pass-77"},
                headers=world.a.h("developer"))
    client.patch(f"{O}/{world.a.org.id}", json={"name": "Renamed"}, headers=admin)
    for e in events(client, world.a.org.id, admin):
        assert e["target_name"] is None, e["action"]


def test_a_target_in_another_workspace_is_never_named(client, db, world) -> None:
    """The name comes from the event's own workspace: an admin of B sees nothing about people removed in A."""
    world.a.users["developer"].full_name = "Dana Developer"
    db.flush()
    client.delete(f"{O}/{world.a.org.id}/members/{world.a.memberships['developer'].id}", headers=world.a.h("org_admin"))
    assert "Dana Developer" not in str(events(client, world.b.org.id, world.b.h("org_admin")))


# API-154 people with events, for the actor filter ------------------------------------------------------

def actors(client, org_id, headers):  # type: ignore[no-untyped-def]
    return client.get(f"{O}/{org_id}/audit-events/actors", headers=headers)


def test_actors_lists_only_people_with_events_in_this_workspace_by_name(client, world) -> None:
    admin = world.a.h("org_admin")
    assert actors(client, world.a.org.id, admin).json() == []  # nobody has an event yet
    client.patch(f"{A}/me", json={"full_name": "Zed Zero"}, headers=world.a.h("developer"))
    client.patch(f"{O}/{world.a.org.id}", json={"name": "Renamed"}, headers=admin)
    client.patch(f"{A}/me", json={"full_name": "Zed Zero"}, headers=world.b.h("developer"))  # an event in org B only
    body = actors(client, world.a.org.id, admin).json()
    ids = {a["id"] for a in body}
    assert ids == {str(world.a.users["developer"].id), str(world.a.users["org_admin"].id)}
    assert str(world.b.users["developer"].id) not in ids and all(set(a) == {"id", "full_name"} for a in body)
    assert [a["full_name"].lower() for a in body] == sorted(a["full_name"].lower() for a in body)  # by name


def test_actors_still_lists_a_person_removed_from_the_workspace(client, world) -> None:
    admin = world.a.h("org_admin")
    client.patch(f"{A}/me", json={"full_name": "Dana Developer"}, headers=world.a.h("developer"))
    m = world.a.memberships["developer"]
    client.delete(f"{O}/{world.a.org.id}/members/{m.id}", headers=admin)
    assert "Dana Developer" in [a["full_name"] for a in actors(client, world.a.org.id, admin).json()]


@pytest.mark.parametrize("role", ["qa_lead", "qa_engineer", "developer", "viewer"])
def test_only_admin_reads_the_actors(client, world, role) -> None:
    assert actors(client, world.a.org.id, world.a.h(role)).status_code == 403


def test_actors_of_another_workspace_are_not_readable(client, world) -> None:
    r = actors(client, world.b.org.id, world.a.h("org_admin"))  # an admin of A asks for B
    assert r.status_code == 404 and r.json()["error"]["code"] == "org_not_found"
