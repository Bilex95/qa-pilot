"""API-101 to API-106 (I-07): happy, invalid, forbidden and cross tenant for every run endpoint, plus the rules on top (case snapshots,
read only completed runs, pass rate, the bug draft of a failed step and the link from the bug back to the result).
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.bugs.tests.test_bugs_api import make_bug
from app.modules.testing.domain.rules import draft_title, pass_rate
from app.modules.testing.tests.test_suites_api import make_case, make_project, make_suite

O = "/api/v1/orgs"
QA = ["org_admin", "qa_lead", "qa_engineer"]
NOT_QA = ["developer", "viewer"]
ALL = [*QA, *NOT_QA]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def steps(n: int) -> list[dict[str, str]]:
    return [{"action": f"Action {i}", "expected": f"Expected {i}"} for i in range(1, n + 1)]


def setup(client, tenant, key="WEB", cases=3):  # type: ignore[no-untyped-def]
    """A project, a suite and `cases` cases with three steps each."""
    project = make_project(client, tenant, key)
    suite = make_suite(client, tenant, project)
    made = [make_case(client, tenant, suite, title=f"Case number {i}", steps=steps(3)) for i in range(1, cases + 1)]
    return project, suite, made


def make_run(client, tenant, project, suite, role="qa_lead", **extra):  # type: ignore[no-untyped-def]
    body = {"project_id": project["id"], "name": "WEB 2.4.0 regression", "suite_ids": [suite["id"]], **extra}
    r = client.post(f"{O}/{tenant.org.id}/test-runs", json=body, headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


def run_url(tenant, run, tail=""):  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/test-runs/{run['id']}{tail}"


def mark(client, tenant, run, n, result, role="qa_engineer", **extra):  # type: ignore[no-untyped-def]
    res = run["results"][n]
    return client.patch(run_url(tenant, run, f"/results/{res['id']}"), json={"result": result, **extra}, headers=tenant.h(role))


def fresh(client, tenant, run, role="viewer"):  # type: ignore[no-untyped-def]
    return client.get(run_url(tenant, run), headers=tenant.h(role)).json()


# API-102 create -------------------------------------------------------------------------

@pytest.mark.parametrize("role", QA)
def test_qa_roles_start_a_run_with_every_case_untested_and_it_is_audited(client, db, world, role) -> None:
    project, suite, cases = setup(client, world.a)
    env = client.get(f"{O}/{world.a.org.id}/projects/{project['id']}/environments", headers=world.a.h("qa_lead")).json()[0]
    run = make_run(client, world.a, project, suite, role=role, environment_id=env["id"])
    assert run["key"] == "R-1" and run["number"] == 1 and run["status"] == "in_progress" and run["completed_at"] is None
    assert run["environment"] == env["name"] and run["release_id"] is None and run["created_by_id"] == str(world.a.users[role].id)
    assert run["counts"] == {"pass": 0, "fail": 0, "blocked": 0, "skipped": 0, "untested": 3} and run["total"] == 3
    assert run["pass_rate"] is None
    assert [r["case_key"] for r in run["results"]] == ["TC-1", "TC-2", "TC-3"]
    assert [r["position"] for r in run["results"]] == [0, 1, 2] and {r["result"] for r in run["results"]} == {"untested"}
    assert len(run["results"][0]["steps"]) == 3 and run["results"][0]["case_title"] == "Case number 1"
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "run.created"))
    assert event is not None and event.data["key"] == "R-1" and event.data["case_count"] == 3 and event.org_id == world.a.org.id
    assert cases[0]["id"] == run["results"][0]["case_id"]


@pytest.mark.parametrize("role", NOT_QA)
def test_developer_and_viewer_cannot_start_a_run(client, world, role) -> None:
    project, suite, _ = setup(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/test-runs", json={"project_id": project["id"], "name": "Nope run", "suite_ids": [suite["id"]]},
                    headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"


def test_suites_and_single_cases_add_up_without_repeats_and_numbers_count_on(client, world) -> None:
    project, suite, cases = setup(client, world.a)
    other = make_suite(client, world.a, project, name="Payments")
    extra = make_case(client, world.a, other, title="A payment case")
    run = make_run(client, world.a, project, suite, case_ids=[cases[0]["id"], extra["id"]])
    assert [r["case_key"] for r in run["results"]] == ["TC-1", "TC-2", "TC-3", "TC-4"]  # case 1 is in both lists and counted once
    only_cases = client.post(f"{O}/{world.a.org.id}/test-runs", headers=world.a.h("qa_lead"),
                             json={"project_id": project["id"], "name": "Cases only", "case_ids": [extra["id"]]})
    assert only_cases.status_code == 201 and only_cases.json()["key"] == "R-2" and only_cases.json()["total"] == 1


@pytest.mark.parametrize("change", [
    {"suite_ids": [], "case_ids": []}, {"name": "ab"}, {"name": "x" * 121}, {"suite_ids": [str(uuid.uuid4())]},
    {"case_ids": [str(uuid.uuid4())]}, {"environment_id": str(uuid.uuid4())}, {"release_id": str(uuid.uuid4())},
    {"case_ids": [str(uuid.uuid4()) for _ in range(501)]},
])
def test_a_run_needs_a_name_real_suites_and_cases_and_a_valid_environment(client, world, change) -> None:
    project, suite, _ = setup(client, world.a)
    body = {"project_id": project["id"], "name": "A good run", "suite_ids": [suite["id"]], **change}
    r = client.post(f"{O}/{world.a.org.id}/test-runs", json=body, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error", r.text


def test_an_empty_suite_and_an_archived_or_foreign_project_are_refused(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    empty = make_suite(client, world.a, project, name="Empty one")
    h = world.a.h("qa_lead")
    assert client.post(f"{O}/{world.a.org.id}/test-runs", headers=h,
                       json={"project_id": project["id"], "name": "Empty run", "suite_ids": [empty["id"]]}).status_code == 422
    foreign_project, foreign_suite, foreign_cases = setup(client, world.b)
    for body in ({"project_id": foreign_project["id"], "suite_ids": [foreign_suite["id"]]},
                 {"project_id": project["id"], "suite_ids": [foreign_suite["id"]]},
                 {"project_id": project["id"], "case_ids": [foreign_cases[0]["id"]]}):
        r = client.post(f"{O}/{world.a.org.id}/test-runs", headers=h, json={"name": "Foreign run", **body})
        assert r.status_code == 422, body
    assert client.patch(f"{O}/{world.a.org.id}/projects/{project['id']}", json={"archived": True}, headers=h).status_code == 200
    r = client.post(f"{O}/{world.a.org.id}/test-runs", headers=h,
                    json={"project_id": project["id"], "name": "Late run", "suite_ids": [suite["id"]]})
    assert r.status_code == 422


def test_a_case_of_another_project_and_an_environment_of_another_project_are_refused(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    api_project = make_project(client, world.a, "API")
    api_suite = make_suite(client, world.a, api_project, name="API suite")
    api_case = make_case(client, world.a, api_suite, title="An API case")
    h = world.a.h("qa_lead")
    assert client.post(f"{O}/{world.a.org.id}/test-runs", headers=h, json={
        "project_id": project["id"], "name": "Mixed run", "case_ids": [api_case["id"]]}).status_code == 422
    api_env = client.get(f"{O}/{world.a.org.id}/projects/{api_project['id']}/environments", headers=h).json()[0]
    assert client.post(f"{O}/{world.a.org.id}/test-runs", headers=h, json={
        "project_id": project["id"], "name": "Mixed run", "suite_ids": [suite["id"]], "environment_id": api_env["id"]}).status_code == 422


# API-101 list and API-103 get ---------------------------------------------------------------

def test_every_role_lists_runs_with_counts_and_a_pass_rate_and_filters_work(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    other_project = make_project(client, world.a, "API")
    other_suite = make_suite(client, world.a, other_project, name="API suite")
    make_case(client, world.a, other_suite, title="An API case")
    first = make_run(client, world.a, project, suite, name="First run")
    second = make_run(client, world.a, other_project, other_suite, name="Second run")
    assert mark(client, world.a, first, 0, "pass").status_code == 200
    assert mark(client, world.a, first, 1, "fail", failed_step_index=1).status_code == 200
    client.patch(run_url(world.a, second), json={"status": "completed"}, headers=world.a.h("qa_lead"))
    for role in ALL:
        page = client.get(f"{O}/{world.a.org.id}/test-runs", headers=world.a.h(role)).json()
        assert [r["name"] for r in page["items"]] == ["Second run", "First run"] and page["total"] == 2  # newest first
    items = {r["name"]: r for r in client.get(f"{O}/{world.a.org.id}/test-runs", headers=world.a.h("viewer")).json()["items"]}
    assert items["First run"]["counts"] == {"pass": 1, "fail": 1, "blocked": 0, "skipped": 0, "untested": 1}
    assert items["First run"]["pass_rate"] == 50 and items["Second run"]["pass_rate"] is None
    only = client.get(f"{O}/{world.a.org.id}/test-runs", params={"project_id": project["id"]}, headers=world.a.h("viewer")).json()
    assert [r["name"] for r in only["items"]] == ["First run"]
    done = client.get(f"{O}/{world.a.org.id}/test-runs", params={"status": "completed"}, headers=world.a.h("viewer")).json()
    assert [r["name"] for r in done["items"]] == ["Second run"]
    assert client.get(f"{O}/{world.a.org.id}/test-runs", params={"status": "paused"}, headers=world.a.h("viewer")).status_code == 422
    by_release = client.get(f"{O}/{world.a.org.id}/test-runs", params={"release_id": str(uuid.uuid4())}, headers=world.a.h("viewer"))
    assert by_release.json()["total"] == 0
    second_page = client.get(f"{O}/{world.a.org.id}/test-runs", params={"page": 2, "page_size": 1}, headers=world.a.h("viewer")).json()
    assert [r["name"] for r in second_page["items"]] == ["First run"] and second_page["total"] == 2


def test_a_run_is_read_by_id_and_by_key_and_other_workspaces_never_see_it(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    h = world.a.h("viewer")
    assert client.get(f"{O}/{world.a.org.id}/test-runs/{run['id']}", headers=h).json()["id"] == run["id"]
    assert client.get(f"{O}/{world.a.org.id}/test-runs/R-1", headers=h).json()["id"] == run["id"]
    assert client.get(f"{O}/{world.a.org.id}/test-runs/r-1", headers=h).status_code == 200
    for ref in ("R-99", "not-a-run", str(uuid.uuid4())):
        assert client.get(f"{O}/{world.a.org.id}/test-runs/{ref}", headers=h).status_code == 404
    foreign = client.get(f"{O}/{world.b.org.id}/test-runs/{run['id']}", headers=world.b.h("org_admin"))
    assert foreign.status_code == 404 and code(foreign) == "not_found"
    assert client.get(f"{O}/{world.b.org.id}/test-runs", headers=world.b.h("org_admin")).json()["total"] == 0


def test_run_numbers_are_per_workspace(client, world) -> None:
    a_project, a_suite, _ = setup(client, world.a)
    b_project, b_suite, _ = setup(client, world.b)
    assert make_run(client, world.a, a_project, a_suite)["key"] == "R-1"
    assert make_run(client, world.a, a_project, a_suite)["key"] == "R-2"
    assert make_run(client, world.b, b_project, b_suite)["key"] == "R-1"


# The snapshot ---------------------------------------------------------------------------

def test_editing_or_deleting_a_case_after_the_run_started_changes_nothing_in_the_run(client, world) -> None:
    project, suite, cases = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    h = world.a.h("qa_lead")
    assert client.patch(f"{O}/{world.a.org.id}/test-cases/{cases[0]['id']}", headers=h,
                        json={"title": "A completely new title", "steps": steps(1)}).status_code == 200
    assert client.delete(f"{O}/{world.a.org.id}/test-cases/{cases[1]['id']}", headers=h).status_code == 204
    again = fresh(client, world.a, run)
    assert [r["case_title"] for r in again["results"]] == ["Case number 1", "Case number 2", "Case number 3"]
    assert len(again["results"][0]["steps"]) == 3 and again["total"] == 3
    # the deleted case still takes a result
    assert mark(client, world.a, run, 1, "pass").status_code == 200


# API-105 results ------------------------------------------------------------------------

@pytest.mark.parametrize("role", QA)
def test_qa_roles_record_results_and_the_counts_follow(client, world, role) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    ok = mark(client, world.a, run, 0, "pass", role=role, note="Looks fine")
    assert ok.status_code == 200 and ok.json()["result"] == "pass" and ok.json()["note"] == "Looks fine"
    assert ok.json()["executed_by_id"] == str(world.a.users[role].id) and ok.json()["executed_by_name"] == f"{role} a"
    assert ok.json()["executed_at"] is not None and ok.json()["failed_step_index"] is None
    bad = mark(client, world.a, run, 1, "fail", role=role, failed_step_index=2, actual_result="Total went up")
    assert bad.json()["failed_step_index"] == 2 and bad.json()["actual_result"] == "Total went up"
    assert mark(client, world.a, run, 2, "blocked", role=role).status_code == 200
    now = fresh(client, world.a, run)
    assert now["counts"] == {"pass": 1, "fail": 1, "blocked": 1, "skipped": 0, "untested": 0} and now["pass_rate"] == 33


def test_changing_a_result_back_clears_what_belongs_to_a_failure_and_untested_clears_the_executor(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    mark(client, world.a, run, 0, "fail", failed_step_index=1, actual_result="Boom", note="Seen twice")
    passed = mark(client, world.a, run, 0, "pass").json()
    assert passed["failed_step_index"] is None and passed["actual_result"] == "" and passed["note"] == "Seen twice"
    reset = mark(client, world.a, run, 0, "untested").json()
    assert reset["result"] == "untested" and reset["executed_by_id"] is None and reset["executed_at"] is None
    skipped = mark(client, world.a, run, 1, "skipped").json()
    assert skipped["result"] == "skipped"
    assert fresh(client, world.a, run)["counts"]["skipped"] == 1 and fresh(client, world.a, run)["pass_rate"] is None


def test_the_failed_step_must_exist_and_only_goes_with_a_failure(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    for extra in ({"result": "fail", "failed_step_index": 3}, {"result": "fail", "failed_step_index": -1},
                  {"result": "pass", "failed_step_index": 0}, {"result": "pass", "actual_result": "text"},
                  {"result": "fail", "actual_result": "x" * 5001}, {"result": "fail", "note": "x" * 2001}, {"result": "maybe"}, {}):
        res = run["results"][0]
        r = client.patch(run_url(world.a, run, f"/results/{res['id']}"), json=extra, headers=world.a.h("qa_lead"))
        assert r.status_code == 422 and code(r) == "validation_error", extra
    assert fresh(client, world.a, run)["results"][0]["result"] == "untested"


@pytest.mark.parametrize("role", NOT_QA)
def test_developer_and_viewer_cannot_record_results(client, world, role) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    assert mark(client, world.a, run, 0, "pass", role=role).status_code == 403


def test_a_result_of_another_run_or_workspace_is_a_404(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    other = make_run(client, world.a, project, suite, name="Another run")
    other_result = other["results"][0]["id"]
    wrong_run = client.patch(run_url(world.a, run, f"/results/{other_result}"), json={"result": "pass"}, headers=world.a.h("qa_lead"))
    assert wrong_run.status_code == 404 and code(wrong_run) == "not_found"
    b_project, b_suite, _ = setup(client, world.b)
    b_run = make_run(client, world.b, b_project, b_suite)
    res = b_run["results"][0]["id"]
    base = f"{O}/{world.a.org.id}/test-runs"
    for path in (f"{base}/{b_run['id']}/results/{res}", f"{base}/{run['id']}/results/{res}"):
        assert client.patch(path, json={"result": "pass"}, headers=world.a.h("org_admin")).status_code == 404
    assert fresh(client, world.b, b_run, role="viewer")["results"][0]["result"] == "untested"


# API-104 complete -----------------------------------------------------------------------

@pytest.mark.parametrize("role", QA)
def test_qa_roles_complete_a_run_and_it_becomes_read_only(client, db, world, role) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    mark(client, world.a, run, 0, "pass")
    mark(client, world.a, run, 1, "fail", failed_step_index=0)
    done = client.patch(run_url(world.a, run), json={"status": "completed"}, headers=world.a.h(role))
    assert done.status_code == 200 and done.json()["status"] == "completed" and done.json()["completed_at"] is not None
    assert done.json()["pass_rate"] == 50 and done.json()["counts"]["untested"] == 1
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "run.completed"))
    assert event is not None and event.data["key"] == "R-1" and event.data["pass_rate"] == 50 and event.data["counts"]["fail"] == 1
    # everything is read only now
    again = client.patch(run_url(world.a, run), json={"status": "completed"}, headers=world.a.h("qa_lead"))
    assert again.status_code == 409 and code(again) == "run_completed"
    assert client.patch(run_url(world.a, run), json={"name": "Renamed run"}, headers=world.a.h("qa_lead")).status_code == 409
    late = mark(client, world.a, run, 2, "pass")
    assert late.status_code == 409 and code(late) == "run_completed"
    assert fresh(client, world.a, run)["results"][2]["result"] == "untested"


@pytest.mark.parametrize("role", NOT_QA)
def test_developer_and_viewer_cannot_complete_or_rename_a_run(client, world, role) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    assert client.patch(run_url(world.a, run), json={"status": "completed"}, headers=world.a.h(role)).status_code == 403
    assert fresh(client, world.a, run)["status"] == "in_progress"


def test_a_running_run_can_be_renamed_and_a_bad_change_is_refused(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    h = world.a.h("qa_lead")
    assert client.patch(run_url(world.a, run), json={"name": "  A better name "}, headers=h).json()["name"] == "A better name"
    for body in ({}, {"name": "ab"}, {"name": None}, {"status": "in_progress"}, {"status": "completed", "release_id": str(uuid.uuid4())},
                 {"release_id": str(uuid.uuid4())}, {"unknown": 1}):
        assert client.patch(run_url(world.a, run), json=body, headers=h).status_code == 422, body
    assert client.patch(run_url(world.a, run), json={"release_id": None}, headers=h).status_code == 200  # unlinking is always fine
    assert fresh(client, world.a, run)["status"] == "in_progress"


def test_completing_an_unknown_or_foreign_run_is_a_404(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    done = {"status": "completed"}
    unknown = client.patch(f"{O}/{world.a.org.id}/test-runs/{uuid.uuid4()}", json=done, headers=world.a.h("qa_lead"))
    assert unknown.status_code == 404
    foreign = client.patch(f"{O}/{world.b.org.id}/test-runs/{run['id']}", json=done, headers=world.b.h("org_admin"))
    assert foreign.status_code == 404
    assert fresh(client, world.a, run)["status"] == "in_progress"


def test_the_last_completed_run_gives_each_suite_its_pass_rate(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    def listing():  # type: ignore[no-untyped-def]
        r = client.get(f"{O}/{world.a.org.id}/test-suites", params={"project_id": project["id"]}, headers=world.a.h("viewer"))
        return r.json()["items"][0]

    assert listing()["last_run_pass_rate"] is None
    running = make_run(client, world.a, project, suite)
    mark(client, world.a, running, 0, "pass")
    assert listing()["last_run_pass_rate"] is None  # a run that is not completed does not count
    client.patch(run_url(world.a, running), json={"status": "completed"}, headers=world.a.h("qa_lead"))
    assert listing()["last_run_pass_rate"] == 100
    second = make_run(client, world.a, project, suite, name="Second round")
    mark(client, world.a, second, 0, "pass")
    mark(client, world.a, second, 1, "fail", failed_step_index=0)
    client.patch(run_url(world.a, second), json={"status": "completed"}, headers=world.a.h("qa_lead"))
    assert listing()["last_run_pass_rate"] == 50  # the newest completed run wins


# API-106 bug draft ----------------------------------------------------------------------

def failed_run(client, tenant):  # type: ignore[no-untyped-def]
    project = make_project(client, tenant)
    lead = tenant.h("qa_lead")
    comp = client.post(f"{O}/{tenant.org.id}/projects/{project['id']}/components", json={"name": "Checkout"}, headers=lead).json()
    suite = make_suite(client, tenant, project, component_id=comp["id"])
    make_case(client, tenant, suite, title="Apply a valid discount code", steps=steps(4))
    env = client.get(f"{O}/{tenant.org.id}/projects/{project['id']}/environments", headers=tenant.h("qa_lead")).json()[1]
    run = make_run(client, tenant, project, suite, environment_id=env["id"])
    marked = mark(client, tenant, run, 0, "fail", failed_step_index=2, actual_result="Total went up by 4.20").json()
    return project, comp, env, run, marked


def test_a_failed_result_gives_a_prefilled_bug_and_nothing_is_saved(client, world) -> None:
    project, comp, env, run, failed = failed_run(client, world.a)
    r = client.get(run_url(world.a, run, f"/results/{failed['id']}/bug-draft"), headers=world.a.h("qa_engineer"))
    assert r.status_code == 200, r.text
    draft = r.json()
    assert draft["title"] == "Apply a valid discount code fails at step 3" and draft["project_id"] == project["id"]
    assert draft["steps_to_reproduce"] == ["Action 1", "Action 2", "Action 3"]  # up to the failed step
    assert draft["expected_result"] == "Expected 3" and draft["actual_result"] == "Total went up by 4.20"
    assert draft["environment_id"] == env["id"] and draft["component_id"] == comp["id"] and draft["release_id"] is None
    assert draft["source_run_result_id"] == failed["id"] and draft["case_key"] == "TC-1" and draft["run_key"] == "R-1"
    assert client.get(f"{O}/{world.a.org.id}/bugs", headers=world.a.h("viewer")).json()["total"] == 0


def test_a_failure_without_a_step_drafts_every_step(client, world) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    failed = mark(client, world.a, run, 0, "fail").json()
    draft = client.get(run_url(world.a, run, f"/results/{failed['id']}/bug-draft"), headers=world.a.h("qa_lead")).json()
    assert draft["title"] == "Case number 1 fails" and draft["steps_to_reproduce"] == ["Action 1", "Action 2", "Action 3"]
    assert draft["expected_result"] == ""


@pytest.mark.parametrize("result", ["pass", "blocked", "skipped", "untested"])
def test_only_a_failed_result_can_start_a_bug(client, world, result) -> None:
    project, suite, _ = setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    if result != "untested":
        mark(client, world.a, run, 0, result)
    r = client.get(run_url(world.a, run, f"/results/{run['results'][0]['id']}/bug-draft"), headers=world.a.h("qa_lead"))
    assert r.status_code == 409 and code(r) == "result_not_failed"


@pytest.mark.parametrize("role", NOT_QA)
def test_developer_and_viewer_cannot_ask_for_a_bug_draft(client, world, role) -> None:
    _, _, _, run, failed = failed_run(client, world.a)
    assert client.get(run_url(world.a, run, f"/results/{failed['id']}/bug-draft"), headers=world.a.h(role)).status_code == 403


def test_a_draft_of_another_workspace_or_run_is_a_404_and_a_completed_run_still_gives_one(client, world) -> None:
    _, _, _, run, failed = failed_run(client, world.a)
    _, _, _, b_run, b_failed = failed_run(client, world.b)
    h = world.a.h("qa_lead")
    assert client.get(f"{O}/{world.a.org.id}/test-runs/{b_run['id']}/results/{b_failed['id']}/bug-draft", headers=h).status_code == 404
    assert client.get(run_url(world.a, run, f"/results/{b_failed['id']}/bug-draft"), headers=h).status_code == 404
    client.patch(run_url(world.a, run), json={"status": "completed"}, headers=h)
    assert client.get(run_url(world.a, run, f"/results/{failed['id']}/bug-draft"), headers=h).status_code == 200


def test_a_bug_filed_from_the_draft_links_back_to_the_run_and_the_result_lists_it(client, world) -> None:
    _project, comp, env, run, failed = failed_run(client, world.a)
    draft = client.get(run_url(world.a, run, f"/results/{failed['id']}/bug-draft"), headers=world.a.h("qa_engineer")).json()
    body = {k: draft[k] for k in ("project_id", "title", "steps_to_reproduce", "expected_result", "actual_result", "environment_id",
                                  "component_id", "source_run_result_id")}
    r = client.post(f"{O}/{world.a.org.id}/bugs", json=body, headers=world.a.h("qa_engineer"))
    assert r.status_code == 201, r.text
    bug = r.json()
    assert bug["source_run_result_id"] == failed["id"] and bug["environment_id"] == env["id"] and bug["component_id"] == comp["id"]
    assert bug["source_run"] == {"run_id": run["id"], "run_key": "R-1", "run_name": "WEB 2.4.0 regression", "case_key": "TC-1"}
    shown = client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=world.a.h("viewer")).json()
    assert shown["source_run"]["run_key"] == "R-1"
    linked = fresh(client, world.a, run)["results"][0]["bugs"]
    assert linked == [{"id": bug["id"], "key": bug["key"]}]
    # a bug that is deleted no longer shows on the result
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert fresh(client, world.a, run)["results"][0]["bugs"] == []


def test_a_bug_cannot_point_at_a_result_of_another_project_or_workspace(client, world) -> None:
    project, _, _, _run, failed = failed_run(client, world.a)
    other_project = make_project(client, world.a, "API")
    _, _, _, _b_run, b_failed = failed_run(client, world.b)
    h = world.a.h("qa_engineer")
    for project_id, source in ((other_project["id"], failed["id"]), (project["id"], b_failed["id"]), (project["id"], str(uuid.uuid4()))):
        r = client.post(f"{O}/{world.a.org.id}/bugs", headers=h,
                        json={"project_id": project_id, "title": "A bug with a source", "source_run_result_id": source})
        assert r.status_code == 422, (project_id, source)
    assert make_bug(client, world.a, project)["source_run"] is None


# The pure rules -------------------------------------------------------------------------

def test_pass_rate_counts_pass_over_pass_fail_and_blocked_and_rounds_halves_up() -> None:
    assert pass_rate({}) is None and pass_rate({"skipped": 3, "untested": 2}) is None
    assert pass_rate({"pass": 1, "fail": 1}) == 50 and pass_rate({"pass": 1, "fail": 1, "blocked": 1, "skipped": 9}) == 33
    assert pass_rate({"pass": 1, "fail": 7}) == 13 and pass_rate({"pass": 2, "fail": 6}) == 25 and pass_rate({"pass": 5}) == 100


def test_the_draft_title_is_cut_to_200_characters() -> None:
    assert draft_title("A" * 300, 2) == "A" * (200 - len(" fails at step 3")) + " fails at step 3"
    assert len(draft_title("A" * 300, None)) == 200 and draft_title("Short title", 0) == "Short title fails at step 1"
