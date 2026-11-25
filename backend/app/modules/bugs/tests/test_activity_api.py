"""API-077 (I-05) and the entries the other bug endpoints now write (REQ-018, REQ-025): creation, field changes with the old and
new value, assignments, status moves, comments and files, newest first, with the actor.
Unauthorized and the generic cross tenant org check are covered by app/core/tests/test_contract.py."""

import uuid

import pytest

from app.modules.bugs.tests.test_bugs_api import ALL_ROLES, code, make_bug, make_project
from app.modules.bugs.tests.test_workflow_api import move

O = "/api/v1/orgs"


@pytest.fixture()
def bug(client, world):  # type: ignore[no-untyped-def]
    return make_bug(client, world.a, make_project(client, world.a))


def trail(client, tenant, bug, role="viewer", **params):  # type: ignore[no-untyped-def]
    r = client.get(f"{O}/{tenant.org.id}/bugs/{bug['id']}/activity", params=params, headers=tenant.h(role))
    assert r.status_code == 200, r.text
    return r.json()


def patch(client, tenant, bug, role="qa_lead", **changes):  # type: ignore[no-untyped-def]
    r = client.patch(f"{O}/{tenant.org.id}/bugs/{bug['id']}", json=changes, headers=tenant.h(role))
    assert r.status_code == 200, r.text
    return r.json()


def entries(page):  # type: ignore[no-untyped-def]
    return [(e["kind"], e["field"], e["old_value"], e["new_value"]) for e in page["items"]]


# A new bug ----------------------------------------------------------------------------------

def test_a_new_bug_starts_with_a_created_entry_by_its_reporter(client, world, bug) -> None:
    page = trail(client, world.a, bug)
    assert page["total"] == 1 and page["items"][0]["kind"] == "created"
    first = page["items"][0]
    assert first["actor_id"] == str(world.a.users["qa_engineer"].id) and first["actor_name"] == "qa_engineer a"
    assert first["field"] is None and first["old_value"] is None and first["new_value"] is None
    assert set(first) == {"id", "kind", "actor_id", "actor_name", "field", "old_value", "new_value", "created_at"}


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_reads_the_timeline(client, world, bug, role) -> None:
    assert trail(client, world.a, bug, role=role)["total"] == 1


# Field changes ------------------------------------------------------------------------------

def test_severity_priority_and_title_keep_the_old_and_new_value(client, world, bug) -> None:
    patch(client, world.a, bug, role="qa_engineer", severity="high", priority="p2")
    patch(client, world.a, bug, role="qa_lead", title="Checkout button does nothing on Safari")
    assert entries(trail(client, world.a, bug))[:3] == [
        ("field_changed", "title", "Checkout button does nothing", "Checkout button does nothing on Safari"),
        ("field_changed", "priority", "p3", "p2"), ("field_changed", "severity", "medium", "high")] or \
        entries(trail(client, world.a, bug))[:3] == [
        ("field_changed", "title", "Checkout button does nothing", "Checkout button does nothing on Safari"),
        ("field_changed", "severity", "medium", "high"), ("field_changed", "priority", "p3", "p2")]
    who = {e["actor_name"] for e in trail(client, world.a, bug)["items"][:3]}
    assert who == {"qa_engineer a", "qa_lead a"}


def test_long_text_fields_record_that_they_changed_but_not_their_words(client, world, bug) -> None:
    patch(client, world.a, bug, description="Something secret and very long", steps_to_reproduce=["Open it", "Click it"])
    got = {(e["field"], e["old_value"], e["new_value"]) for e in trail(client, world.a, bug)["items"][:2]}
    assert got == {("description", None, None), ("steps_to_reproduce", None, None)}


def test_expected_and_actual_result_each_write_one_entry_without_their_words(client, world, bug) -> None:
    patch(client, world.a, bug, expected_result="A receipt", actual_result="Nothing happens")
    got = {(e["field"], e["old_value"], e["new_value"]) for e in trail(client, world.a, bug)["items"][:2]}
    assert got == {("expected_result", None, None), ("actual_result", None, None)}
    patch(client, world.a, bug, expected_result="A receipt and an email", actual_result="Nothing happens")  # one changed, one not
    page = trail(client, world.a, bug)
    assert page["total"] == 4 and (page["items"][0]["field"], page["items"][0]["old_value"]) == ("expected_result", None)


def test_steps_changed_only_by_order_or_text_write_an_entry_and_the_same_list_writes_none(client, world, bug) -> None:
    patch(client, world.a, bug, steps_to_reproduce=["One", "Two"])
    patch(client, world.a, bug, steps_to_reproduce=["One", "Two"])
    assert trail(client, world.a, bug)["total"] == 2
    patch(client, world.a, bug, steps_to_reproduce=["Two", "One"])
    patch(client, world.a, bug, steps_to_reproduce=[])
    assert trail(client, world.a, bug)["total"] == 4
    got = client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("viewer")).json()
    assert got["steps_to_reproduce"] == []


@pytest.mark.parametrize("changes", [{"steps_to_reproduce": ["x" * 1001]}, {"steps_to_reproduce": ["a"] * 51},
                                     {"expected_result": "x" * 5001}, {"actual_result": "x" * 5001}])
def test_steps_and_results_over_their_limits_are_refused_and_change_nothing(client, world, bug, changes) -> None:
    r = client.patch(f"{O}/{world.a.org.id}/bugs/{bug['id']}", json=changes, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"
    assert trail(client, world.a, bug)["total"] == 1


def test_a_developer_edits_the_steps_of_their_own_report_only(client, world) -> None:
    mine = make_bug(client, world.a, make_project(client, world.a, key="DVA"), role="developer")
    other = make_bug(client, world.a, make_project(client, world.a, key="DVB"), role="qa_engineer")
    ok = client.patch(f"{O}/{world.a.org.id}/bugs/{mine['id']}", json={"steps_to_reproduce": ["Mine"], "actual_result": "Bad"},
                      headers=world.a.h("developer"))
    assert ok.status_code == 200 and ok.json()["steps_to_reproduce"] == ["Mine"]
    no = client.patch(f"{O}/{world.a.org.id}/bugs/{other['id']}", json={"steps_to_reproduce": ["Theirs"]}, headers=world.a.h("developer"))
    assert no.status_code == 403 and code(no) == "forbidden"
    viewer = client.patch(f"{O}/{world.a.org.id}/bugs/{mine['id']}", json={"expected_result": "x"}, headers=world.a.h("viewer"))
    assert viewer.status_code == 403


def test_a_save_that_changes_nothing_writes_nothing(client, world, bug) -> None:
    patch(client, world.a, bug, severity="medium", title=bug["title"])
    assert trail(client, world.a, bug)["total"] == 1


def test_component_environment_and_labels_are_kept_by_name(client, world, bug, db) -> None:
    comp = client.post(f"{O}/{world.a.org.id}/projects/{bug['project_id']}/components", json={"name": "Checkout"},
                       headers=world.a.h("qa_lead")).json()
    env = client.post(f"{O}/{world.a.org.id}/projects/{bug['project_id']}/environments", json={"name": "Canary"},
                      headers=world.a.h("qa_lead")).json()
    l1 = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Regression"}, headers=world.a.h("qa_lead")).json()
    l2 = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Payments"}, headers=world.a.h("qa_lead")).json()
    patch(client, world.a, bug, component_id=comp["id"])
    patch(client, world.a, bug, environment_id=env["id"])
    patch(client, world.a, bug, label_ids=[l1["id"], l2["id"]])
    patch(client, world.a, bug, label_ids=[l2["id"]])
    patch(client, world.a, bug, component_id=None)
    assert entries(trail(client, world.a, bug))[:5] == [
        ("field_changed", "component", "Checkout", None), ("field_changed", "labels", "Payments, Regression", "Payments"),
        ("field_changed", "labels", None, "Payments, Regression"), ("field_changed", "environment", None, "Canary"),
        ("field_changed", "component", None, "Checkout")]
    # the entry keeps the name it had, even when the thing is renamed or deleted afterwards
    assert client.delete(f"{O}/{world.a.org.id}/components/{comp['id']}", headers=world.a.h("qa_lead")).status_code == 204
    assert entries(trail(client, world.a, bug))[4] == ("field_changed", "component", None, "Checkout")


def test_an_assignment_is_its_own_kind_and_keeps_the_names_of_that_day(client, world, bug, db) -> None:
    dev = world.a.users["developer"]
    patch(client, world.a, bug, assignee_id=str(dev.id))
    patch(client, world.a, bug, assignee_id=None)
    assert entries(trail(client, world.a, bug))[:2] == [("assigned", "assignee", "developer a", None),
                                                        ("assigned", "assignee", None, "developer a")]
    dev.full_name = "Renamed Person"
    db.flush()
    assert entries(trail(client, world.a, bug))[1] == ("assigned", "assignee", None, "developer a")  # history is not rewritten
    patch(client, world.a, bug, assignee_id=str(dev.id))
    assert entries(trail(client, world.a, bug))[0] == ("assigned", "assignee", None, "Renamed Person")


# Status moves, comments and files ------------------------------------------------------------

def test_a_status_move_is_an_entry_with_the_two_statuses(client, world, bug) -> None:
    assert move(client, world.a, bug, "triaged").status_code == 200
    assert move(client, world.a, bug, "in_progress").status_code == 200
    first = trail(client, world.a, bug)["items"][:2]
    assert entries({"items": first}) == [("status_changed", "status", "triaged", "in_progress"),
                                         ("status_changed", "status", "new", "triaged")]
    assert first[0]["actor_name"] == "qa_lead a"


def test_a_refused_move_writes_nothing(client, world, bug) -> None:
    assert move(client, world.a, bug, "closed").status_code == 409
    assert move(client, world.a, bug, "triaged", role="viewer").status_code == 403
    assert trail(client, world.a, bug)["total"] == 1


def test_a_developer_starting_an_unassigned_bug_takes_it_and_both_show(client, world, bug) -> None:
    assert move(client, world.a, bug, "triaged").status_code == 200
    assert move(client, world.a, bug, "in_progress", role="developer").status_code == 200
    assert entries(trail(client, world.a, bug))[:2] == [("assigned", "assignee", None, "developer a"),
                                                        ("status_changed", "status", "triaged", "in_progress")] or \
        entries(trail(client, world.a, bug))[:2] == [("status_changed", "status", "triaged", "in_progress"),
                                                     ("assigned", "assignee", None, "developer a")]


def test_the_reason_given_for_a_move_becomes_a_comment(client, world, bug) -> None:
    r = move(client, world.a, bug, "triaged", comment="  Confirmed on staging.  ")
    assert r.status_code == 200 and r.json()["comment_count"] == 1
    comments = client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}/comments", headers=world.a.h("viewer")).json()["items"]
    assert [(c["body"], c["author_name"]) for c in comments] == [("Confirmed on staging.", "qa_lead a")]
    kinds = [e["kind"] for e in trail(client, world.a, bug)["items"]]
    assert kinds.count("commented") == 1 and kinds.count("status_changed") == 1
    move(client, world.a, bug, "in_progress", comment="   ")  # a blank reason is no comment
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("viewer")).json()["comment_count"] == 1


def test_comments_are_entries_and_the_bug_shows_as_updated(client, world, bug) -> None:
    before = client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("viewer")).json()["updated_at"]
    client.post(f"{O}/{world.a.org.id}/bugs/{bug['id']}/comments", json={"body": "Still happens"}, headers=world.a.h("viewer"))
    first = trail(client, world.a, bug)["items"][0]
    assert (first["kind"], first["actor_name"]) == ("commented", "viewer a")
    assert first["field"] is None and first["new_value"] is None  # the words live in the comment, not in the timeline
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("viewer")).json()["updated_at"] > before


# Listing ------------------------------------------------------------------------------------

def test_the_timeline_is_newest_first_and_paged(client, world, bug) -> None:
    for sev in ["high", "low", "critical", "medium"]:
        patch(client, world.a, bug, severity=sev)
    page = trail(client, world.a, bug, page_size=2)
    assert page["total"] == 5 and page["page_size"] == 2
    assert [e["new_value"] for e in page["items"]] == ["medium", "critical"]
    last = trail(client, world.a, bug, page=3, page_size=2)
    assert [e["kind"] for e in last["items"]] == ["created"]
    stamps = [e["created_at"] for e in trail(client, world.a, bug)["items"]]
    assert stamps == sorted(stamps, reverse=True)
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}/activity", params={"page": 0},
                      headers=world.a.h("viewer")).status_code == 422


def test_the_timeline_of_a_foreign_missing_or_deleted_bug_is_a_404(client, world, bug) -> None:
    foreign = make_bug(client, world.b, make_project(client, world.b))
    r = client.get(f"{O}/{world.a.org.id}/bugs/{foreign['id']}/activity", headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"
    assert client.get(f"{O}/{world.a.org.id}/bugs/{uuid.uuid4()}/activity", headers=world.a.h("org_admin")).status_code == 404
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}/activity", headers=world.a.h("org_admin")).status_code == 404


def test_every_timeline_entry_belongs_to_its_org(client, world, bug) -> None:
    other = make_bug(client, world.b, make_project(client, world.b))
    patch(client, world.b, other, severity="high")
    assert trail(client, world.a, bug)["total"] == 1 and trail(client, world.b, other)["total"] == 2
