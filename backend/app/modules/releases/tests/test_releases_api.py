"""API-110 to API-119 (I-08): happy, invalid, forbidden and cross tenant for every release endpoint, plus the rules on top (forward only
status, released releases stay, deleting unlinks, links stay inside a project, readiness from real bugs and runs).
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.bugs.tests.test_bugs_api import make_bug, make_project
from app.modules.testing.tests.test_runs_api import make_run, mark, run_url
from app.modules.testing.tests.test_runs_api import setup as run_setup

O = "/api/v1/orgs"
LEADS = ["org_admin", "qa_lead"]
NOT_LEADS = ["qa_engineer", "developer", "viewer"]
ALL = [*LEADS, *NOT_LEADS]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def make_release(client, tenant, project, name="WEB 2.4.0", role="qa_lead", **extra):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/releases", json={"project_id": project["id"], "name": name, **extra}, headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


def url(tenant, release, tail=""):  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/releases/{release['id']}{tail}"


def fresh(client, tenant, release, role="viewer"):  # type: ignore[no-untyped-def]
    return client.get(url(tenant, release), headers=tenant.h(role)).json()


def audit(db, action):  # type: ignore[no-untyped-def]
    return list(db.scalars(select(AuditEvent).where(AuditEvent.action == action).order_by(AuditEvent.created_at)))


def severity_bug(client, tenant, project, severity, **extra):  # type: ignore[no-untyped-def]
    return make_bug(client, tenant, project, role="qa_lead", title=f"A {severity} bug in the checkout", severity=severity, **extra)


# API-111 create -------------------------------------------------------------------------------

@pytest.mark.parametrize("role", LEADS)
def test_org_admin_and_qa_lead_plan_a_release_and_it_is_audited(client, db, world, role) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project, role=role, target_date="2026-11-24", description="New checkout flow")
    assert release["name"] == "WEB 2.4.0" and release["status"] == "planned" and release["target_date"] == "2026-11-24"
    assert release["description"] == "New checkout flow" and release["released_at"] is None and release["project_id"] == project["id"]
    assert release["readiness"] == "at_risk" and release["reasons"] == ["No test runs linked"]
    assert release["open_bug_count"] == 0 and release["linked_run_count"] == 0 and release["pass_rate"] is None
    assert release["bugs"] == [] and release["runs"] == [] and release["ai_summary"] is None
    event = audit(db, "release.created")[0]
    assert event.data["name"] == "WEB 2.4.0" and event.actor_id == world.a.users[role].id and event.org_id == world.a.org.id


@pytest.mark.parametrize("role", NOT_LEADS)
def test_other_roles_cannot_plan_a_release(client, world, role) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/releases", json={"project_id": project["id"], "name": "WEB 2.4.0"}, headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"


@pytest.mark.parametrize("change", [{"name": "x"}, {"name": "x" * 61}, {"name": "   "}, {"target_date": "tomorrow"},
                                    {"description": "d" * 1001}, {"project_id": str(uuid.uuid4())}, {"extra": 1}])
def test_a_release_needs_a_name_a_real_date_and_a_project_of_this_workspace(client, world, change) -> None:
    project = make_project(client, world.a)
    body = {"project_id": project["id"], "name": "WEB 2.4.0", **change}
    r = client.post(f"{O}/{world.a.org.id}/releases", json=body, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error", r.text


def test_a_foreign_or_archived_project_is_refused(client, world) -> None:
    project = make_project(client, world.a)
    foreign = make_project(client, world.b)
    h = world.a.h("qa_lead")
    releases = f"{O}/{world.a.org.id}/releases"
    assert client.post(releases, json={"project_id": foreign["id"], "name": "Nope 1.0"}, headers=h).status_code == 422
    client.patch(f"{O}/{world.a.org.id}/projects/{project['id']}", json={"archived": True}, headers=h)
    assert client.post(releases, json={"project_id": project["id"], "name": "Late 1.0"}, headers=h).status_code == 422


def test_a_name_is_taken_per_project_not_case_sensitive(client, world) -> None:
    web = make_project(client, world.a)
    api = make_project(client, world.a, "API")
    make_release(client, world.a, web, name="Release 1.0")
    r = client.post(f"{O}/{world.a.org.id}/releases", json={"project_id": web["id"], "name": "RELEASE 1.0"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 409 and code(r) == "name_taken"
    assert make_release(client, world.a, api, name="Release 1.0")["project_id"] == api["id"]  # another project may reuse it


# API-110 list and API-112 get -------------------------------------------------------------------

def test_every_role_lists_releases_unreleased_first_by_target_date_with_readiness(client, world) -> None:
    web = make_project(client, world.a)
    api = make_project(client, world.a, "API")
    late = make_release(client, world.a, web, name="Late one", target_date="2026-12-24")
    soon = make_release(client, world.a, web, name="Soon one", target_date="2026-11-24")
    undated = make_release(client, world.a, api, name="No date")
    done = make_release(client, world.a, web, name="Shipped", target_date="2026-10-01")
    client.patch(url(world.a, done), json={"status": "released"}, headers=world.a.h("qa_lead"))
    for role in ALL:
        page = client.get(f"{O}/{world.a.org.id}/releases", headers=world.a.h(role)).json()
        assert [r["name"] for r in page["items"]] == ["Soon one", "Late one", "No date", "Shipped"] and page["total"] == 4
    only = client.get(f"{O}/{world.a.org.id}/releases", params={"project_id": api["id"]}, headers=world.a.h("viewer")).json()
    assert [r["id"] for r in only["items"]] == [undated["id"]]
    shipped = client.get(f"{O}/{world.a.org.id}/releases", params={"status": "released"}, headers=world.a.h("viewer")).json()
    assert [r["name"] for r in shipped["items"]] == ["Shipped"] and shipped["items"][0]["released_at"] is not None
    assert client.get(f"{O}/{world.a.org.id}/releases", params={"status": "later"}, headers=world.a.h("viewer")).status_code == 422
    second = client.get(f"{O}/{world.a.org.id}/releases", params={"page": 2, "page_size": 3}, headers=world.a.h("viewer")).json()
    assert [r["name"] for r in second["items"]] == ["Shipped"] and late["id"] and soon["id"]
    assert set(page["items"][0]) == {
        "id", "name", "project_id", "description", "status", "target_date", "released_at", "readiness", "reasons", "open_bug_count",
        "linked_bug_count", "linked_run_count", "pass_rate", "created_at"}


def test_a_release_is_read_with_its_bugs_and_runs_and_other_workspaces_never_see_it(client, world) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    bug = severity_bug(client, world.a, project, "high")
    client.post(url(world.a, release, "/bugs"), json={"bug_ids": [bug["id"]]}, headers=world.a.h("qa_lead"))
    shown = fresh(client, world.a, release)
    assert [b["key"] for b in shown["bugs"]] == [bug["key"]] and shown["bugs"][0]["severity"] == "high" and shown["linked_bug_count"] == 1
    assert shown["metrics"] == {"open_by_severity": {"critical": 0, "high": 1, "medium": 0, "low": 0}, "pass_rate": None,
                                "runs_in_progress": 0, "linked_runs": 0}
    foreign = client.get(url(world.b, release), headers=world.b.h("org_admin"))
    assert foreign.status_code == 404 and code(foreign) == "not_found"
    assert client.get(f"{O}/{world.b.org.id}/releases", headers=world.b.h("org_admin")).json()["total"] == 0
    assert client.get(f"{O}/{world.a.org.id}/releases/{uuid.uuid4()}", headers=world.a.h("viewer")).status_code == 404


# API-113 change ---------------------------------------------------------------------------------

@pytest.mark.parametrize("role", LEADS)
def test_a_lead_edits_the_name_description_and_date_and_clears_the_date(client, db, world, role) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project, target_date="2026-11-24")
    r = client.patch(url(world.a, release), json={"name": "WEB 2.5.0", "description": "Later", "target_date": "2026-12-01"},
                     headers=world.a.h(role))
    assert r.status_code == 200 and r.json()["name"] == "WEB 2.5.0" and r.json()["target_date"] == "2026-12-01"
    cleared = client.patch(url(world.a, release), json={"target_date": None}, headers=world.a.h(role))
    assert cleared.json()["target_date"] is None
    event = audit(db, "release.updated")[0]
    changes = event.data["changes"]
    assert changes["name"] == {"from": "WEB 2.4.0", "to": "WEB 2.5.0"} and changes["description"] == {"changed": True}


def test_the_status_only_moves_forward_and_released_sets_the_time_and_the_audit_keeps_the_readiness(client, db, world) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    severity_bug_ = severity_bug(client, world.a, project, "critical")
    client.post(url(world.a, release, "/bugs"), json={"bug_ids": [severity_bug_["id"]]}, headers=world.a.h("qa_lead"))
    h = world.a.h("qa_lead")
    started = client.patch(url(world.a, release), json={"status": "in_progress"}, headers=h)
    assert started.status_code == 200 and started.json()["status"] == "in_progress" and started.json()["released_at"] is None
    back = client.patch(url(world.a, release), json={"status": "planned"}, headers=h)
    assert back.status_code == 422 and code(back) == "validation_error"
    shipped = client.patch(url(world.a, release), json={"status": "released"}, headers=h)  # a Blocked release may be released
    assert shipped.status_code == 200 and shipped.json()["released_at"] is not None and shipped.json()["readiness"] == "blocked"
    assert client.patch(url(world.a, release), json={"status": "in_progress"}, headers=h).status_code == 422
    events = audit(db, "release.status_changed")
    assert [(e.data["from"], e.data["to"]) for e in events] == [("planned", "in_progress"), ("in_progress", "released")]
    assert events[1].data["readiness"] == "blocked" and events[1].data["reasons"][0] == "1 open Critical bug"


def test_a_lead_may_skip_in_progress(client, world) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    r = client.patch(url(world.a, release), json={"status": "released"}, headers=world.a.h("org_admin"))
    assert r.status_code == 200 and r.json()["status"] == "released"


def test_a_released_release_can_still_be_renamed_but_not_moved(client, world) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    h = world.a.h("qa_lead")
    client.patch(url(world.a, release), json={"status": "released"}, headers=h)
    assert client.patch(url(world.a, release), json={"description": "Notes after the release"}, headers=h).status_code == 200


@pytest.mark.parametrize("body", [{}, {"name": None}, {"name": "x"}, {"status": "done"}, {"status": None}, {"target_date": "soon"},
                                  {"ai_summary": "A summary"}, {"ai_usage_id": str(uuid.uuid4())}, {"unknown": 1}])
def test_a_bad_change_is_refused_and_nothing_changes(client, world, body) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    assert client.patch(url(world.a, release), json=body, headers=world.a.h("qa_lead")).status_code == 422
    assert fresh(client, world.a, release)["name"] == "WEB 2.4.0"


def test_renaming_to_a_taken_name_is_409_and_the_same_name_in_other_case_is_fine(client, world) -> None:
    project = make_project(client, world.a)
    make_release(client, world.a, project, name="Release 1.0")
    other = make_release(client, world.a, project, name="Release 2.0")
    h = world.a.h("qa_lead")
    taken = client.patch(url(world.a, other), json={"name": "release 1.0"}, headers=h)
    assert taken.status_code == 409 and code(taken) == "name_taken"
    assert client.patch(url(world.a, other), json={"name": "RELEASE 2.0"}, headers=h).status_code == 200


@pytest.mark.parametrize("role", NOT_LEADS)
def test_other_roles_cannot_change_or_delete_a_release(client, world, role) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    assert client.patch(url(world.a, release), json={"name": "Hijacked"}, headers=world.a.h(role)).status_code == 403
    assert client.delete(url(world.a, release), headers=world.a.h(role)).status_code == 403
    assert fresh(client, world.a, release)["name"] == "WEB 2.4.0"


def test_changing_a_foreign_release_is_a_404(client, world) -> None:
    release = make_release(client, world.b, make_project(client, world.b))
    r = client.patch(f"{O}/{world.a.org.id}/releases/{release['id']}", json={"name": "Hijacked"}, headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"
    assert fresh(client, world.b, release)["name"] == "WEB 2.4.0"


# API-114 delete ---------------------------------------------------------------------------------

def test_deleting_a_release_unlinks_its_bugs_and_runs_and_is_audited(client, db, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    release = make_release(client, world.a, project)
    bug = severity_bug(client, world.a, project, "low")
    run = make_run(client, world.a, project, suite)
    h = world.a.h("qa_lead")
    client.post(url(world.a, release, "/bugs"), json={"bug_ids": [bug["id"]]}, headers=h)
    client.post(url(world.a, release, "/runs"), json={"run_ids": [run["id"]]}, headers=h)
    assert client.delete(url(world.a, release), headers=h).status_code == 204
    assert client.get(url(world.a, release), headers=h).status_code == 404
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=h).json()["release_id"] is None
    assert client.get(run_url(world.a, run), headers=h).json()["release_id"] is None
    event = audit(db, "release.deleted")[0]
    assert event.data == {"name": "WEB 2.4.0", "unlinked_bugs": 1, "unlinked_runs": 1}
    assert client.delete(url(world.a, release), headers=h).status_code == 404


def test_a_released_release_cannot_be_deleted(client, world) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    h = world.a.h("org_admin")
    client.patch(url(world.a, release), json={"status": "released"}, headers=h)
    r = client.delete(url(world.a, release), headers=h)
    assert r.status_code == 409 and code(r) == "released"
    assert fresh(client, world.a, release)["status"] == "released"


def test_deleting_a_foreign_release_is_a_404_and_changes_nothing(client, world) -> None:
    release = make_release(client, world.b, make_project(client, world.b))
    assert client.delete(f"{O}/{world.a.org.id}/releases/{release['id']}", headers=world.a.h("org_admin")).status_code == 404
    assert fresh(client, world.b, release)["status"] == "planned"


# API-115 readiness from real bugs and runs ---------------------------------------------------------

def test_readiness_is_computed_from_the_linked_bugs_and_runs(client, world) -> None:
    project, suite, _ = run_setup(client, world.a, cases=3)
    release = make_release(client, world.a, project)
    h = world.a.h("qa_lead")
    ready = client.get(url(world.a, release, "/readiness"), headers=world.a.h("viewer")).json()
    assert ready["status"] == "at_risk" and ready["reasons"] == ["No test runs linked"]
    run = make_run(client, world.a, project, suite)
    client.post(url(world.a, release, "/runs"), json={"run_ids": [run["id"]]}, headers=h)
    for n, result in enumerate(["pass", "pass", "fail"]):
        mark(client, world.a, run, n, result, **({"failed_step_index": 0} if result == "fail" else {}))
    now = client.get(url(world.a, release, "/readiness"), headers=h).json()
    assert now["status"] == "blocked" and now["reasons"] == ["Pass rate 67% is below 80%", "1 run still in progress"]
    assert now["metrics"] == {"open_by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0}, "pass_rate": 67,
                              "runs_in_progress": 1, "linked_runs": 1}
    mark(client, world.a, run, 2, "pass")
    client.patch(run_url(world.a, run), json={"status": "completed"}, headers=h)
    assert client.get(url(world.a, release, "/readiness"), headers=h).json()["status"] == "ready"
    critical = severity_bug(client, world.a, project, "critical")
    high = severity_bug(client, world.a, project, "high")
    client.post(url(world.a, release, "/bugs"), json={"bug_ids": [critical["id"], high["id"]]}, headers=h)
    blocked = client.get(url(world.a, release, "/readiness"), headers=h).json()
    assert blocked["status"] == "blocked" and blocked["reasons"] == ["1 open Critical bug", "1 open High bug"]
    assert blocked["metrics"]["open_by_severity"]["critical"] == 1
    for step in ("triaged", "in_progress", "fixed", "ready_for_retest", "verified"):
        client.post(f"{O}/{world.a.org.id}/bugs/{critical['id']}/transitions", json={"to_status": step}, headers=h)
    after = client.get(url(world.a, release, "/readiness"), headers=h).json()
    assert after["status"] == "at_risk" and after["reasons"] == ["1 open High bug"]  # a verified bug no longer counts
    client.delete(f"{O}/{world.a.org.id}/bugs/{high['id']}", headers=h)  # a deleted bug does not count either
    assert client.get(url(world.a, release, "/readiness"), headers=h).json()["status"] == "ready"
    assert fresh(client, world.a, release)["linked_bug_count"] == 1


def test_readiness_of_a_foreign_release_is_a_404(client, world) -> None:
    release = make_release(client, world.b, make_project(client, world.b))
    assert client.get(f"{O}/{world.a.org.id}/releases/{release['id']}/readiness", headers=world.a.h("org_admin")).status_code == 404


# API-116 and API-117 bugs ----------------------------------------------------------------------

@pytest.mark.parametrize("role", LEADS)
def test_a_lead_links_bugs_and_it_shows_on_the_bug_and_its_timeline(client, world, role) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    one, two = severity_bug(client, world.a, project, "high"), severity_bug(client, world.a, project, "low")
    r = client.post(url(world.a, release, "/bugs"), json={"bug_ids": [one["id"], two["id"], one["id"]]}, headers=world.a.h(role))
    assert r.status_code == 200 and r.json() == {"linked": 2}
    again = client.post(url(world.a, release, "/bugs"), json={"bug_ids": [one["id"]]}, headers=world.a.h(role))
    assert again.json() == {"linked": 0}  # already linked: nothing changes
    shown = client.get(f"{O}/{world.a.org.id}/bugs/{one['key']}", headers=world.a.h("viewer")).json()
    assert shown["release_id"] == release["id"] and shown["release_name"] == "WEB 2.4.0"
    trail = client.get(f"{O}/{world.a.org.id}/bugs/{one['id']}/activity", headers=world.a.h("viewer")).json()["items"][0]
    assert (trail["kind"], trail["field"], trail["old_value"], trail["new_value"]) == ("linked_release", "release", None, "WEB 2.4.0")
    assert [b["key"] for b in fresh(client, world.a, release)["bugs"]] == [one["key"], two["key"]]  # by severity


def test_linking_is_all_or_nothing_and_stays_inside_the_project(client, world) -> None:
    web = make_project(client, world.a)
    api = make_project(client, world.a, "API")
    release = make_release(client, world.a, web)
    mine = severity_bug(client, world.a, web, "high")
    other_project = severity_bug(client, world.a, api, "high")
    foreign = severity_bug(client, world.b, make_project(client, world.b), "high")
    h = world.a.h("qa_lead")
    for ids in ([mine["id"], other_project["id"]], [mine["id"], foreign["id"]], [mine["id"], str(uuid.uuid4())]):
        r = client.post(url(world.a, release, "/bugs"), json={"bug_ids": ids}, headers=h)
        assert r.status_code == 422 and code(r) == "validation_error", ids
    assert fresh(client, world.a, release)["linked_bug_count"] == 0  # not even the good one was linked
    for body in ({"bug_ids": []}, {"bug_ids": [str(uuid.uuid4())] * 101}, {}):
        assert client.post(url(world.a, release, "/bugs"), json=body, headers=h).status_code == 422


def test_a_bug_in_another_release_moves_to_the_new_one(client, world) -> None:
    project = make_project(client, world.a)
    first = make_release(client, world.a, project, name="Release 1.0")
    second = make_release(client, world.a, project, name="Release 2.0")
    bug = severity_bug(client, world.a, project, "medium")
    h = world.a.h("qa_lead")
    client.post(url(world.a, first, "/bugs"), json={"bug_ids": [bug["id"]]}, headers=h)
    client.post(url(world.a, second, "/bugs"), json={"bug_ids": [bug["id"]]}, headers=h)
    assert fresh(client, world.a, first)["bugs"] == [] and len(fresh(client, world.a, second)["bugs"]) == 1
    trail = client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}/activity", headers=h).json()["items"][0]
    assert (trail["old_value"], trail["new_value"]) == ("Release 1.0", "Release 2.0")


@pytest.mark.parametrize("role", NOT_LEADS)
def test_other_roles_cannot_link_or_unlink(client, world, role) -> None:
    project, suite, _ = run_setup(client, world.a)
    release = make_release(client, world.a, project)
    bug = severity_bug(client, world.a, project, "low")
    run = make_run(client, world.a, project, suite)
    h = world.a.h(role)
    assert client.post(url(world.a, release, "/bugs"), json={"bug_ids": [bug["id"]]}, headers=h).status_code == 403
    assert client.post(url(world.a, release, "/runs"), json={"run_ids": [run["id"]]}, headers=h).status_code == 403
    assert client.delete(url(world.a, release, f"/bugs/{bug['id']}"), headers=h).status_code == 403
    assert client.delete(url(world.a, release, f"/runs/{run['id']}"), headers=h).status_code == 403


def test_unlinking_a_bug_clears_the_link_and_is_safe_to_repeat(client, world) -> None:
    project = make_project(client, world.a)
    release = make_release(client, world.a, project)
    other = make_release(client, world.a, project, name="Release 2.0")
    bug = severity_bug(client, world.a, project, "high")
    h = world.a.h("qa_lead")
    client.post(url(world.a, release, "/bugs"), json={"bug_ids": [bug["id"]]}, headers=h)
    assert client.delete(url(world.a, other, f"/bugs/{bug['id']}"), headers=h).status_code == 204  # not in that release: left alone
    assert fresh(client, world.a, release)["linked_bug_count"] == 1
    assert client.delete(url(world.a, release, f"/bugs/{bug['id']}"), headers=h).status_code == 204
    assert client.delete(url(world.a, release, f"/bugs/{bug['id']}"), headers=h).status_code == 204
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=h).json()["release_id"] is None
    trail = client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}/activity", headers=h).json()["items"][0]
    assert (trail["kind"], trail["old_value"], trail["new_value"]) == ("linked_release", "WEB 2.4.0", None)


def test_linking_to_a_foreign_or_unknown_release_is_a_404_and_changes_nothing(client, world) -> None:
    project = make_project(client, world.a)
    bug = severity_bug(client, world.a, project, "high")
    foreign = make_release(client, world.b, make_project(client, world.b))
    h = world.a.h("qa_lead")
    for release_id in (foreign["id"], str(uuid.uuid4())):
        assert client.post(f"{O}/{world.a.org.id}/releases/{release_id}/bugs", json={"bug_ids": [bug["id"]]}, headers=h).status_code == 404
        assert client.delete(f"{O}/{world.a.org.id}/releases/{release_id}/bugs/{bug['id']}", headers=h).status_code == 404
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=h).json()["release_id"] is None


def test_a_bug_can_also_be_pointed_at_a_release_through_its_own_edit(client, world) -> None:
    web = make_project(client, world.a)
    api = make_project(client, world.a, "API")
    release = make_release(client, world.a, web)
    foreign_project_release = make_release(client, world.a, api, name="API 1.0")
    bug = severity_bug(client, world.a, web, "high")
    h = world.a.h("qa_lead")
    wrong = client.patch(f"{O}/{world.a.org.id}/bugs/{bug['id']}", json={"release_id": foreign_project_release["id"]}, headers=h)
    assert wrong.status_code == 422
    done = client.patch(f"{O}/{world.a.org.id}/bugs/{bug['id']}", json={"release_id": release["id"]}, headers=h)
    assert done.status_code == 200 and done.json()["release_name"] == "WEB 2.4.0"
    trail = client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}/activity", headers=h).json()["items"][0]
    assert (trail["kind"], trail["new_value"]) == ("linked_release", "WEB 2.4.0")
    assert [b["key"] for b in fresh(client, world.a, release)["bugs"]] == [bug["key"]]


# API-118 and API-119 runs ----------------------------------------------------------------------

@pytest.mark.parametrize("role", LEADS)
def test_a_lead_links_runs_completed_ones_too_and_the_run_shows_the_release(client, world, role) -> None:
    project, suite, _ = run_setup(client, world.a)
    release = make_release(client, world.a, project)
    running = make_run(client, world.a, project, suite, name="Running run")
    finished = make_run(client, world.a, project, suite, name="Finished run")
    mark(client, world.a, finished, 0, "pass")
    client.patch(run_url(world.a, finished), json={"status": "completed"}, headers=world.a.h("qa_lead"))
    r = client.post(url(world.a, release, "/runs"), json={"run_ids": [running["id"], finished["id"]]}, headers=world.a.h(role))
    assert r.status_code == 200 and r.json() == {"linked": 2}
    assert client.post(url(world.a, release, "/runs"), json={"run_ids": [running["id"]]}, headers=world.a.h(role)).json() == {"linked": 0}
    shown = fresh(client, world.a, release)
    assert {r["name"] for r in shown["runs"]} == {"Running run", "Finished run"} and shown["linked_run_count"] == 2
    assert all(r["release_name"] == "WEB 2.4.0" for r in shown["runs"])
    listed = client.get(f"{O}/{world.a.org.id}/test-runs", headers=world.a.h("viewer")).json()["items"]
    assert {r["release_name"] for r in listed} == {"WEB 2.4.0"}


def test_run_links_are_all_or_nothing_and_stay_inside_the_project(client, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    other_project, other_suite, _ = run_setup(client, world.a, key="API")
    release = make_release(client, world.a, project)
    mine = make_run(client, world.a, project, suite)
    elsewhere = make_run(client, world.a, other_project, other_suite)
    b_project, b_suite, _ = run_setup(client, world.b)
    foreign = make_run(client, world.b, b_project, b_suite)
    h = world.a.h("qa_lead")
    for ids in ([mine["id"], elsewhere["id"]], [mine["id"], foreign["id"]], [mine["id"], str(uuid.uuid4())]):
        assert client.post(url(world.a, release, "/runs"), json={"run_ids": ids}, headers=h).status_code == 422, ids
    assert fresh(client, world.a, release)["linked_run_count"] == 0
    assert client.post(url(world.a, release, "/runs"), json={"run_ids": []}, headers=h).status_code == 422


def test_unlinking_a_run_clears_the_link_and_is_safe_to_repeat(client, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    release = make_release(client, world.a, project)
    run = make_run(client, world.a, project, suite)
    h = world.a.h("qa_lead")
    client.post(url(world.a, release, "/runs"), json={"run_ids": [run["id"]]}, headers=h)
    assert client.delete(url(world.a, release, f"/runs/{run['id']}"), headers=h).status_code == 204
    assert client.delete(url(world.a, release, f"/runs/{run['id']}"), headers=h).status_code == 204
    assert client.get(run_url(world.a, run), headers=h).json()["release_id"] is None
    assert fresh(client, world.a, release)["linked_run_count"] == 0


def test_a_run_can_be_started_in_or_moved_to_a_release_of_its_project_only(client, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    other_project, _, _ = run_setup(client, world.a, key="API")
    release = make_release(client, world.a, project)
    foreign_project_release = make_release(client, world.a, other_project, name="API 1.0")
    h = world.a.h("qa_lead")
    refused = client.post(f"{O}/{world.a.org.id}/test-runs", headers=h, json={
        "project_id": project["id"], "name": "A run", "suite_ids": [suite["id"]], "release_id": foreign_project_release["id"]})
    assert refused.status_code == 422
    run = make_run(client, world.a, project, suite, release_id=release["id"])
    assert run["release_id"] == release["id"] and run["release_name"] == "WEB 2.4.0"
    assert client.patch(run_url(world.a, run), json={"release_id": None}, headers=h).json()["release_id"] is None
    assert client.patch(run_url(world.a, run), json={"release_id": release["id"]}, headers=h).json()["release_name"] == "WEB 2.4.0"


def test_linking_a_run_to_a_foreign_release_is_a_404(client, world) -> None:
    project, suite, _ = run_setup(client, world.a)
    run = make_run(client, world.a, project, suite)
    foreign = make_release(client, world.b, make_project(client, world.b))
    r = client.post(f"{O}/{world.a.org.id}/releases/{foreign['id']}/runs", json={"run_ids": [run["id"]]}, headers=world.a.h("qa_lead"))
    assert r.status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/releases/{foreign['id']}/runs/{run['id']}", headers=world.a.h("qa_lead")).status_code == 404
