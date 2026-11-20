"""API-095 to API-100 (I-06): happy, invalid, forbidden and cross tenant for every case endpoint, plus numbering, steps and bulk rules.
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.testing.application import hooks
from app.modules.testing.tests.test_suites_api import make_case, make_project, make_suite

O = "/api/v1/orgs"
MANAGERS = ["org_admin", "qa_lead", "qa_engineer"]
NON_MANAGERS = ["developer", "viewer"]
ALL_ROLES = [*MANAGERS, *NON_MANAGERS]
STEP = {"action": "Open the cart", "expected": "The cart is shown"}
SAME_ID = "6f1a3c1e-0b57-4c52-9d3e-1f2a3b4c5d6e"


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def steps(n: int) -> list[dict[str, str]]:
    return [{"action": f"Action {i}", "expected": f"Expected {i}"} for i in range(1, n + 1)]


def setup(client, tenant, key="WEB"):  # type: ignore[no-untyped-def]
    project = make_project(client, tenant, key)
    return project, make_suite(client, tenant, project)


def cases_url(tenant, suite) -> str:  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/test-suites/{suite['id']}/cases"


# API-096 create -------------------------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_qa_roles_write_a_case_with_four_steps_and_it_is_audited(client, db, world, role) -> None:
    project, suite = setup(client, world.a)
    r = client.post(cases_url(world.a, suite), headers=world.a.h(role), json={
        "title": "  Recalculate total after changing address ", "preconditions": "Discount applied", "steps": steps(4),
        "tags": ["Discounts", " address ", "discounts"], "priority": "p1", "case_type": "edge"})
    assert r.status_code == 201, r.text
    case = r.json()
    assert case["key"] == "TC-1" and case["number"] == 1 and case["title"] == "Recalculate total after changing address"
    assert case["suite_id"] == suite["id"] and case["project_id"] == project["id"] and case["step_count"] == 4
    assert [s["action"] for s in case["steps"]] == ["Action 1", "Action 2", "Action 3", "Action 4"]
    assert len({s["id"] for s in case["steps"]}) == 4  # every step has its own id
    assert case["tags"] == ["discounts", "address"]  # trimmed, lower case, no repeats
    assert case["priority"] == "p1" and case["case_type"] == "edge" and case["ai_generated"] is False
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "case.created"))
    assert event is not None and event.data["key"] == "TC-1"


def test_defaults(client, world) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    assert case["priority"] == "p3" and case["case_type"] == "positive" and case["tags"] == [] and case["preconditions"] == ""


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_developer_and_viewer_see_cases_read_only(client, world, role) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    h = world.a.h(role)
    assert client.get(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=h).json()["id"] == case["id"]
    assert [c["id"] for c in client.get(cases_url(world.a, suite), headers=h).json()["items"]] == [case["id"]]
    assert client.post(cases_url(world.a, suite), json={"title": "New case", "steps": [STEP]}, headers=h).status_code == 403
    assert client.post(f"{cases_url(world.a, suite)}/bulk", json={"cases": [{"title": "New case", "steps": [STEP]}]},
                       headers=h).status_code == 403
    assert client.patch(f"{O}/{world.a.org.id}/test-cases/{case['id']}", json={"title": "Changed"}, headers=h).status_code == 403
    r = client.delete(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=h)
    assert r.status_code == 403 and code(r) == "forbidden"


@pytest.mark.parametrize("body", [
    {}, {"title": "Case"}, {"steps": [STEP]}, {"title": "", "steps": [STEP]}, {"title": "   ", "steps": [STEP]},
    {"title": "x" * 201, "steps": [STEP]}, {"title": 5, "steps": [STEP]}, {"title": "Case", "steps": []},
    {"title": "Case", "steps": [STEP] * 51}, {"title": "Case", "steps": [{"action": "Only action"}]},
    {"title": "Case", "steps": [{"expected": "Only expected"}]}, {"title": "Case", "steps": [{"action": "", "expected": "x"}]},
    {"title": "Case", "steps": [{"action": "x", "expected": "   "}]},
    {"title": "Case", "steps": [{"action": "x" * 1001, "expected": "x"}]},
    {"title": "Case", "steps": [{"action": "x", "expected": "x", "extra": 1}]},
    {"title": "Case", "steps": [{"id": "nope", "action": "x", "expected": "x"}]},
    {"title": "Case", "steps": [{"id": SAME_ID, **STEP}, {"id": SAME_ID, **STEP}]},
    {"title": "Case", "steps": [STEP], "preconditions": "p" * 2001}, {"title": "Case", "steps": [STEP], "tags": ["t"] * 21},
    {"title": "Case", "steps": [STEP], "tags": ["x" * 31]}, {"title": "Case", "steps": [STEP], "tags": [""]},
    {"title": "Case", "steps": [STEP], "priority": "p5"}, {"title": "Case", "steps": [STEP], "case_type": "weird"},
    {"title": "Case", "steps": [STEP], "extra": 1}, {"title": "Case", "steps": [STEP], "ai_usage_id": str(uuid.uuid4())},
])
def test_create_case_invalid_input(client, world, body) -> None:
    _, suite = setup(client, world.a)
    r = client.post(cases_url(world.a, suite), json=body, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_steps_and_title_at_the_limits_are_accepted(client, world) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite, title="x" * 200, steps=steps(50), tags=["t" * 30, *[f"tag{i}" for i in range(19)]])
    assert case["step_count"] == 50 and len(case["title"]) == 200 and len(case["tags"]) == 20


def test_one_step_is_enough(client, world) -> None:
    _, suite = setup(client, world.a)
    assert make_case(client, world.a, suite, steps=[STEP])["step_count"] == 1


def test_create_in_a_missing_deleted_or_foreign_suite_is_404(client, world) -> None:
    theirs = make_suite(client, world.b, make_project(client, world.b))
    _, suite = setup(client, world.a)
    client.delete(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h("qa_lead"))
    for sid in (str(uuid.uuid4()), theirs["id"], suite["id"]):
        r = client.post(f"{O}/{world.a.org.id}/test-suites/{sid}/cases", json={"title": "Case", "steps": [STEP]},
                        headers=world.a.h("qa_lead"))
        assert r.status_code == 404 and code(r) == "not_found"


# Numbering (D-016) -----------------------------------------------------------------------

def test_numbers_run_per_org_across_suites_and_a_deleted_number_is_never_reused(client, world) -> None:
    a = world.a
    web, api = make_project(client, a), make_project(client, a, key="API")
    s1, s2 = make_suite(client, a, web), make_suite(client, a, api, name="Other")
    first, second = make_case(client, a, s1), make_case(client, a, s2, title="In the other project")
    assert (first["key"], second["key"]) == ("TC-1", "TC-2")
    assert client.delete(f"{O}/{a.org.id}/test-cases/{second['id']}", headers=a.h("qa_lead")).status_code == 204
    assert make_case(client, a, s1, title="After the delete")["key"] == "TC-3"  # TC-2 stays used
    suite_b = make_suite(client, world.b, make_project(client, world.b))
    assert make_case(client, world.b, suite_b)["key"] == "TC-1"  # numbers are per org


def test_two_cases_created_at_once_never_share_a_number(engine) -> None:
    """Real concurrent sessions and commits (the shared test session cannot overlap). Cleans up what it creates."""
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import delete
    from sqlalchemy.orm import Session

    from app.modules.auth.infrastructure.models import User
    from app.modules.orgs.infrastructure.models import Membership, Organization
    from app.modules.projects.infrastructure.models import Project
    from app.modules.testing.application import service
    from app.modules.testing.infrastructure.models import TestSuite
    from app.modules.testing.schemas.testing import CaseIn, StepIn

    tag = uuid.uuid4().hex[:8]
    with Session(engine) as s:
        user = User(email=f"race-{tag}@example.test", full_name="Race", password_hash="x")
        org = Organization(name="Race org", slug=f"race-{tag}", ai_daily_limit=1)
        s.add_all([user, org])
        s.flush()
        s.add(Membership(org_id=org.id, user_id=user.id, role="org_admin", status="active"))
        project = Project(org_id=org.id, name="Race", key="RACE")
        s.add(project)
        s.flush()
        suite = TestSuite(org_id=org.id, project_id=project.id, name="Race suite")
        s.add(suite)
        s.commit()
        ids = (user.id, org.id, suite.id)

    def create(n: int) -> int:
        with Session(engine) as session:
            body = CaseIn(title=f"Concurrent case {n}", steps=[StepIn(action="Do", expected="Done")])
            return service.create_cases(session, ids[1], ids[0], ids[2], [body])[0].number

    try:
        with ThreadPoolExecutor(max_workers=10) as pool:
            numbers = list(pool.map(create, range(20)))
        assert sorted(numbers) == list(range(1, 21))
    finally:
        with Session(engine) as s:
            s.execute(delete(Organization).where(Organization.id == ids[1]))  # cascades to suites, cases and the counter
            s.execute(delete(User).where(User.id == ids[0]))
            s.commit()


# API-095 list ---------------------------------------------------------------------------

def test_list_is_in_number_order_with_summaries_and_pages(client, world) -> None:
    _, suite = setup(client, world.a)
    for n in range(5):
        make_case(client, world.a, suite, title=f"Case {n}", steps=steps(n + 1))
    page = client.get(cases_url(world.a, suite), headers=world.a.h("viewer")).json()
    assert [c["key"] for c in page["items"]] == ["TC-1", "TC-2", "TC-3", "TC-4", "TC-5"] and page["total"] == 5
    assert [c["step_count"] for c in page["items"]] == [1, 2, 3, 4, 5]
    assert "steps" not in page["items"][0] and "preconditions" not in page["items"][0]  # summaries only
    two = client.get(cases_url(world.a, suite), params={"page_size": 2, "page": 3}, headers=world.a.h("viewer")).json()
    assert [c["key"] for c in two["items"]] == ["TC-5"] and two["page"] == 3


def test_list_filters_by_tag_and_type(client, world) -> None:
    _, suite = setup(client, world.a)
    make_case(client, world.a, suite, title="Discount one", tags=["discounts"], case_type="positive")
    make_case(client, world.a, suite, title="Discount two", tags=["Discounts", "payments"], case_type="negative")
    make_case(client, world.a, suite, title="Edge one", tags=["limits"], case_type="edge")
    keys = lambda **p: [c["key"] for c in client.get(cases_url(world.a, suite), params=p, headers=world.a.h("qa_lead")).json()["items"]]  # noqa: E731
    assert keys(tag="discounts") == ["TC-1", "TC-2"] and keys(tag="DISCOUNTS ") == ["TC-1", "TC-2"]
    assert keys(case_type="edge") == ["TC-3"] and keys(tag="discounts", case_type="negative") == ["TC-2"]
    assert keys(tag="nothing") == []


@pytest.mark.parametrize("params", [{"page_size": 101}, {"page": 0}, {"case_type": "weird"}, {"tag": "x" * 31}])
def test_list_cases_invalid_params_are_422(client, world, params) -> None:
    _, suite = setup(client, world.a)
    r = client.get(cases_url(world.a, suite), params=params, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_list_hides_deleted_cases_and_other_orgs(client, world) -> None:
    _, suite = setup(client, world.a)
    keep, gone = make_case(client, world.a, suite), make_case(client, world.a, suite, title="Gone")
    client.delete(f"{O}/{world.a.org.id}/test-cases/{gone['id']}", headers=world.a.h("qa_lead"))
    assert [c["id"] for c in client.get(cases_url(world.a, suite), headers=world.a.h("qa_lead")).json()["items"]] == [keep["id"]]
    theirs = make_suite(client, world.b, make_project(client, world.b))
    r = client.get(f"{O}/{world.a.org.id}/test-suites/{theirs['id']}/cases", headers=world.a.h("org_admin"))
    assert r.status_code == 404


# API-097 get ----------------------------------------------------------------------------

def test_get_by_uuid_and_by_key_in_any_case(client, world) -> None:
    project, suite = setup(client, world.a)
    case = make_case(client, world.a, suite, steps=steps(3), preconditions="Signed in")
    for ref in (case["id"], "TC-1", "tc-1"):
        r = client.get(f"{O}/{world.a.org.id}/test-cases/{ref}", headers=world.a.h("developer"))
        assert r.status_code == 200 and r.json()["id"] == case["id"], ref
    got = r.json()
    assert got["project_id"] == project["id"] and got["preconditions"] == "Signed in" and len(got["steps"]) == 3


@pytest.mark.parametrize("ref", ["TC-99", "TC-", "WEB-1", "x" * 50, "00000000-0000-0000-0000-000000000000"])
def test_get_unknown_or_malformed_ref_is_404(client, world, ref) -> None:
    setup(client, world.a)
    r = client.get(f"{O}/{world.a.org.id}/test-cases/{ref}", headers=world.a.h("qa_lead"))
    assert r.status_code == 404 and code(r) == "not_found"


def test_another_orgs_case_is_404_by_uuid_and_by_key_and_a_deleted_case_too(client, world) -> None:
    _, mine = setup(client, world.a)
    make_case(client, world.a, mine)
    theirs = make_case(client, world.b, make_suite(client, world.b, make_project(client, world.b)), title="Org B secret")
    h = world.a.h("org_admin")
    assert client.get(f"{O}/{world.a.org.id}/test-cases/{theirs['id']}", headers=h).status_code == 404
    assert client.get(f"{O}/{world.a.org.id}/test-cases/TC-2", headers=h).status_code == 404  # org B's TC-1 is not org A's TC-2
    assert client.patch(f"{O}/{world.a.org.id}/test-cases/{theirs['id']}", json={"title": "Hijack"}, headers=h).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/test-cases/{theirs['id']}", headers=h).status_code == 404


# API-098 update -------------------------------------------------------------------------

def patch(client, tenant, case, role="qa_engineer", **body):  # type: ignore[no-untyped-def]
    return client.patch(f"{O}/{tenant.org.id}/test-cases/{case['id']}", json=body, headers=tenant.h(role))


@pytest.mark.parametrize("role", MANAGERS)
def test_qa_roles_edit_cases_and_it_is_audited(client, db, world, role) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    r = patch(client, world.a, case, role, title="A better title", preconditions="New precondition", priority="p1",
              case_type="negative", tags=["One", "two"])
    assert r.status_code == 200, r.text
    got = r.json()
    assert (got["title"], got["priority"], got["case_type"], got["tags"]) == ("A better title", "p1", "negative", ["one", "two"])
    assert got["preconditions"] == "New precondition" and got["updated_at"] >= case["updated_at"]
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "case.updated"))
    assert event is not None and event.data["changes"]["title"] == {"from": case["title"], "to": "A better title"}
    assert event.data["changes"]["preconditions"] == {"changed": True}


def test_a_change_that_changes_nothing_writes_no_audit_event(client, db, world) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    r = patch(client, world.a, case, title=case["title"], tags=[], priority="p3")
    assert r.status_code == 200 and r.json()["updated_at"] == case["updated_at"]
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "case.updated")) is None


def test_reordering_steps_keeps_their_ids(client, world) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite, steps=steps(4))
    original = case["steps"]
    reordered = [original[3], original[1], original[0], original[2]]
    r = patch(client, world.a, case, steps=reordered)
    assert r.status_code == 200
    assert [s["id"] for s in r.json()["steps"]] == [s["id"] for s in reordered]
    assert [s["action"] for s in r.json()["steps"]] == ["Action 4", "Action 2", "Action 1", "Action 3"]
    again = client.get(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=world.a.h("viewer")).json()
    assert [s["id"] for s in again["steps"]] == [s["id"] for s in reordered]  # stored in the new order


def test_editing_a_step_keeps_its_id_and_a_new_step_gets_one(client, world) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite, steps=steps(2))
    first, second = case["steps"]
    r = patch(client, world.a, case, steps=[{**first, "action": "Edited action"}, second, {"action": "Brand new", "expected": "Works"}])
    got = r.json()["steps"]
    assert got[0]["id"] == first["id"] and got[0]["action"] == "Edited action" and got[1]["id"] == second["id"]
    assert got[2]["action"] == "Brand new" and got[2]["id"] not in (first["id"], second["id"])
    assert r.json()["step_count"] == 3


@pytest.mark.parametrize("body", [
    {}, {"title": None}, {"title": ""}, {"title": "x" * 201}, {"steps": None}, {"steps": []}, {"steps": [STEP] * 51},
    {"steps": [{"action": "x"}]}, {"tags": None}, {"tags": ["t"] * 21}, {"priority": None}, {"priority": "p5"},
    {"case_type": "weird"}, {"preconditions": None}, {"suite_id": None}, {"suite_id": "nope"}, {"number": 9}, {"ai_generated": True},
])
def test_update_case_invalid_input(client, world, body) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    r = client.patch(f"{O}/{world.a.org.id}/test-cases/{case['id']}", json=body, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_a_case_moves_only_to_a_suite_of_the_same_project(client, world) -> None:
    a = world.a
    web, api = make_project(client, a), make_project(client, a, key="API")
    s1, s2 = make_suite(client, a, web), make_suite(client, a, web, name="Second")
    other = make_suite(client, a, api, name="Other project")
    theirs = make_suite(client, world.b, make_project(client, world.b))
    case = make_case(client, a, s1)
    moved = patch(client, a, case, suite_id=s2["id"])
    assert moved.status_code == 200 and moved.json()["suite_id"] == s2["id"]
    assert [c["id"] for c in client.get(cases_url(a, s2), headers=a.h("qa_lead")).json()["items"]] == [case["id"]]
    assert client.get(cases_url(a, s1), headers=a.h("qa_lead")).json()["total"] == 0
    for target in (other["id"], theirs["id"], str(uuid.uuid4())):
        r = patch(client, a, case, suite_id=target)
        assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "suite_id"], target


def test_updating_a_missing_case_is_404(client, world) -> None:
    r = client.patch(f"{O}/{world.a.org.id}/test-cases/{uuid.uuid4()}", json={"title": "Nope"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 404


# API-099 delete -------------------------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_qa_roles_delete_cases_softly_and_it_is_audited(client, db, world, role) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    r = client.delete(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=world.a.h(role))
    assert r.status_code == 204 and r.content == b""
    assert client.get(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=world.a.h(role)).status_code == 404
    assert client.get(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h(role)).json()["case_count"] == 0
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "case.deleted"))
    assert event is not None and event.data["key"] == "TC-1"


def test_deleting_a_missing_or_already_deleted_case_is_404(client, world) -> None:
    _, suite = setup(client, world.a)
    case = make_case(client, world.a, suite)
    h = world.a.h("qa_lead")
    assert client.delete(f"{O}/{world.a.org.id}/test-cases/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=h).status_code == 204
    assert client.delete(f"{O}/{world.a.org.id}/test-cases/{case['id']}", headers=h).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/test-cases/not-a-uuid", headers=h).status_code == 422


# API-100 bulk ---------------------------------------------------------------------------

def bulk(client, tenant, suite, cases, role="qa_engineer", **extra):  # type: ignore[no-untyped-def]
    return client.post(f"{cases_url(tenant, suite)}/bulk", json={"cases": cases, **extra}, headers=tenant.h(role))


def case_body(n: int, **extra) -> dict:  # type: ignore[type-arg]
    return {"title": f"Bulk case {n}", "steps": steps(2), **extra}


@pytest.mark.parametrize("role", MANAGERS)
def test_bulk_creates_cases_with_consecutive_numbers(client, world, role) -> None:
    _, suite = setup(client, world.a)
    make_case(client, world.a, suite)
    r = bulk(client, world.a, suite, [case_body(1, tags=["Smoke"]), case_body(2, case_type="negative", priority="p2"), case_body(3)], role)
    assert r.status_code == 201, r.text
    created = r.json()["created"]
    assert [c["key"] for c in created] == ["TC-2", "TC-3", "TC-4"] and created[1]["case_type"] == "negative"
    assert created[0]["tags"] == ["smoke"] and all(c["step_count"] == 2 and c["suite_id"] == suite["id"] for c in created)
    assert client.get(cases_url(world.a, suite), headers=world.a.h(role)).json()["total"] == 4


def test_bulk_can_mark_cases_as_ai_generated(client, world) -> None:
    _, suite = setup(client, world.a)
    created = bulk(client, world.a, suite, [case_body(1, ai_generated=True), case_body(2)]).json()["created"]
    assert [c["ai_generated"] for c in created] == [True, False]


def test_bulk_at_the_limit_is_accepted_and_above_it_creates_nothing(client, world) -> None:
    _, suite = setup(client, world.a)
    assert bulk(client, world.a, suite, [case_body(n) for n in range(50)]).status_code == 201
    r = bulk(client, world.a, suite, [case_body(n) for n in range(51)])
    assert r.status_code == 422 and code(r) == "validation_error"
    assert client.get(cases_url(world.a, suite), headers=world.a.h("qa_lead")).json()["total"] == 50
    assert make_case(client, world.a, suite, title="After")["key"] == "TC-51"  # nothing was reserved by the refused request


def test_bulk_is_all_or_nothing(client, world) -> None:
    _, suite = setup(client, world.a)
    r = bulk(client, world.a, suite, [case_body(1), case_body(2), {"title": "Bad case", "steps": []}, case_body(4)])
    assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"][:3] == ["body", "cases", "2"]
    assert client.get(cases_url(world.a, suite), headers=world.a.h("qa_lead")).json()["total"] == 0
    assert make_case(client, world.a, suite)["key"] == "TC-1"


@pytest.mark.parametrize("body", [{}, {"cases": []}, {"cases": "nope"}, {"cases": [{"title": "x"}]}, {"cases": [case_body(1)], "extra": 1}])
def test_bulk_invalid_input(client, world, body) -> None:
    _, suite = setup(client, world.a)
    r = client.post(f"{cases_url(world.a, suite)}/bulk", json=body, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_bulk_refuses_an_ai_usage_id_until_the_ai_module_registers_its_check(client, world) -> None:
    _, suite = setup(client, world.a)
    usage = uuid.uuid4()
    r = bulk(client, world.a, suite, [case_body(1)], ai_usage_id=str(usage))
    assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "ai_usage_id"]
    assert client.get(cases_url(world.a, suite), headers=world.a.h("qa_lead")).json()["total"] == 0
    hooks.ai_usage_exists.append(lambda db, org_id, uid: uid == usage)
    try:
        assert bulk(client, world.a, suite, [case_body(1, ai_generated=True)], ai_usage_id=str(usage)).status_code == 201
        assert bulk(client, world.a, suite, [case_body(2)], ai_usage_id=str(uuid.uuid4())).status_code == 422
    finally:
        hooks.ai_usage_exists.clear()


def test_bulk_in_a_missing_or_foreign_suite_is_404(client, world) -> None:
    theirs = make_suite(client, world.b, make_project(client, world.b))
    for sid in (str(uuid.uuid4()), theirs["id"]):
        r = client.post(f"{O}/{world.a.org.id}/test-suites/{sid}/cases/bulk", json={"cases": [case_body(1)]}, headers=world.a.h("qa_lead"))
        assert r.status_code == 404
