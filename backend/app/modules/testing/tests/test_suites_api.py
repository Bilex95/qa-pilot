"""API-090 to API-094 (I-06): happy, invalid, forbidden and cross tenant for every suite endpoint.
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.testing.application import hooks

O = "/api/v1/orgs"
MANAGERS = ["org_admin", "qa_lead", "qa_engineer"]
NON_MANAGERS = ["developer", "viewer"]
ALL_ROLES = [*MANAGERS, *NON_MANAGERS]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def make_project(client, tenant, key="WEB"):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/projects", json={"name": f"Project {key}", "key": key}, headers=tenant.h("qa_lead"))
    assert r.status_code == 201, r.text
    return r.json()


def make_suite(client, tenant, project, name="Checkout", role="qa_engineer", **extra):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/test-suites", json={"project_id": project["id"], "name": name, **extra},
                    headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


def make_case(client, tenant, suite, title="Apply a valid discount code", role="qa_engineer", **extra):  # type: ignore[no-untyped-def]
    body = {"title": title, "steps": [{"action": "Open the cart", "expected": "The cart is shown"}], **extra}
    r = client.post(f"{O}/{tenant.org.id}/test-suites/{suite['id']}/cases", json=body, headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


# API-091 create -------------------------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_qa_roles_create_suites(client, db, world, role) -> None:
    project = make_project(client, world.a)
    suite = make_suite(client, world.a, project, role=role, description="Cart and payment")
    assert suite["name"] == "Checkout" and suite["project_id"] == project["id"] and suite["description"] == "Cart and payment"
    assert suite["case_count"] == 0 and suite["last_run_pass_rate"] is None
    assert suite["component_id"] is None and suite["component"] is None
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "suite.created"))
    assert event is not None and event.data["name"] == "Checkout"


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_others_cannot_create_suites(client, world, role) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/test-suites", json={"project_id": project["id"], "name": "Nope"}, headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"


@pytest.mark.parametrize("body", [
    {}, {"name": ""}, {"name": "   "}, {"name": "x" * 81}, {"name": 5},
    {"name": "Ok", "description": "d" * 1001}, {"name": "Ok", "extra": 1}, {"name": "Ok", "component_id": "nope"},
])
def test_create_suite_invalid_input(client, world, body) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/test-suites", json={"project_id": project["id"], **body}, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_create_suite_without_a_project_is_422(client, world) -> None:
    r = client.post(f"{O}/{world.a.org.id}/test-suites", json={"name": "Checkout"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"][-1] == "project_id"


def test_suite_name_at_the_limit_and_trimmed(client, world) -> None:
    project = make_project(client, world.a)
    assert make_suite(client, world.a, project, name="x" * 80)["name"] == "x" * 80
    assert make_suite(client, world.a, project, name="  Padded  ")["name"] == "Padded"


def test_project_must_exist_in_the_org_and_not_be_archived(client, world) -> None:
    mine = make_project(client, world.a)
    theirs = make_project(client, world.b)
    for project_id in (theirs["id"], str(uuid.uuid4())):
        r = client.post(f"{O}/{world.a.org.id}/test-suites", json={"project_id": project_id, "name": "Suite"},
                        headers=world.a.h("qa_lead"))
        assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "project_id"]
    client.patch(f"{O}/{world.a.org.id}/projects/{mine['id']}", json={"archived": True}, headers=world.a.h("qa_lead"))
    r = client.post(f"{O}/{world.a.org.id}/test-suites", json={"project_id": mine["id"], "name": "Suite"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and "archived" in r.json()["error"]["details"][0]["msg"]


def test_component_must_belong_to_the_suites_project(client, world) -> None:
    a = world.a
    web, api = make_project(client, a), make_project(client, a, key="API")
    mine = client.post(f"{O}/{a.org.id}/projects/{web['id']}/components", json={"name": "Checkout"}, headers=a.h("qa_lead")).json()
    other = client.post(f"{O}/{a.org.id}/projects/{api['id']}/components", json={"name": "Gateway"}, headers=a.h("qa_lead")).json()
    foreign_project = make_project(client, world.b)
    foreign = client.post(f"{O}/{world.b.org.id}/projects/{foreign_project['id']}/components", json={"name": "Checkout"},
                          headers=world.b.h("qa_lead")).json()
    for component_id in (other["id"], foreign["id"], str(uuid.uuid4())):
        r = client.post(f"{O}/{a.org.id}/test-suites", json={"project_id": web["id"], "name": "S", "component_id": component_id},
                        headers=a.h("qa_lead"))
        assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "component_id"]
    suite = make_suite(client, a, web, component_id=mine["id"])
    assert suite["component_id"] == mine["id"] and suite["component"] == "Checkout"


def test_suite_names_are_unique_per_project_ignoring_case_and_spaces(client, world) -> None:
    web, api = make_project(client, world.a), make_project(client, world.a, key="API")
    make_suite(client, world.a, web, name="Regression")
    r = client.post(f"{O}/{world.a.org.id}/test-suites", json={"project_id": web["id"], "name": "  REGRESSION "},
                    headers=world.a.h("qa_lead"))
    assert r.status_code == 409 and code(r) == "name_taken"
    assert make_suite(client, world.a, api, name="Regression")["name"] == "Regression"  # another project may reuse it


def test_a_deleted_suite_frees_its_name(client, world) -> None:
    project = make_project(client, world.a)
    suite = make_suite(client, world.a, project, name="Regression")
    assert client.delete(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h("qa_lead")).status_code == 204
    assert make_suite(client, world.a, project, name="Regression")["id"] != suite["id"]


# API-090 list ---------------------------------------------------------------------------

@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_lists_suites(client, world, role) -> None:
    make_suite(client, world.a, make_project(client, world.a))
    r = client.get(f"{O}/{world.a.org.id}/test-suites", headers=world.a.h(role))
    assert r.status_code == 200 and [s["name"] for s in r.json()["items"]] == ["Checkout"]


def test_list_is_sorted_filtered_by_project_and_counts_cases(client, world) -> None:
    a = world.a
    web, api = make_project(client, a), make_project(client, a, key="API")
    zeta, alpha = make_suite(client, a, web, name="zeta"), make_suite(client, a, web, name="Alpha")
    other = make_suite(client, a, api, name="Mid")
    make_case(client, a, alpha)
    make_case(client, a, alpha, title="Second case")
    gone = make_case(client, a, alpha, title="Deleted case")
    client.delete(f"{O}/{a.org.id}/test-cases/{gone['id']}", headers=a.h("qa_lead"))
    page = client.get(f"{O}/{a.org.id}/test-suites", headers=a.h("viewer")).json()
    assert [s["name"] for s in page["items"]] == ["Alpha", "Mid", "zeta"] and page["total"] == 3
    assert {s["name"]: s["case_count"] for s in page["items"]} == {"Alpha": 2, "Mid": 0, "zeta": 0}
    only_api = client.get(f"{O}/{a.org.id}/test-suites", params={"project_id": api["id"]}, headers=a.h("viewer")).json()
    assert [s["id"] for s in only_api["items"]] == [other["id"]] and zeta["id"]


@pytest.mark.parametrize("params", [{"page_size": 101}, {"page_size": 0}, {"page": 0}, {"project_id": "nope"}])
def test_list_invalid_params_are_422(client, world, params) -> None:
    r = client.get(f"{O}/{world.a.org.id}/test-suites", params=params, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_list_pages_and_hides_other_orgs(client, world) -> None:
    project = make_project(client, world.a)
    for n in range(3):
        make_suite(client, world.a, project, name=f"Suite {n}")
    make_suite(client, world.b, make_project(client, world.b), name="Org B suite")
    page = client.get(f"{O}/{world.a.org.id}/test-suites", params={"page_size": 2, "page": 2}, headers=world.a.h("qa_lead")).json()
    assert [s["name"] for s in page["items"]] == ["Suite 2"] and page["total"] == 3 and page["page"] == 2


def test_last_run_pass_rate_comes_from_the_runs_hook(client, world) -> None:
    suite = make_suite(client, world.a, make_project(client, world.a))
    hooks.last_run_pass_rates.append(lambda db, org_id, ids: {uuid.UUID(suite["id"]): 87.5})
    try:
        r = client.get(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h("viewer"))
    finally:
        hooks.last_run_pass_rates.clear()
    assert r.json()["last_run_pass_rate"] == 87.5


# API-092 get ----------------------------------------------------------------------------

def test_get_suite_and_missing_or_foreign_ids_are_404(client, world) -> None:
    suite = make_suite(client, world.a, make_project(client, world.a))
    assert client.get(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h("developer")).json()["id"] == suite["id"]
    theirs = make_suite(client, world.b, make_project(client, world.b))
    for sid in (str(uuid.uuid4()), theirs["id"]):
        r = client.get(f"{O}/{world.a.org.id}/test-suites/{sid}", headers=world.a.h("org_admin"))
        assert r.status_code == 404 and code(r) == "not_found"
    assert client.get(f"{O}/{world.a.org.id}/test-suites/not-a-uuid", headers=world.a.h("org_admin")).status_code == 422


# API-093 update -------------------------------------------------------------------------

def patch(client, tenant, suite, role="qa_engineer", **body):  # type: ignore[no-untyped-def]
    return client.patch(f"{O}/{tenant.org.id}/test-suites/{suite['id']}", json=body, headers=tenant.h(role))


@pytest.mark.parametrize("role", MANAGERS)
def test_qa_roles_edit_suites(client, db, world, role) -> None:
    project = make_project(client, world.a)
    suite = make_suite(client, world.a, project)
    comp = client.post(f"{O}/{world.a.org.id}/projects/{project['id']}/components", json={"name": "Checkout"},
                       headers=world.a.h("qa_lead")).json()
    r = patch(client, world.a, suite, role, name="Checkout flow", description="New text", component_id=comp["id"])
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Checkout flow" and r.json()["component"] == "Checkout" and r.json()["description"] == "New text"
    assert patch(client, world.a, suite, role, component_id=None).json()["component_id"] is None  # cleared
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "suite.updated"))
    assert event is not None and event.data["changes"]["name"]["to"] == "Checkout flow"


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_others_cannot_edit_suites(client, world, role) -> None:
    suite = make_suite(client, world.a, make_project(client, world.a))
    r = patch(client, world.a, suite, role, name="Changed")
    assert r.status_code == 403 and code(r) == "forbidden"


@pytest.mark.parametrize("body", [{}, {"name": None}, {"name": ""}, {"name": "x" * 81}, {"description": None},
                                  {"description": "d" * 1001}, {"component_id": "nope"}, {"project_id": str(uuid.uuid4())}])
def test_update_suite_invalid_input(client, world, body) -> None:
    suite = make_suite(client, world.a, make_project(client, world.a))
    r = client.patch(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", json=body, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_rename_conflicts_but_a_case_change_of_the_same_name_is_fine(client, world) -> None:
    project = make_project(client, world.a)
    one, two = make_suite(client, world.a, project, name="One"), make_suite(client, world.a, project, name="Two")
    assert patch(client, world.a, two, name=" ONE ").status_code == 409
    assert patch(client, world.a, one, name="ONE").json()["name"] == "ONE"
    assert two["id"]


def test_update_suite_component_of_another_project_is_422_and_unknown_suite_404(client, world) -> None:
    a = world.a
    web, api = make_project(client, a), make_project(client, a, key="API")
    other = client.post(f"{O}/{a.org.id}/projects/{api['id']}/components", json={"name": "Gateway"}, headers=a.h("qa_lead")).json()
    suite = make_suite(client, a, web)
    assert patch(client, a, suite, component_id=other["id"]).status_code == 422
    r = client.patch(f"{O}/{a.org.id}/test-suites/{uuid.uuid4()}", json={"name": "Nope"}, headers=a.h("qa_lead"))
    assert r.status_code == 404
    theirs = make_suite(client, world.b, make_project(client, world.b))
    assert client.patch(f"{O}/{a.org.id}/test-suites/{theirs['id']}", json={"name": "Hijack"}, headers=a.h("org_admin")).status_code == 404


# API-094 delete -------------------------------------------------------------------------

@pytest.mark.parametrize("role", MANAGERS)
def test_qa_roles_delete_a_suite_and_its_cases_go_with_it(client, db, world, role) -> None:
    a = world.a
    suite = make_suite(client, a, make_project(client, a))
    case = make_case(client, a, suite)
    make_case(client, a, suite, title="Second case")
    r = client.delete(f"{O}/{a.org.id}/test-suites/{suite['id']}", headers=a.h(role))
    assert r.status_code == 204 and r.content == b""
    assert client.get(f"{O}/{a.org.id}/test-suites/{suite['id']}", headers=a.h(role)).status_code == 404
    assert client.get(f"{O}/{a.org.id}/test-cases/{case['id']}", headers=a.h(role)).status_code == 404
    assert client.get(f"{O}/{a.org.id}/test-suites/{suite['id']}/cases", headers=a.h(role)).status_code == 404
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "suite.deleted"))
    assert event is not None and event.data == {"name": "Checkout", "cases_deleted": 2}


@pytest.mark.parametrize("role", NON_MANAGERS)
def test_others_cannot_delete_suites(client, world, role) -> None:
    suite = make_suite(client, world.a, make_project(client, world.a))
    r = client.delete(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"
    assert client.get(f"{O}/{world.a.org.id}/test-suites/{suite['id']}", headers=world.a.h(role)).status_code == 200


def test_delete_unknown_twice_and_foreign_suites_are_404(client, world) -> None:
    a = world.a
    suite = make_suite(client, a, make_project(client, a))
    theirs = make_suite(client, world.b, make_project(client, world.b))
    h = a.h("qa_lead")
    assert client.delete(f"{O}/{a.org.id}/test-suites/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.delete(f"{O}/{a.org.id}/test-suites/{theirs['id']}", headers=h).status_code == 404
    assert client.delete(f"{O}/{a.org.id}/test-suites/{suite['id']}", headers=h).status_code == 204
    assert client.delete(f"{O}/{a.org.id}/test-suites/{suite['id']}", headers=h).status_code == 404
