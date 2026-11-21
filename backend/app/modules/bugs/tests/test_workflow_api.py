"""API-065 to API-068 (I-04): transitions, the workflow definition and the board. Happy, invalid, forbidden and cross tenant
for every endpoint, plus the rules on top (side effects, the Developer record rule, the audit trail, the 50 card limit).
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py.
The table itself is tested in test_workflow_rules.py."""

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.bugs.domain.rules import STATUSES
from app.modules.bugs.tests.test_bugs_api import code, make_bug, make_project

O = "/api/v1/orgs"
LEADS = ["org_admin", "qa_lead"]


def url(tenant, bug, tail="transitions"):  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/bugs/{bug['id']}/{tail}"


def move(client, tenant, bug, to, role="qa_lead", **extra):  # type: ignore[no-untyped-def]
    return client.post(url(tenant, bug), json={"to_status": to, **extra}, headers=tenant.h(role))


def walk(client, tenant, bug, *steps, role="qa_lead"):  # type: ignore[no-untyped-def]
    for to in steps:
        r = move(client, tenant, bug, to, role=role)
        assert r.status_code == 200, (to, r.text)
    return r.json()


def assign(client, tenant, bug, role_of_assignee):  # type: ignore[no-untyped-def]
    r = client.patch(f"{O}/{tenant.org.id}/bugs/{bug['id']}", json={"assignee_id": str(tenant.users[role_of_assignee].id)},
                     headers=tenant.h("qa_lead"))
    assert r.status_code == 200, r.text


def audit(db, action):  # type: ignore[no-untyped-def]
    return list(db.scalars(select(AuditEvent).where(AuditEvent.action == action).order_by(AuditEvent.created_at)))


# API-066 move a bug -----------------------------------------------------------------------

def test_a_bug_walks_the_whole_life_and_the_side_effects_follow(client, db, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    moved = walk(client, world.a, bug, "triaged", "in_progress")
    assert moved["status"] == "in_progress" and moved["resolved_at"] is None and moved["closed_at"] is None
    fixed = walk(client, world.a, bug, "fixed")
    assert fixed["resolved_at"] is not None and fixed["closed_at"] is None
    stamp = fixed["resolved_at"]
    retest = walk(client, world.a, bug, "ready_for_retest", "verified")
    assert retest["resolved_at"] == stamp  # moving on from Fixed keeps the moment the fix was done
    closed = walk(client, world.a, bug, "closed")
    assert closed["closed_at"] is not None and closed["resolved_at"] == stamp
    reopened = walk(client, world.a, bug, "reopened")
    assert reopened["status"] == "reopened" and reopened["resolved_at"] is None and reopened["closed_at"] is None
    assert reopened["status_changed_at"] >= closed["status_changed_at"]
    again = walk(client, world.a, bug, "in_progress", "fixed")
    assert again["resolved_at"] is not None and again["resolved_at"] != stamp  # a new fix, a new moment
    events = audit(db, "bug.status_changed")
    assert [(e.data["from"], e.data["to"]) for e in events] == [
        ("new", "triaged"), ("triaged", "in_progress"), ("in_progress", "fixed"), ("fixed", "ready_for_retest"),
        ("ready_for_retest", "verified"), ("verified", "closed"), ("closed", "reopened"), ("reopened", "in_progress"),
        ("in_progress", "fixed")]
    assert all(e.entity_id == bug["id"] and e.data["key"] == "WEB-1" and e.org_id == world.a.org.id for e in events)


def test_wont_fix_stops_the_clock_and_only_leads_can_reverse_it(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    assert walk(client, world.a, bug, "wont_fix")["resolved_at"] is not None
    assert move(client, world.a, bug, "reopened", role="qa_engineer").status_code == 403
    reopened = walk(client, world.a, bug, "reopened", role="org_admin")
    assert reopened["resolved_at"] is None


def test_the_updated_time_moves_with_the_status(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    assert walk(client, world.a, bug, "triaged")["updated_at"] > bug["updated_at"]


def test_a_comment_is_kept_in_the_audit_event(client, db, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    assert move(client, world.a, bug, "triaged", comment="  Confirmed on staging.  ").status_code == 200
    assert audit(db, "bug.status_changed")[0].data["comment"] == "Confirmed on staging."


@pytest.mark.parametrize("role,expected", [("org_admin", ["triaged", "wont_fix"]), ("qa_lead", ["triaged", "wont_fix"]),
                                           ("qa_engineer", ["triaged"]), ("developer", [])])
def test_a_move_that_is_not_in_the_table_is_409_and_lists_what_is_allowed(client, world, role, expected) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = move(client, world.a, bug, "closed", role=role)
    assert r.status_code == 409 and code(r) == "invalid_transition"
    assert r.json()["error"]["details"] == {"from": "new", "to": "closed", "allowed": expected}
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h(role)).json()["status"] == "new"


def test_moving_to_the_same_status_is_409(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    assert code(move(client, world.a, bug, "new")) == "invalid_transition"


def test_invalid_bodies_are_422(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    for body in ({}, {"to_status": "bogus"}, {"to_status": "triaged", "comment": "x" * 2001}, {"to_status": "triaged", "extra": 1}):
        r = client.post(url(world.a, bug), json=body, headers=world.a.h("qa_lead"))
        assert r.status_code == 422 and code(r) == "validation_error", body
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead")).json()["status"] == "new"


@pytest.mark.parametrize("role", ["developer", "viewer"])
def test_forbidden_roles_cannot_make_a_qa_move(client, world, role) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = move(client, world.a, bug, "triaged", role=role)
    assert r.status_code == 403 and code(r) == "forbidden"


def test_a_qa_engineer_cannot_reject_a_bug(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = move(client, world.a, bug, "wont_fix", role="qa_engineer")
    assert r.status_code == 403 and r.json()["error"]["details"]["to"] == "wont_fix"


# The Developer record rule (D-006) ---------------------------------------------------------

def test_a_developer_starting_an_unassigned_bug_takes_it(client, db, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    walk(client, world.a, bug, "triaged")
    r = move(client, world.a, bug, "in_progress", role="developer")
    assert r.status_code == 200 and r.json()["assignee_id"] == str(world.a.users["developer"].id)
    assert r.json()["assignee_name"]
    assigned = audit(db, "bug.assigned")
    assert len(assigned) == 1 and assigned[0].data["to"] == str(world.a.users["developer"].id)


def test_a_lead_starting_an_unassigned_bug_does_not_assign_it(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = walk(client, world.a, bug, "triaged", "in_progress")
    assert r["assignee_id"] is None


def test_a_developer_cannot_move_a_bug_assigned_to_someone_else(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    walk(client, world.a, bug, "triaged")
    assign(client, world.a, bug, "qa_engineer")
    r = move(client, world.a, bug, "in_progress", role="developer")
    assert r.status_code == 403 and "assignee" in r.json()["error"]["message"]
    assert client.get(url(world.a, bug), headers=world.a.h("developer")).json() == {"current": "triaged", "allowed": []}
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("developer")).json()["status"] == "triaged"


def test_the_assigned_developer_moves_their_bug_through_the_developer_moves(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    walk(client, world.a, bug, "triaged")
    assign(client, world.a, bug, "developer")
    done = walk(client, world.a, bug, "in_progress", "fixed", "ready_for_retest", role="developer")
    assert done["status"] == "ready_for_retest"
    assert move(client, world.a, bug, "verified", role="developer").status_code == 403  # a QA move


def test_a_developer_can_hand_a_bug_back(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    walk(client, world.a, bug, "triaged")
    assign(client, world.a, bug, "developer")
    assert walk(client, world.a, bug, "in_progress", "triaged", role="developer")["status"] == "triaged"


# API-065 what can I do ---------------------------------------------------------------------

@pytest.mark.parametrize("role,allowed", [
    ("org_admin", ["triaged", "wont_fix"]), ("qa_lead", ["triaged", "wont_fix"]), ("qa_engineer", ["triaged"]),
    ("developer", []), ("viewer", []),
])
def test_the_allowed_moves_depend_on_the_role(client, world, role, allowed) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = client.get(url(world.a, bug), headers=world.a.h(role))
    assert r.status_code == 200 and r.json() == {"current": "new", "allowed": allowed}


def test_a_developer_sees_the_developer_moves_on_a_triaged_unassigned_bug(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    walk(client, world.a, bug, "triaged")
    assert client.get(url(world.a, bug), headers=world.a.h("developer")).json()["allowed"] == ["in_progress"]


def test_transitions_of_an_unknown_or_deleted_bug_are_404(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    assert client.get(f"{O}/{world.a.org.id}/bugs/00000000-0000-4000-8000-000000000000/transitions",
                      headers=world.a.h("qa_lead")).status_code == 404
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert client.get(url(world.a, bug), headers=world.a.h("qa_lead")).status_code == 404
    assert move(client, world.a, bug, "triaged").status_code == 404


def test_another_workspaces_bug_is_404_on_both_endpoints(client, world) -> None:
    theirs = make_bug(client, world.b, make_project(client, world.b))
    mine = {"id": theirs["id"]}
    assert client.get(url(world.a, mine), headers=world.a.h("qa_lead")).status_code == 404
    assert move(client, world.a, mine, "triaged").status_code == 404
    assert client.get(url(world.b, theirs), headers=world.b.h("qa_lead")).status_code == 200  # its own workspace still works
    # and a member of A cannot use B's path at all
    assert client.get(url(world.b, theirs), headers=world.a.h("qa_lead")).status_code == 404


# API-067 the workflow definition ------------------------------------------------------------

@pytest.mark.parametrize("role", ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"])
def test_every_role_reads_the_workflow(client, world, role) -> None:
    r = client.get(f"{O}/{world.a.org.id}/bug-workflow", headers=world.a.h(role))
    assert r.status_code == 200
    body = r.json()
    assert body["statuses"] == list(STATUSES) and len(body["transitions"]) == 16
    first = body["transitions"][0]
    assert set(first) == {"from", "to", "roles", "meaning"} and first["from"] == "new" and first["to"] == "triaged"
    assert first["roles"] == ["org_admin", "qa_lead", "qa_engineer"]
    wont = next(t for t in body["transitions"] if t["to"] == "wont_fix" and t["from"] == "new")
    assert wont["roles"] == ["org_admin", "qa_lead"]


def test_the_workflow_of_another_workspace_path_is_404(client, world) -> None:
    assert client.get(f"{O}/{world.b.org.id}/bug-workflow", headers=world.a.h("qa_lead")).status_code == 404


# API-068 the board ---------------------------------------------------------------------------

def board(client, tenant, role="qa_lead", **params):  # type: ignore[no-untyped-def]
    r = client.get(f"{O}/{tenant.org.id}/bugs/board", params=params, headers=tenant.h(role))
    assert r.status_code == 200, r.text
    return {c["status"]: c for c in r.json()["columns"]}, r.json()["columns"]


def test_the_board_has_the_nine_columns_in_order_with_totals(client, world) -> None:
    project = make_project(client, world.a)
    a = make_bug(client, world.a, project, title="First bug here")
    make_bug(client, world.a, project, title="Second bug here")
    walk(client, world.a, a, "triaged")
    by_status, columns = board(client, world.a)
    assert [c["status"] for c in columns] == list(STATUSES)
    assert by_status["new"]["total"] == 1 and by_status["triaged"]["total"] == 1
    assert [b["key"] for b in by_status["triaged"]["items"]] == ["WEB-1"]
    assert all(c["total"] == 0 and c["items"] == [] for s, c in by_status.items() if s not in ("new", "triaged"))
    card = by_status["triaged"]["items"][0]
    assert {"id", "key", "title", "severity", "priority", "assignee_name", "sla_breached", "labels"} <= set(card)


def test_every_role_reads_the_board(client, world) -> None:
    make_bug(client, world.a, make_project(client, world.a))
    for role in ("org_admin", "qa_lead", "qa_engineer", "developer", "viewer"):
        assert board(client, world.a, role=role)[0]["new"]["total"] == 1


def test_a_column_shows_the_newest_fifty_and_counts_all(client, db, world) -> None:
    project = make_project(client, world.a)
    for i in range(53):
        make_bug(client, world.a, project, title=f"Bug number {i:02d}")
    by_status, _ = board(client, world.a)
    new = by_status["new"]
    assert new["total"] == 53 and len(new["items"]) == 50
    updated = [b["updated_at"] for b in new["items"]]
    assert updated == sorted(updated, reverse=True)  # most recently updated first
    assert new["items"][0]["key"] == "WEB-53"


def test_the_board_filters(client, db, world) -> None:
    project = make_project(client, world.a)
    other = make_project(client, world.a, key="API")
    crit = make_bug(client, world.a, project, title="Checkout is broken", severity="critical")
    make_bug(client, world.a, project, title="Typo on the page")
    away = make_bug(client, world.a, other, title="Webhook retries forever")
    assign(client, world.a, crit, "developer")
    assert [b["key"] for b in board(client, world.a, project_id=other["id"])[0]["new"]["items"]] == [away["key"]]
    assert [b["key"] for b in board(client, world.a, severity="critical")[0]["new"]["items"]] == ["WEB-1"]
    assert board(client, world.a, severity=["critical", "medium"])[0]["new"]["total"] == 3
    assert [b["key"] for b in board(client, world.a, assignee_id=str(world.a.users["developer"].id))[0]["new"]["items"]] == ["WEB-1"]
    assert [b["key"] for b in board(client, world.a, q="webhook")[0]["new"]["items"]] == ["API-1"]
    assert board(client, world.a, q="nothing like this")[0]["new"]["total"] == 0
    # a status filter is not a board parameter: the columns are the statuses, so it is ignored
    assert board(client, world.a, status="triaged")[0]["new"]["total"] == 3


def test_a_bad_board_filter_is_422(client, world) -> None:
    for params in ({"severity": "urgent"}, {"project_id": "not-a-uuid"}, {"assignee_id": "nope"}, {"q": "x" * 201}):
        r = client.get(f"{O}/{world.a.org.id}/bugs/board", params=params, headers=world.a.h("qa_lead"))
        assert r.status_code == 422 and code(r) == "validation_error", params


def test_the_board_never_shows_another_workspaces_bugs_or_deleted_ones(client, world) -> None:
    project = make_project(client, world.a)
    gone = make_bug(client, world.a, project, title="Soon deleted bug")
    make_bug(client, world.b, make_project(client, world.b), title="Theirs alone")
    client.delete(f"{O}/{world.a.org.id}/bugs/{gone['id']}", headers=world.a.h("qa_lead"))
    assert all(c["total"] == 0 for c in board(client, world.a)[1])
    assert client.get(f"{O}/{world.b.org.id}/bugs/board", headers=world.a.h("qa_lead")).status_code == 404


def test_a_moved_bug_changes_column(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    walk(client, world.a, bug, "triaged", "in_progress", "fixed")
    by_status, _ = board(client, world.a)
    assert by_status["new"]["total"] == 0 and [b["key"] for b in by_status["fixed"]["items"]] == ["WEB-1"]
