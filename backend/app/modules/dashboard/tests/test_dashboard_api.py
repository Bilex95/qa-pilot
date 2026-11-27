"""API-130 to API-133 (I-09): the figures of the dashboard and the reports against bugs, runs and releases made through the API,
the 366 day limit, the empty workspace, project filters, other workspaces never counted, and the CSV export with formula escaping.
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import csv
import io
from datetime import date, timedelta

import pytest
from sqlalchemy import update

from app.core.db import utcnow
from app.modules.bugs.tests.test_bugs_api import ALL_ROLES, code, make_bug, make_project, set_bug
from app.modules.releases.tests.test_releases_api import make_release
from app.modules.testing.infrastructure.models import TestRun
from app.modules.testing.tests.test_runs_api import make_run, mark
from app.modules.testing.tests.test_runs_api import setup as run_setup

O = "/api/v1/orgs"


def get(client, tenant, path, role="viewer", **params):  # type: ignore[no-untyped-def]
    return client.get(f"{O}/{tenant.org.id}{path}", params=params, headers=tenant.h(role))


def checkout(client, world, project):  # type: ignore[no-untyped-def]
    url = f"{O}/{world.a.org.id}/projects/{project['id']}/components"
    return client.post(url, json={"name": "Checkout"}, headers=world.a.h("qa_lead")).json()


def finish(client, tenant, bug, role="qa_lead"):  # type: ignore[no-untyped-def]
    for step in ("triaged", "in_progress", "fixed", "ready_for_retest", "verified"):
        r = client.post(f"{O}/{tenant.org.id}/bugs/{bug['id']}/transitions", json={"to_status": step}, headers=tenant.h(role))
        assert r.status_code == 200, r.text


# API-130 dashboard -------------------------------------------------------------------------------

def test_an_empty_workspace_has_no_data_and_every_figure_is_zero(client, world) -> None:
    d = get(client, world.a, "/dashboard").json()
    assert d["has_data"] is False and d["open_total"] == 0 and d["finished_total"] == 0 and d["sla_breached"] == 0
    assert d["open_by_severity"] == {"critical": 0, "high": 0, "medium": 0, "low": 0}
    assert len(d["trend"]) == 30 and all(p["opened"] == 0 and p["closed"] == 0 for p in d["trend"])
    assert d["pass_rate"] == {"last_7_days": None, "runs": 0} and d["top_components"] == [] and d["releases"] == []
    assert d["my_assigned_count"] == 0


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_reads_the_dashboard(client, world, role) -> None:
    assert get(client, world.a, "/dashboard", role=role).status_code == 200


def test_the_headline_numbers_follow_the_bugs(client, db, world) -> None:
    project = make_project(client, world.a)
    comp = checkout(client, world, project)
    crit =make_bug(client, world.a, project, role="qa_lead", title="Critical checkout bug", severity="critical", component_id=comp["id"])
    make_bug(client, world.a, project, role="qa_lead", title="High bug in checkout", severity="high", component_id=comp["id"],
             assignee_id=str(world.a.users["developer"].id))
    make_bug(client, world.a, project, role="qa_lead", title="Medium bug somewhere", severity="medium")
    done = make_bug(client, world.a, project, role="qa_lead", title="A bug that is finished", severity="low")
    finish(client, world.a, done)
    set_bug(db, crit, created_at=utcnow() - timedelta(days=3))  # a Critical bug is past its 24 hour SLA after three days
    d = get(client, world.a, "/dashboard").json()
    assert d["has_data"] is True and d["open_total"] == 3 and d["finished_total"] == 1
    assert d["open_by_severity"] == {"critical": 1, "high": 1, "medium": 1, "low": 0}
    assert d["critical_untriaged"] == 1 and d["sla_breached"] == 1
    assert d["top_components"] == [{"name": "Checkout", "open": 2}, {"name": "No component", "open": 1}]
    assert get(client, world.a, "/dashboard", role="developer").json()["my_assigned_count"] == 1
    assert d["my_assigned_count"] == 0  # the viewer has none
    only = get(client, world.a, "/dashboard", project_id=make_project(client, world.a, "API")["id"]).json()
    assert only["open_total"] == 0 and only["has_data"] is False


def test_other_workspaces_are_never_counted(client, world) -> None:
    make_bug(client, world.b, make_project(client, world.b), role="qa_lead", title="Only in workspace B", severity="critical")
    d = get(client, world.a, "/dashboard").json()
    assert d["open_total"] == 0 and d["open_by_severity"]["critical"] == 0
    foreign_project = make_project(client, world.b, "ZZZ")
    assert get(client, world.a, "/dashboard", project_id=foreign_project["id"]).json()["open_total"] == 0


def test_the_trend_counts_bugs_opened_and_moves_to_finished_per_day(client, db, world) -> None:
    project = make_project(client, world.a)
    old = make_bug(client, world.a, project, role="qa_lead", title="Opened ten days ago")
    set_bug(db, old, created_at=utcnow() - timedelta(days=10))
    today = make_bug(client, world.a, project, role="qa_lead", title="Opened today")
    finish(client, world.a, today)
    d = get(client, world.a, "/dashboard").json()
    first, last = d["trend"][0], d["trend"][-1]
    assert last["date"] == str(utcnow().date()) and last["opened"] == 1 and last["closed"] == 1
    assert d["trend"][-11]["opened"] == 1 and sum(p["opened"] for p in d["trend"]) == 2 and first["opened"] == 0


def test_the_pass_rate_of_the_last_seven_days_and_the_release_readiness(client, db, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    for n, result in enumerate(["pass", "pass", "fail"]):
        mark(client, world.a, run, n, result, **({"failed_step_index": 0} if result == "fail" else {}))
    release = make_release(client, world.a, project)
    client.post(f"{O}/{world.a.org.id}/releases/{release['id']}/runs", json={"run_ids": [run["id"]]}, headers=world.a.h("qa_lead"))
    d = get(client, world.a, "/dashboard").json()
    assert d["pass_rate"] == {"last_7_days": 67, "runs": 1}
    assert [(r["name"], r["readiness"]) for r in d["releases"]] == [("WEB 2.4.0", "blocked")]
    assert d["releases"][0]["reasons"][0] == "Pass rate 67% is below 80%"
    client.patch(f"{O}/{world.a.org.id}/releases/{release['id']}", json={"status": "released"}, headers=world.a.h("qa_lead"))
    assert get(client, world.a, "/dashboard").json()["releases"] == []  # a released release is not shown
    db.execute(update(TestRun).values(started_at=utcnow() - timedelta(days=9)))  # outside the seven days
    assert get(client, world.a, "/dashboard").json()["pass_rate"] == {"last_7_days": None, "runs": 0}


# API-131 bug trend --------------------------------------------------------------------------------

def test_the_bug_trend_gives_one_point_per_day_with_the_number_open(client, db, world) -> None:
    project = make_project(client, world.a)
    older = make_bug(client, world.a, project, role="qa_lead", title="Opened long ago")
    set_bug(db, older, created_at=utcnow() - timedelta(days=40))
    recent = make_bug(client, world.a, project, role="qa_lead", title="Opened two days ago")
    set_bug(db, recent, created_at=utcnow() - timedelta(days=2))
    finish(client, world.a, recent)  # finished today
    points = get(client, world.a, "/reports/bug-trend").json()
    assert len(points) == 30 and points[-1]["date"] == str(utcnow().date())
    assert points[0]["open_total"] == 1  # the old bug is open at the start of the window
    by_day = {p["date"]: p for p in points}
    two_days_ago = by_day[str(utcnow().date() - timedelta(days=2))]
    assert two_days_ago["opened"] == 1 and two_days_ago["open_total"] == 2
    assert points[-1]["closed"] == 1 and points[-1]["open_total"] == 1


def test_a_reopened_bug_counts_as_open_again(client, db, world) -> None:
    project = make_project(client, world.a)
    bug = make_bug(client, world.a, project, role="qa_lead", title="Comes back")
    finish(client, world.a, bug)
    assert get(client, world.a, "/reports/bug-trend").json()[-1]["open_total"] == 0
    client.post(f"{O}/{world.a.org.id}/bugs/{bug['id']}/transitions", json={"to_status": "reopened"}, headers=world.a.h("qa_lead"))
    assert get(client, world.a, "/reports/bug-trend").json()[-1]["open_total"] == 1


def test_weekly_buckets_start_on_monday_and_add_up(client, db, world) -> None:
    project = make_project(client, world.a)
    for days in (1, 2, 9):
        bug = make_bug(client, world.a, project, role="qa_lead", title=f"Opened {days} days ago")
        set_bug(db, bug, created_at=utcnow() - timedelta(days=days))
    end = utcnow().date()
    weeks = get(client, world.a, "/reports/bug-trend", interval="week", **{"from": str(end - timedelta(days=27)), "to": str(end)}).json()
    assert all(date.fromisoformat(w["date"]).weekday() == 0 for w in weeks)
    assert sum(w["opened"] for w in weeks) == 3 and weeks[-1]["open_total"] == 3


def test_the_range_is_checked(client, world) -> None:
    end = utcnow().date()
    ok = get(client, world.a, "/reports/bug-trend", **{"from": str(end - timedelta(days=365)), "to": str(end)})
    assert ok.status_code == 200 and len(ok.json()) == 366
    for params in ({"from": str(end - timedelta(days=366)), "to": str(end)}, {"from": str(end), "to": str(end - timedelta(days=1))},
                   {"from": "yesterday"}, {"interval": "month"}):
        r = get(client, world.a, "/reports/bug-trend", **params)
        assert r.status_code == 422 and code(r) == "validation_error", params
    assert get(client, world.a, "/reports/summary", **{"from": str(end - timedelta(days=400)), "to": str(end)}).status_code == 422


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_reads_the_reports(client, world, role) -> None:
    assert get(client, world.a, "/reports/bug-trend", role=role).status_code == 200
    assert get(client, world.a, "/reports/summary", role=role).status_code == 200


# API-132 summary -----------------------------------------------------------------------------------

def test_the_summary_breaks_the_bugs_down_and_always_lists_unassigned(client, db, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    dev = str(world.a.users["developer"].id)
    one = make_bug(client, world.a, project, role="qa_lead", title="Critical and assigned", severity="critical", assignee_id=dev)
    make_bug(client, world.a, project, role="qa_lead", title="Medium and nobody has it", severity="medium")
    gone = make_bug(client, world.a, project, role="qa_lead", title="A deleted bug is not counted", severity="high")
    client.delete(f"{O}/{world.a.org.id}/bugs/{gone['id']}", headers=world.a.h("qa_lead"))
    set_bug(db, one, created_at=utcnow() - timedelta(days=5))
    run = make_run(client, world.a, project, suite)
    mark(client, world.a, run, 0, "pass")
    s = get(client, world.a, "/reports/summary").json()
    assert s["total"] == 2 and [x["status"] for x in s["by_status"]][:3] == ["new", "triaged", "in_progress"] and len(s["by_status"]) == 9
    assert {x["status"]: x["count"] for x in s["by_status"]}["new"] == 2
    assert [(x["severity"], x["count"]) for x in s["by_severity"]] == [("critical", 1), ("high", 0), ("medium", 1), ("low", 0)]
    assert s["by_component"] == [{"name": "No component", "count": 2}]
    rows = {r["name"]: r for r in s["by_assignee"]}
    assert rows["developer a"]["open"] == 1 and rows["developer a"]["critical"] == 1 and rows["developer a"]["sla_breached"] == 1
    assert rows["Unassigned"]["user_id"] is None and rows["Unassigned"]["open"] == 1 and s["by_assignee"][-1]["name"] == "Unassigned"
    assert s["run_pass_rate"] == [{"key": "R-1", "name": "WEB 2.4.0 regression", "pass_rate": 100}]
    end = utcnow().date()
    narrow = get(client, world.a, "/reports/summary", **{"from": str(end - timedelta(days=1)), "to": str(end)}).json()
    assert narrow["total"] == 1  # the bug of five days ago is outside the range


def test_the_summary_of_an_empty_range_still_lists_every_status_and_severity(client, world) -> None:
    s = get(client, world.a, "/reports/summary").json()
    assert s["total"] == 0 and len(s["by_status"]) == 9 and len(s["by_severity"]) == 4 and s["by_component"] == []
    assert s["by_assignee"] == [{"user_id": None, "name": "Unassigned", "open": 0, "critical": 0, "sla_breached": 0}]


# API-133 CSV ----------------------------------------------------------------------------------------

def rows_of(response):  # type: ignore[no-untyped-def]
    return list(csv.reader(io.StringIO(response.text)))


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_exports_the_bugs_as_csv(client, world, role) -> None:
    project = make_project(client, world.a)
    make_bug(client, world.a, project, role="qa_lead", title="First exported bug")
    r = get(client, world.a, "/reports/bugs.csv", role=role)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"] == 'attachment; filename="bugs.csv"' and r.headers["cache-control"] == "private, no-store"
    table = rows_of(r)
    assert table[0] == ["Key", "Title", "Status", "Severity", "Priority", "Component", "Environment", "Assignee", "Reporter", "Release",
                        "Created", "Updated"]
    assert table[1][:5] == ["WEB-1", "First exported bug", "new", "medium", "p3"] and len(table) == 2


def test_a_cell_that_starts_like_a_formula_is_quoted_and_awkward_text_survives(client, world) -> None:
    project = make_project(client, world.a)
    titles = ["=SUM(A1:A9) is not a formula here", '+cmd|" /C calc"!A0', "-2+3 looks like one", "@SUM(1) too",
              'A title, with "quotes"\nand a line break']
    for title in titles:
        make_bug(client, world.a, project, role="qa_lead", title=title)
    table = rows_of(get(client, world.a, "/reports/bugs.csv", sort="created_at"))
    assert [row[1] for row in table[1:]] == ["'" + t if t[0] in "=+-@" else t for t in titles]


def test_the_csv_uses_the_list_filters_and_names_people_components_and_releases(client, world) -> None:
    project = make_project(client, world.a)
    comp = checkout(client, world, project)
    release =make_release(client, world.a, project)
    make_bug(client, world.a, project, role="qa_lead", title="High and assigned", severity="high", component_id=comp["id"],
             assignee_id=str(world.a.users["developer"].id), release_id=release["id"])
    make_bug(client, world.a, project, role="qa_lead", title="Low one", severity="low")
    table = rows_of(get(client, world.a, "/reports/bugs.csv", severity="high"))
    assert len(table) == 2 and table[1][1] == "High and assigned"
    assert table[1][5] == "Checkout" and table[1][7] == "developer a" and table[1][8] == "qa_lead a" and table[1][9] == "WEB 2.4.0"
    assert len(rows_of(get(client, world.a, "/reports/bugs.csv", q="Low"))) == 2
    assert len(rows_of(get(client, world.a, "/reports/bugs.csv"))) == 3


def test_the_csv_rejects_bad_filters_and_never_includes_other_workspaces(client, world) -> None:
    make_bug(client, world.b, make_project(client, world.b), role="qa_lead", title="Only in workspace B")
    assert get(client, world.a, "/reports/bugs.csv", status="bogus").status_code == 422
    assert get(client, world.a, "/reports/bugs.csv", sort="title").status_code == 422
    assert len(rows_of(get(client, world.a, "/reports/bugs.csv"))) == 1  # the header only


def test_deleted_bugs_are_not_exported(client, world) -> None:
    project = make_project(client, world.a)
    bug = make_bug(client, world.a, project, role="qa_lead", title="Soon gone")
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert len(rows_of(get(client, world.a, "/reports/bugs.csv"))) == 1
