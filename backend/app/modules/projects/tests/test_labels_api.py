"""API-052 to API-054 (I-02): happy, invalid, forbidden and cross tenant for every endpoint.
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.projects.infrastructure import repository as repo
from app.modules.projects.infrastructure.models import Label

O = "/api/v1/orgs"
MANAGERS = ["org_admin", "qa_lead"]
NON_MANAGERS = ["qa_engineer", "developer", "viewer"]
ALL_ROLES = MANAGERS + NON_MANAGERS


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def make_label(client, tenant, name="Regression", **extra):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/labels", json={"name": name, **extra}, headers=tenant.h("qa_lead"))
    assert r.status_code == 201, r.text
    return r.json()


# API-053 create -------------------------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_managers_create_label_with_neutral_default_colour(client, db, world, role) -> None:
    r = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Regression"}, headers=world.a.h(role))
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "Regression" and r.json()["color"] == "neutral" and r.json()["bug_count"] == 0
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "label.created"))


def test_create_label_accepts_a_token_colour(client, world) -> None:
    assert make_label(client, world.a, "Payments", color="info")["color"] == "info"


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_others_cannot_create_labels(client, world, role) -> None:
    r = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Nope"}, headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"


@pytest.mark.parametrize("body", [
    {}, {"name": ""}, {"name": "   "}, {"name": "x" * 41}, {"name": "Ok", "color": "#ff0000"},
    {"name": "Ok", "color": "pink"}, {"name": "Ok", "extra": 1}, {"name": 5},
])
def test_create_label_invalid_input(client, world, body) -> None:
    r = client.post(f"{O}/{world.a.org.id}/labels", json=body, headers=world.a.h("org_admin"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_create_label_name_at_the_limit_is_accepted(client, world) -> None:
    assert make_label(client, world.a, "x" * 40)["name"] == "x" * 40


def test_names_are_trimmed_and_clash_case_insensitively(client, world) -> None:
    created = make_label(client, world.a, "  Regression  ")
    assert created["name"] == "Regression"  # stored trimmed
    h = world.a.h("org_admin")
    for clash in [" Regression ", "regression", "REGRESSION", "  rEgReSsIoN"]:
        r = client.post(f"{O}/{world.a.org.id}/labels", json={"name": clash}, headers=h)
        assert r.status_code == 409 and code(r) == "name_taken", clash


def test_same_name_is_allowed_in_another_org(client, world) -> None:
    make_label(client, world.a)
    make_label(client, world.b)


def test_duplicate_that_slips_past_the_service_check_is_409_not_500(client, db, world, monkeypatch) -> None:
    """A race: both requests pass the name check, the unique index on (org_id, lower(name)) rejects the second."""
    make_label(client, world.a, "Regression")
    monkeypatch.setattr(repo, "label_name_taken", lambda *args, **kwargs: False)
    r = client.post(f"{O}/{world.a.org.id}/labels", json={"name": " regression "}, headers=world.a.h("org_admin"))
    assert r.status_code == 409 and code(r) == "name_taken"
    assert len(db.scalars(select(Label).where(Label.org_id == world.a.org.id)).all()) == 1


def test_database_rejects_a_duplicate_directly(db, world) -> None:
    from sqlalchemy.exc import IntegrityError

    db.add(Label(org_id=world.a.org.id, name="Regression", color="neutral"))
    db.flush()
    db.add(Label(org_id=world.a.org.id, name="regression", color="neutral"))
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


# API-052 list ---------------------------------------------------------------------------

@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_lists_labels_sorted_with_zero_bug_counts(client, world, role) -> None:
    for name in ["UX", "api", "Browser"]:
        make_label(client, world.a, name)
    r = client.get(f"{O}/{world.a.org.id}/labels", headers=world.a.h(role))
    assert r.status_code == 200
    assert [x["name"] for x in r.json()] == ["api", "Browser", "UX"]
    assert all(x["bug_count"] == 0 and x["color"] == "neutral" for x in r.json())


def test_list_only_returns_the_orgs_own_labels(client, world) -> None:
    make_label(client, world.a, "Mine")
    make_label(client, world.b, "Theirs")
    names = [x["name"] for x in client.get(f"{O}/{world.a.org.id}/labels", headers=world.a.h("viewer")).json()]
    assert names == ["Mine"]


def test_list_empty(client, world) -> None:
    assert client.get(f"{O}/{world.a.org.id}/labels", headers=world.a.h("viewer")).json() == []


def test_list_uses_the_bug_count_hook(client, world) -> None:
    """I-03 registers the real count here; until then the list returns 0."""
    from app.modules.projects.application import hooks

    label = make_label(client, world.a)
    hooks.label_bug_counts.append(lambda db, org_id, ids: {uuid.UUID(label["id"]): 3})
    try:
        r = client.get(f"{O}/{world.a.org.id}/labels", headers=world.a.h("viewer"))
    finally:
        hooks.label_bug_counts.clear()
    assert r.json()[0]["bug_count"] == 3


# API-054 delete -------------------------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_managers_delete_labels(client, db, world, role) -> None:
    label = make_label(client, world.a)
    r = client.delete(f"{O}/{world.a.org.id}/labels/{label['id']}", headers=world.a.h(role))
    assert r.status_code == 204
    assert client.get(f"{O}/{world.a.org.id}/labels", headers=world.a.h(role)).json() == []
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "label.deleted"))
    assert event is not None and event.data["name"] == "Regression"


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_others_cannot_delete_labels(client, world, role) -> None:
    label = make_label(client, world.a)
    r = client.delete(f"{O}/{world.a.org.id}/labels/{label['id']}", headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"
    assert len(client.get(f"{O}/{world.a.org.id}/labels", headers=world.a.h("viewer")).json()) == 1


def test_delete_missing_label_in_the_same_org_is_404(client, world) -> None:
    r = client.delete(f"{O}/{world.a.org.id}/labels/{uuid.uuid4()}", headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"


def test_deleting_twice_is_404_the_second_time(client, world) -> None:
    label = make_label(client, world.a)
    h = world.a.h("org_admin")
    assert client.delete(f"{O}/{world.a.org.id}/labels/{label['id']}", headers=h).status_code == 204
    assert client.delete(f"{O}/{world.a.org.id}/labels/{label['id']}", headers=h).status_code == 404


def test_delete_with_a_malformed_id_is_422(client, world) -> None:
    r = client.delete(f"{O}/{world.a.org.id}/labels/not-a-uuid", headers=world.a.h("org_admin"))
    assert r.status_code == 422


# Cross tenant ---------------------------------------------------------------------------

def test_cannot_delete_another_orgs_label_through_own_org_path(client, db, world) -> None:
    theirs = make_label(client, world.b, "Theirs")
    r = client.delete(f"{O}/{world.a.org.id}/labels/{theirs['id']}", headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"
    assert db.get(Label, uuid.UUID(theirs["id"])) is not None


def test_cannot_use_another_orgs_path(client, world) -> None:
    theirs = make_label(client, world.b, "Theirs")
    h = world.a.h("org_admin")
    assert client.get(f"{O}/{world.b.org.id}/labels", headers=h).status_code in (403, 404)
    assert client.post(f"{O}/{world.b.org.id}/labels", json={"name": "Sneaky"}, headers=h).status_code in (403, 404)
    assert client.delete(f"{O}/{world.b.org.id}/labels/{theirs['id']}", headers=h).status_code in (403, 404)
    assert [x["name"] for x in client.get(f"{O}/{world.b.org.id}/labels", headers=world.b.h("viewer")).json()] \
        == ["Theirs"]
