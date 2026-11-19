"""API-078 to API-080 (I-03): saved views are private to their owner inside one org (D-017).
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.bugs.infrastructure.models import SavedView

O = "/api/v1/orgs"
ALL_ROLES = ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"]
FILTERS = {"status": ["new", "triaged"], "severity": ["critical"], "open": True, "sort": "severity", "q": "checkout"}


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def make_view(client, tenant, role="qa_engineer", name="Critical checkout", filters=None):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/saved-views", json={"name": name, "filters": FILTERS if filters is None else filters},
                    headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_can_save_list_and_delete_their_own_views(client, world, role) -> None:
    view = make_view(client, world.a, role)
    listed = client.get(f"{O}/{world.a.org.id}/saved-views", headers=world.a.h(role)).json()
    assert [v["id"] for v in listed] == [view["id"]] and listed[0]["name"] == "Critical checkout"
    assert client.delete(f"{O}/{world.a.org.id}/saved-views/{view['id']}", headers=world.a.h(role)).status_code == 204
    assert client.get(f"{O}/{world.a.org.id}/saved-views", headers=world.a.h(role)).json() == []


def test_filters_are_stored_and_returned_with_a_version_number(client, db, world) -> None:
    view = make_view(client, world.a, filters={"status": ["new"], "q": "x"})
    assert view["filters"]["version"] == 1 and view["filters"]["status"] == ["new"] and view["filters"]["sort"] == "-updated_at"
    row = db.scalar(select(SavedView).where(SavedView.id == uuid.UUID(view["id"])))
    assert row is not None and row.filters["version"] == 1 and row.filters["status"] == ["new"]
    assert make_view(client, world.a, name="Explicit", filters={"version": 1})["filters"]["version"] == 1


def test_views_are_private_to_their_owner(client, world) -> None:
    mine = make_view(client, world.a, "qa_engineer", name="Mine")
    theirs = make_view(client, world.a, "qa_lead", name="Theirs")
    ids = lambda role: [v["id"] for v in client.get(f"{O}/{world.a.org.id}/saved-views", headers=world.a.h(role)).json()]  # noqa: E731
    assert ids("qa_engineer") == [mine["id"]] and ids("qa_lead") == [theirs["id"]]
    assert ids("org_admin") == []  # not even an Org Admin sees another person's views
    # someone else's view is a 404 (not a 403), and it is still there afterwards
    r = client.delete(f"{O}/{world.a.org.id}/saved-views/{theirs['id']}", headers=world.a.h("qa_engineer"))
    assert r.status_code == 404 and code(r) == "not_found"
    assert ids("qa_lead") == [theirs["id"]]


def test_views_do_not_cross_orgs(client, world) -> None:
    make_view(client, world.b, "qa_lead", name="Org B view")
    assert client.get(f"{O}/{world.a.org.id}/saved-views", headers=world.a.h("qa_lead")).json() == []
    foreign = make_view(client, world.b, "qa_engineer", name="Another")
    r = client.delete(f"{O}/{world.a.org.id}/saved-views/{foreign['id']}", headers=world.a.h("org_admin"))
    assert r.status_code == 404


def test_the_same_person_in_two_orgs_has_separate_views(client, db, world) -> None:
    from app.modules.orgs.infrastructure.models import Membership

    user = world.a.users["qa_engineer"]
    db.add(Membership(org_id=world.b.org.id, user_id=user.id, role="qa_engineer", status="active"))
    db.flush()
    make_view(client, world.a, "qa_engineer", name="In org A")
    assert client.get(f"{O}/{world.b.org.id}/saved-views", headers=world.a.h("qa_engineer")).json() == []
    assert len(client.get(f"{O}/{world.a.org.id}/saved-views", headers=world.a.h("qa_engineer")).json()) == 1


def test_view_names_are_unique_per_person_ignoring_case(client, world) -> None:
    make_view(client, world.a, "qa_engineer", name="Critical")
    r = client.post(f"{O}/{world.a.org.id}/saved-views", json={"name": " critical ", "filters": {}}, headers=world.a.h("qa_engineer"))
    assert r.status_code == 409 and code(r) == "name_taken"
    assert make_view(client, world.a, "qa_lead", name="Critical")["name"] == "Critical"  # someone else may reuse it


@pytest.mark.parametrize("body", [
    {}, {"name": "No filters"}, {"filters": {}}, {"name": "", "filters": {}}, {"name": "   ", "filters": {}},
    {"name": "x" * 61, "filters": {}}, {"name": "Bad", "filters": {"status": ["done"]}},
    {"name": "Bad", "filters": {"unknown_key": 1}}, {"name": "Bad", "filters": {"version": 2}},
    {"name": "Bad", "filters": {"sort": "title"}}, {"name": "Bad", "filters": {"severity": ["urgent"]}},
    {"name": "Bad", "filters": {"project_id": "nope"}}, {"name": "Bad", "filters": {"q": "x" * 201}},
    {"name": "Bad", "filters": []}, {"name": 5, "filters": {}}, {"name": "Bad", "filters": {}, "extra": 1},
])
def test_create_view_invalid_input(client, world, body) -> None:
    r = client.post(f"{O}/{world.a.org.id}/saved-views", json=body, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_name_at_the_limit_is_accepted_and_trimmed(client, world) -> None:
    assert make_view(client, world.a, name="x" * 60, filters={})["name"] == "x" * 60
    assert make_view(client, world.a, name="  Padded  ", filters={})["name"] == "Padded"


def test_delete_unknown_view_is_404_and_a_bad_id_is_422(client, world) -> None:
    h = world.a.h("qa_lead")
    assert client.delete(f"{O}/{world.a.org.id}/saved-views/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/saved-views/nope", headers=h).status_code == 422


def test_a_saved_view_filters_apply_to_the_list(client, world) -> None:
    """The stored keys are the list endpoint's own parameters, so a view can be replayed as the query string."""
    from app.modules.bugs.tests.test_bugs_api import keys, listing, make_bug, make_project

    project = make_project(client, world.a)
    make_bug(client, world.a, project, title="Critical checkout bug", severity="critical")
    make_bug(client, world.a, project, title="Minor typo somewhere", severity="low")
    view = make_view(client, world.a, "qa_engineer", filters={"severity": ["critical"], "q": "checkout", "open": True})
    stored = {k: v for k, v in view["filters"].items() if k != "version" and v not in (None, [], "-updated_at")}
    assert keys(listing(client, world.a, **stored)) == ["WEB-1"]
