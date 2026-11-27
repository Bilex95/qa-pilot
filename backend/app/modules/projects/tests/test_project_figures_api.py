"""The figures other modules own on API-040 and API-042 (I-13): open and Critical bugs, the pass rate of the newest run and of all runs,
the suite count and the next release with its readiness. Real bugs, runs and releases feed them; nothing leaks between workspaces."""

from app.modules.bugs.tests.test_bugs_api import make_bug, make_project
from app.modules.releases.tests.test_releases_api import make_release
from app.modules.testing.tests.test_runs_api import make_run, mark, run_url
from app.modules.testing.tests.test_runs_api import setup as run_setup

O = "/api/v1/orgs"


def listed(client, tenant, project, role="viewer"):  # type: ignore[no-untyped-def]
    r = client.get(f"{O}/{tenant.org.id}/projects", headers=tenant.h(role))
    assert r.status_code == 200, r.text
    return next(p for p in r.json()["items"] if p["id"] == project["id"])


def detail(client, tenant, project, role="viewer"):  # type: ignore[no-untyped-def]
    r = client.get(f"{O}/{tenant.org.id}/projects/{project['id']}", headers=tenant.h(role))
    assert r.status_code == 200, r.text
    return r.json()


def test_a_new_project_has_empty_figures(client, world) -> None:
    project = make_project(client, world.a)
    got = listed(client, world.a, project)
    assert (got["open_bug_count"], got["critical_bug_count"], got["suite_count"]) == (0, 0, 0)
    assert got["last_run_pass_rate"] is None and got["pass_rate"] is None and got["next_release"] is None


def test_the_figures_follow_the_bugs_runs_and_releases(client, world) -> None:
    project, suite, _ = run_setup(client, world.a, cases=3)
    h = world.a.h("qa_lead")
    make_bug(client, world.a, project, role="qa_lead", title="A critical bug in checkout", severity="critical")
    make_bug(client, world.a, project, role="qa_lead", title="A high bug in checkout", severity="high")
    done = make_bug(client, world.a, project, role="qa_lead", title="A critical bug that is verified", severity="critical")
    for step in ("triaged", "in_progress", "fixed", "ready_for_retest", "verified"):
        client.post(f"{O}/{world.a.org.id}/bugs/{done['id']}/transitions", json={"to_status": step}, headers=h)
    run = make_run(client, world.a, project, suite)
    for n, result in enumerate(["pass", "pass", "fail"]):
        mark(client, world.a, run, n, result, **({"failed_step_index": 0} if result == "fail" else {}))
    make_release(client, world.a, project, name="WEB 2.4.0")
    for got in (listed(client, world.a, project), detail(client, world.a, project)):
        assert got["open_bug_count"] == 2 and got["critical_bug_count"] == 1  # a verified bug is not open
        assert got["suite_count"] == 1 and got["last_run_pass_rate"] == 67 and got["pass_rate"] == 67
        assert got["next_release"]["name"] == "WEB 2.4.0" and got["next_release"]["readiness"] == "at_risk"  # no runs linked, a High bug


def test_the_newest_run_gives_the_last_run_rate_and_all_runs_give_the_overall_rate(client, world) -> None:
    project, suite, _ = run_setup(client, world.a, cases=3)
    first = make_run(client, world.a, project, suite, name="First run")
    for n, result in enumerate(["pass", "pass", "fail"]):
        mark(client, world.a, first, n, result, **({"failed_step_index": 0} if result == "fail" else {}))
    client.patch(run_url(world.a, first), json={"status": "completed"}, headers=world.a.h("qa_lead"))
    second = make_run(client, world.a, project, suite, name="Second run")
    for n in range(3):
        mark(client, world.a, second, n, "pass")
    got = listed(client, world.a, project)
    assert got["last_run_pass_rate"] == 100 and got["pass_rate"] == 83  # 5 of 6 results passed


def test_a_released_release_is_not_the_next_release_and_the_soonest_one_is(client, world) -> None:
    project = make_project(client, world.a)
    h = world.a.h("qa_lead")
    later = make_release(client, world.a, project, name="WEB 3.0.0", target_date="2027-06-01")
    soon = make_release(client, world.a, project, name="WEB 2.5.0", target_date="2027-01-15")
    assert listed(client, world.a, project)["next_release"]["name"] == "WEB 2.5.0"
    client.patch(f"{O}/{world.a.org.id}/releases/{soon['id']}", json={"status": "released"}, headers=h)
    assert listed(client, world.a, project)["next_release"]["name"] == "WEB 3.0.0"
    client.patch(f"{O}/{world.a.org.id}/releases/{later['id']}", json={"status": "released"}, headers=h)
    assert listed(client, world.a, project)["next_release"] is None


def test_the_figures_of_one_workspace_never_show_in_another(client, world) -> None:
    project, _suite, _ = run_setup(client, world.a, cases=1)
    make_bug(client, world.a, project, role="qa_lead", title="A critical bug in checkout", severity="critical")
    make_release(client, world.a, project)
    mine = client.get(f"{O}/{world.b.org.id}/projects", headers=world.b.h("viewer")).json()
    assert mine["items"] == [] and mine["total"] == 0
    other = client.get(f"{O}/{world.b.org.id}/projects/{project['id']}", headers=world.b.h("viewer"))
    assert other.status_code == 404
