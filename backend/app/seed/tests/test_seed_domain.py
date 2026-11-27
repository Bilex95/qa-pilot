"""The seeded projects, bugs, tests and releases (I-12, REQ-060, D-066): amounts, every status and severity, the acceptance examples
(WEB 2.4.0 Blocked with two reasons, bugs past their SLA), the timeline, tenant isolation and reset."""

from datetime import datetime

import pytest
from sqlalchemy import func, select

from app.modules.bugs.infrastructure.models import Bug, BugActivity
from app.modules.projects.infrastructure.models import Project
from app.seed.__main__ import counts, reset, seed
from app.seed.domain_data import DATA, SLA_PAST, Totals, totals_for
from app.seed.scenarios import HARBOR, LUMEN, SCENARIOS, TENANT_A, TENANT_B
from app.seed.tests.test_seed import PW

API = "/api/v1/orgs"


def sign_in(client, email: str) -> dict[str, str]:  # type: ignore[no-untyped-def]
    r = client.post("/api/v1/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def get(client, path: str, headers: dict[str, str], **params):  # type: ignore[no-untyped-def]
    r = client.get(f"{API}/{path}", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def all_bugs(client, org, headers, **params):  # type: ignore[no-untyped-def]
    return get(client, f"{org.id}/bugs", headers, page_size=100, **params)["items"]


def test_the_planned_amounts_are_in_the_data() -> None:
    assert totals_for("baseline") == Totals(projects=4, bugs=68, suites=5, cases=44, runs=6, releases=4)
    lumen = totals_for("baseline").as_dict()
    assert lumen["bugs"] == 60 + 8
    assert totals_for("empty") == Totals()
    assert totals_for("multi-tenant") == Totals(2, 16, 2, 8, 2, 2)
    assert set(DATA) == set(SCENARIOS)


@pytest.mark.parametrize("scenario", ["baseline", "sla-breach", "release-blocked", "multi-tenant"])
def test_seeding_twice_adds_nothing_and_matches_the_data(db, scenario) -> None:
    seed(db, scenario, PW)
    first = counts(db, scenario)
    bugs = db.scalar(select(func.count()).select_from(Bug))
    seed(db, scenario, PW)
    assert counts(db, scenario) == first
    assert db.scalar(select(func.count()).select_from(Bug)) == bugs
    for name in ("projects", "bugs", "suites", "cases", "runs", "releases"):
        assert first[name] == totals_for(scenario).as_dict()[name]


def test_lumen_has_every_status_and_severity_and_the_three_readiness_levels(client, db) -> None:
    seed(db, "baseline", PW)
    h = sign_in(client, "lukas@lumenfreight.test")
    bugs = all_bugs(client, LUMEN, h)
    assert len(bugs) == 60
    assert {b["status"] for b in bugs} == {"new", "triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed", "reopened",
                                           "wont_fix"}
    assert {b["severity"] for b in bugs} == {"critical", "high", "medium", "low"}
    assert {b["key"].split("-")[0] for b in bugs} == {"WEB", "API", "MOB"}
    releases = get(client, f"{LUMEN.id}/releases", h, page_size=100)["items"]
    assert {r["name"]: r["readiness"] for r in releases} == {"WEB 2.4.0": "blocked", "API 1.9.0": "at_risk", "MOB 3.1.0": "ready"}
    ready = next(r for r in releases if r["name"] == "MOB 3.1.0")
    assert ready["pass_rate"] == 100 and ready["reasons"] == ["No open Critical or High bugs, pass rate 100%"]


def test_baseline_dashboard_and_reports_have_something_to_show(client, db) -> None:
    seed(db, "baseline", PW)
    h = sign_in(client, "lukas@lumenfreight.test")
    dash = get(client, f"{LUMEN.id}/dashboard", h)
    assert dash["has_data"] and dash["open_total"] > 0 and dash["finished_total"] > 0
    assert dash["open_by_severity"]["critical"] > 0 and dash["sla_breached"] > 0 and dash["pass_rate"]["last_7_days"] is not None
    assert sum(p["closed"] for p in dash["trend"]) > 0 and sum(p["opened"] for p in dash["trend"]) > 0
    assert {r["readiness"] for r in dash["releases"]} == {"blocked", "at_risk", "ready"}
    other = get(client, f"{HARBOR.id}/dashboard", sign_in(client, "grace@harborclinics.test"))
    assert other["has_data"] and other["open_total"] < dash["open_total"]


def test_a_seeded_bug_has_a_real_timeline_in_order(client, db) -> None:
    seed(db, "baseline", PW)
    h = sign_in(client, "lukas@lumenfreight.test")
    closed = next(b for b in all_bugs(client, LUMEN, h, status="closed"))
    detail = get(client, f"{LUMEN.id}/bugs/{closed['id']}", h)
    trail = get(client, f"{LUMEN.id}/bugs/{closed['id']}/activity", h, page_size=100)["items"]
    oldest_first = list(reversed(trail))
    assert oldest_first[0]["kind"] == "created"
    moves = [e["new_value"] for e in oldest_first if e["kind"] == "status_changed"]
    assert moves == ["triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed"]
    stamps = [datetime.fromisoformat(e["created_at"]) for e in oldest_first]  # moments, not strings (BL-041)
    assert stamps == sorted(stamps) and stamps[0] == datetime.fromisoformat(detail["created_at"])
    assert stamps[-1] <= datetime.fromisoformat(detail["updated_at"])
    assert detail["resolved_at"] is not None and detail["closed_at"] is not None
    assert detail["created_at"] < detail["resolved_at"] < detail["closed_at"]


def test_the_sla_scenario_has_exactly_the_bugs_past_their_sla(client, db) -> None:
    seed(db, "sla-breach", PW)
    h = sign_in(client, "lukas@lumenfreight.test")
    everything = all_bugs(client, LUMEN, h)
    breached = all_bugs(client, LUMEN, h, sla_breached="true")
    assert len(everything) == 7
    assert sorted(b["title"] for b in breached) == sorted(DATA["sla-breach"]["lumen"].projects[0].bugs[i].title for i in SLA_PAST)
    assert all(b["sla_breached"] for b in breached) and not any(b["sla_breached"] for b in everything if b not in breached)


def test_the_blocked_release_has_its_two_reasons(client, db) -> None:
    seed(db, "release-blocked", PW)
    h = sign_in(client, "lukas@lumenfreight.test")
    releases = get(client, f"{LUMEN.id}/releases", h)["items"]
    assert [r["name"] for r in releases] == ["WEB 2.4.0"]
    rel = get(client, f"{LUMEN.id}/releases/{releases[0]['id']}", h)
    assert rel["readiness"] == "blocked" and rel["pass_rate"] == 63
    assert rel["reasons"][0] == "2 open Critical bugs" and "pass rate" in rel["reasons"][1].lower()
    assert len(rel["bugs"]) == 4 and len(rel["runs"]) == 1


def test_the_two_tenants_have_the_same_data_and_cannot_see_each_other(client, db) -> None:
    seed(db, "multi-tenant", PW)
    ha = sign_in(client, "qa.lead@tenant-a.test")
    hb = sign_in(client, "qa.lead@tenant-b.test")
    bugs_a, bugs_b = all_bugs(client, TENANT_A, ha), all_bugs(client, TENANT_B, hb)
    assert len(bugs_a) == len(bugs_b) == 8
    assert not {b["id"] for b in bugs_a} & {b["id"] for b in bugs_b}
    r = client.get(f"{API}/{TENANT_A.id}/bugs/{bugs_b[0]['id']}", headers=ha)
    assert r.status_code == 404
    r = client.get(f"{API}/{TENANT_B.id}/bugs/{bugs_a[0]['id']}", headers=ha)
    assert r.status_code in (403, 404)


def test_reset_removes_the_seeded_projects_and_bugs(db) -> None:
    seed(db, "multi-tenant", PW)
    assert db.scalar(select(func.count()).select_from(Project)) == 2
    reset(db)
    assert db.scalar(select(func.count()).select_from(Project)) == 0
    assert db.scalar(select(func.count()).select_from(Bug)) == 0
    assert db.scalar(select(func.count()).select_from(BugActivity)) == 0
    assert counts(db, "multi-tenant") == dict.fromkeys(counts(db, "multi-tenant"), 0)
