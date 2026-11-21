"""API-060 to API-064 (I-03): happy, invalid, forbidden and cross tenant for every endpoint, plus the rules that sit on top
(numbering, soft delete, open and SLA definitions, label cascade, counters).
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from app.core.db import utcnow
from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.bugs.application import hooks
from app.modules.bugs.domain.rules import FINISHED_STATUSES, OPEN_STATUSES, STATUSES, sla_breached
from app.modules.bugs.infrastructure.models import Bug, BugLabel

O = "/api/v1/orgs"
QA_SEVERITY = ["org_admin", "qa_lead", "qa_engineer"]
LEADS = ["org_admin", "qa_lead"]
NOT_LEADS = ["qa_engineer", "developer", "viewer"]
ALL_ROLES = ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"]


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def make_project(client, tenant, key="WEB", name=None):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/projects", json={"name": name or f"Project {key}", "key": key},
                    headers=tenant.h("qa_lead"))
    assert r.status_code == 201, r.text
    return r.json()


def make_bug(client, tenant, project, role="qa_engineer", title="Checkout button does nothing", **extra):  # type: ignore[no-untyped-def]
    r = client.post(f"{O}/{tenant.org.id}/bugs", json={"project_id": project["id"], "title": title, **extra},
                    headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


def set_bug(db, bug, **values):  # type: ignore[no-untyped-def]
    db.execute(update(Bug).where(Bug.id == uuid.UUID(bug["id"])).values(**values))


def listing(client, tenant, role="qa_lead", **params):  # type: ignore[no-untyped-def]
    r = client.get(f"{O}/{tenant.org.id}/bugs", params=params, headers=tenant.h(role))
    assert r.status_code == 200, r.text
    return r.json()


def keys(page) -> list[str]:  # type: ignore[no-untyped-def]
    return [b["key"] for b in page["items"]]


# API-061 create -------------------------------------------------------------------------

def test_qa_engineer_files_a_bug_and_sees_key_web_1(client, db, world) -> None:
    project = make_project(client, world.a)
    bug = make_bug(client, world.a, project)
    assert bug["key"] == "WEB-1" and bug["number"] == 1 and bug["status"] == "new"
    assert bug["severity"] == "medium" and bug["priority"] == "p3" and bug["sla_breached"] is False
    assert bug["reporter_id"] == str(world.a.users["qa_engineer"].id) and bug["assignee_id"] is None
    assert keys(listing(client, world.a)) == ["WEB-1"]
    assert make_bug(client, world.a, project, title="Second problem")["key"] == "WEB-2"
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "bug.created"))
    assert event is not None and event.data["key"] == "WEB-1"


@pytest.mark.parametrize("role", QA_SEVERITY)
def test_qa_roles_set_severity_and_priority(client, world, role) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a), role=role, severity="critical", priority="p1")
    assert bug["severity"] == "critical" and bug["priority"] == "p1"


def test_developer_files_a_bug_with_medium_and_p3_forced(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a), role="developer")
    assert bug["severity"] == "medium" and bug["priority"] == "p3"


@pytest.mark.parametrize("extra", [{"severity": "high"}, {"priority": "p1"}, {"severity": "medium"}])
def test_developer_sending_severity_or_priority_gets_403_and_nothing_is_created(client, db, world, extra) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"project_id": project["id"], "title": "Some bug here", **extra},
                    headers=world.a.h("developer"))
    assert r.status_code == 403 and code(r) == "forbidden"
    assert db.scalar(select(Bug.id).where(Bug.org_id == world.a.org.id)) is None


def test_viewer_cannot_create_bugs(client, world) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"project_id": project["id"], "title": "Some bug here"},
                    headers=world.a.h("viewer"))
    assert r.status_code == 403 and code(r) == "forbidden"


@pytest.mark.parametrize("body", [
    {}, {"title": "abcd"}, {"title": "x" * 201}, {"title": "     "}, {"title": 5},
    {"title": "Fine title", "severity": "urgent"}, {"title": "Fine title", "priority": "p5"},
    {"title": "Fine title", "extra": 1}, {"title": "Fine title", "steps_to_reproduce": [""]},
    {"title": "Fine title", "steps_to_reproduce": ["a"] * 51}, {"title": "Fine title", "label_ids": ["nope"]},
    {"title": "Fine title", "description": "d" * 20001}, {"title": "Fine title", "ai_assisted": "maybe"},
])
def test_create_bug_invalid_input(client, world, body) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"project_id": project["id"], **body}, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_create_without_a_project_is_422(client, world) -> None:
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"title": "Fine title"}, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"][-1] == "project_id"


def test_title_at_the_limits_is_accepted(client, world) -> None:
    project = make_project(client, world.a)
    assert make_bug(client, world.a, project, title="a" * 5)["title"] == "a" * 5
    assert make_bug(client, world.a, project, title="b" * 200)["title"] == "b" * 200


def test_create_trims_the_title_and_keeps_the_steps(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a), title="  Padded title  ",
                   steps_to_reproduce=["Open the page", "Click Pay"], expected_result="A receipt", actual_result="Nothing")
    assert bug["title"] == "Padded title" and bug["steps_to_reproduce"] == ["Open the page", "Click Pay"]
    assert bug["expected_result"] == "A receipt" and bug["actual_result"] == "Nothing"


def test_create_with_component_environment_labels_and_assignee(client, world) -> None:
    project = make_project(client, world.a)
    comp = client.post(f"{O}/{world.a.org.id}/projects/{project['id']}/components", json={"name": "Checkout"},
                       headers=world.a.h("qa_lead")).json()
    env = client.get(f"{O}/{world.a.org.id}/projects/{project['id']}/environments", headers=world.a.h("qa_lead")).json()[0]
    l1 = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Regression"}, headers=world.a.h("qa_lead")).json()
    l2 = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Payments"}, headers=world.a.h("qa_lead")).json()
    dev = world.a.users["developer"]
    bug = make_bug(client, world.a, project, component_id=comp["id"], environment_id=env["id"],
                   label_ids=[l1["id"], l2["id"], l1["id"]], assignee_id=str(dev.id))
    assert bug["component_id"] == comp["id"] and bug["environment_id"] == env["id"]
    assert [x["name"] for x in bug["labels"]] == ["Payments", "Regression"]  # sorted, the duplicate id counted once
    assert bug["assignee_id"] == str(dev.id) and bug["assignee_name"] == dev.full_name


def test_developer_can_only_assign_a_new_bug_to_themselves(client, world) -> None:
    project = make_project(client, world.a)
    me = world.a.users["developer"]
    other = world.a.users["qa_engineer"]
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"project_id": project["id"], "title": "Some bug here",
                    "assignee_id": str(other.id)}, headers=world.a.h("developer"))
    assert r.status_code == 403
    assert make_bug(client, world.a, project, role="developer", assignee_id=str(me.id))["assignee_id"] == str(me.id)


def test_references_must_belong_to_the_org_and_project(client, world) -> None:
    a, b = world.a, world.b
    web, api = make_project(client, a), make_project(client, a, key="API")
    foreign_project = make_project(client, b, key="WEB")
    web_comp = client.post(f"{O}/{a.org.id}/projects/{web['id']}/components", json={"name": "Checkout"},
                           headers=a.h("qa_lead")).json()
    api_env = client.get(f"{O}/{a.org.id}/projects/{api['id']}/environments", headers=a.h("qa_lead")).json()[0]
    foreign_label = client.post(f"{O}/{b.org.id}/labels", json={"name": "Foreign"}, headers=b.h("qa_lead")).json()
    foreign_comp = client.post(f"{O}/{b.org.id}/projects/{foreign_project['id']}/components", json={"name": "Checkout"},
                               headers=b.h("qa_lead")).json()
    api_comp = client.post(f"{O}/{a.org.id}/projects/{api['id']}/components", json={"name": "Gateway"},
                           headers=a.h("qa_lead")).json()
    bad: dict[str, object] = {
        "project_id": foreign_project["id"],  # another org's project
        "component_id": api_comp["id"],  # a component of another project of the same org
        "environment_id": api_env["id"],  # an environment of another project
        "label_ids": [foreign_label["id"]],  # another org's label
        "assignee_id": str(b.users["qa_lead"].id),  # a member of another org
        "release_id": str(uuid.uuid4()),  # no release exists (releases arrive with I-08)
        "source_run_result_id": str(uuid.uuid4()),  # no run result exists (I-07)
    }
    for field, value in bad.items():
        body = {"project_id": web["id"], "title": "Some bug here", field: value}
        r = client.post(f"{O}/{a.org.id}/bugs", json=body, headers=a.h("qa_engineer"))
        assert r.status_code == 422 and code(r) == "validation_error", (field, r.text)
        assert r.json()["error"]["details"][0]["loc"] == ["body", field]
    r = client.post(f"{O}/{a.org.id}/bugs", json={"project_id": web["id"], "title": "Some bug here",
                    "component_id": foreign_comp["id"]}, headers=a.h("qa_engineer"))
    assert r.status_code == 422
    assert web_comp["id"]  # the component of the right project is accepted
    assert make_bug(client, a, web, component_id=web_comp["id"])["component_id"] == web_comp["id"]


def test_an_unknown_assignee_and_an_archived_project_are_422(client, world) -> None:
    project = make_project(client, world.a)
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"project_id": project["id"], "title": "Some bug here",
                    "assignee_id": str(uuid.uuid4())}, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422
    client.patch(f"{O}/{world.a.org.id}/projects/{project['id']}", json={"archived": True}, headers=world.a.h("qa_lead"))
    r = client.post(f"{O}/{world.a.org.id}/bugs", json={"project_id": project["id"], "title": "Some bug here"},
                    headers=world.a.h("qa_engineer"))
    assert r.status_code == 422 and "archived" in r.json()["error"]["details"][0]["msg"]


def test_release_and_run_result_checks_come_from_the_modules_that_own_them(client, world) -> None:
    project = make_project(client, world.a)
    # A real release (the releases module owns the check and the table the id points at); the run result check is replaced by a fake
    # because a result needs a whole run (the real one is covered in the testing and release tests)
    release = client.post(f"{O}/{world.a.org.id}/releases", json={"project_id": project["id"], "name": "WEB 2.4.0"},
                          headers=world.a.h("qa_lead")).json()["id"]
    result = uuid.uuid4()
    before = list(hooks.run_result_exists)  # the testing module registers its own check at import
    hooks.run_result_exists.append(lambda db, org_id, project_id, rid: rid == result)
    try:
        bug = make_bug(client, world.a, project, release_id=release, source_run_result_id=str(result))
    finally:
        hooks.run_result_exists[:] = before
    assert bug["release_id"] == release and bug["release_name"] == "WEB 2.4.0"


# Numbering (D-008, D-016) ---------------------------------------------------------------

def test_numbers_are_per_project_and_a_deleted_bugs_key_is_never_reused(client, world) -> None:
    web, api = make_project(client, world.a), make_project(client, world.a, key="API")
    first, second = make_bug(client, world.a, web), make_bug(client, world.a, web, title="Another problem")
    assert (first["key"], second["key"], make_bug(client, world.a, api)["key"]) == ("WEB-1", "WEB-2", "API-1")
    assert client.delete(f"{O}/{world.a.org.id}/bugs/{second['id']}", headers=world.a.h("qa_lead")).status_code == 204
    assert make_bug(client, world.a, web, title="After the delete")["key"] == "WEB-3"  # WEB-2 stays taken
    assert make_bug(client, world.b, make_project(client, world.b))["key"] == "WEB-1"  # keys are per org


def test_two_bugs_created_at_once_never_share_a_number(engine) -> None:
    """Real concurrent sessions and commits (the shared test session cannot overlap). Cleans up what it creates."""
    from concurrent.futures import ThreadPoolExecutor

    from sqlalchemy import delete
    from sqlalchemy.orm import Session

    from app.core.permissions import Role
    from app.modules.auth.infrastructure.models import User
    from app.modules.bugs.application import service
    from app.modules.bugs.schemas.bugs import BugCreateIn
    from app.modules.orgs.infrastructure.models import Membership, Organization
    from app.modules.projects.infrastructure.models import Project

    tag = uuid.uuid4().hex[:8]
    with Session(engine) as s:
        user = User(email=f"race-{tag}@example.test", full_name="Race", password_hash="x")
        org = Organization(name="Race org", slug=f"race-{tag}", ai_daily_limit=1)
        s.add_all([user, org])
        s.flush()
        s.add(Membership(org_id=org.id, user_id=user.id, role="org_admin", status="active"))
        project = Project(org_id=org.id, name="Race", key="RACE")
        s.add(project)
        s.commit()
        ids = (user.id, org.id, project.id)

    def create(n: int) -> int:
        with Session(engine) as session:
            body = BugCreateIn(project_id=ids[2], title=f"Concurrent bug {n}")
            return service.create_bug(session, ids[1], service.Actor(ids[0], Role.ORG_ADMIN), body).number

    try:
        with ThreadPoolExecutor(max_workers=10) as pool:
            numbers = list(pool.map(create, range(20)))
        assert sorted(numbers) == list(range(1, 21))
    finally:
        with Session(engine) as s:
            s.execute(delete(Organization).where(Organization.id == ids[1]))  # cascades to the project and bugs
            s.execute(delete(User).where(User.id == ids[0]))
            s.commit()


# API-062 get ----------------------------------------------------------------------------

def test_get_by_uuid_and_by_key_in_any_case(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    for ref in (bug["id"], "WEB-1", "web-1"):
        r = client.get(f"{O}/{world.a.org.id}/bugs/{ref}", headers=world.a.h("viewer"))
        assert r.status_code == 200 and r.json()["id"] == bug["id"], ref
    assert r.json()["title"] == bug["title"] and "steps_to_reproduce" in r.json()


@pytest.mark.parametrize("ref", ["WEB-99", "NOPE-1", "web", "WEB-", "x" * 50, "00000000-0000-0000-0000-000000000000"])
def test_get_unknown_or_malformed_ref_is_404(client, world, ref) -> None:
    make_project(client, world.a)
    r = client.get(f"{O}/{world.a.org.id}/bugs/{ref}", headers=world.a.h("qa_lead"))
    assert r.status_code == 404 and code(r) == "not_found"


def test_another_orgs_bug_is_404_by_uuid_and_by_key(client, world) -> None:
    bug_b = make_bug(client, world.b, make_project(client, world.b))
    make_project(client, world.a)  # org A also has a project keyed WEB, but no bug yet
    for ref in (bug_b["id"], bug_b["key"]):
        assert client.get(f"{O}/{world.a.org.id}/bugs/{ref}", headers=world.a.h("org_admin")).status_code == 404
    assert client.patch(f"{O}/{world.a.org.id}/bugs/{bug_b['id']}", json={"title": "Hijacked title"},
                        headers=world.a.h("org_admin")).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/bugs/{bug_b['id']}", headers=world.a.h("org_admin")).status_code == 404


# API-060 list ---------------------------------------------------------------------------

def test_list_is_newest_update_first_and_paged(client, world) -> None:
    project = make_project(client, world.a)
    for n in range(5):
        make_bug(client, world.a, project, title=f"Bug number {n}")
    page = listing(client, world.a)
    assert keys(page) == ["WEB-5", "WEB-4", "WEB-3", "WEB-2", "WEB-1"] and page["total"] == 5
    two = listing(client, world.a, page_size=2, page=2)
    assert keys(two) == ["WEB-3", "WEB-2"] and two["page"] == 2 and two["page_size"] == 2 and two["total"] == 5
    assert listing(client, world.a, page=9)["items"] == []


@pytest.mark.parametrize("params", [{"page_size": 101}, {"page_size": 0}, {"page": 0}, {"sort": "title"}, {"sort": "--updated_at"},
                                    {"status": "done"}, {"severity": "urgent"}, {"priority": "p9"}, {"project_id": "x"},
                                    {"sla_breached": "maybe"}, {"q": "x" * 201}])
def test_list_invalid_params_are_422(client, world, params) -> None:
    r = client.get(f"{O}/{world.a.org.id}/bugs", params=params, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_page_size_100_is_accepted(client, world) -> None:
    assert listing(client, world.a, page_size=100)["page_size"] == 100


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_can_read_the_list(client, world, role) -> None:
    make_bug(client, world.a, make_project(client, world.a))
    assert keys(listing(client, world.a, role=role)) == ["WEB-1"]


def test_filters(client, db, world) -> None:
    a = world.a
    web, api = make_project(client, a), make_project(client, a, key="API")
    comp = client.post(f"{O}/{a.org.id}/projects/{web['id']}/components", json={"name": "Checkout"}, headers=a.h("qa_lead")).json()
    env = client.get(f"{O}/{a.org.id}/projects/{web['id']}/environments", headers=a.h("qa_lead")).json()[1]
    label = client.post(f"{O}/{a.org.id}/labels", json={"name": "Regression"}, headers=a.h("qa_lead")).json()
    dev, qa = a.users["developer"], a.users["qa_engineer"]
    b1 = make_bug(client, a, web, title="First bug here", severity="critical", priority="p1", component_id=comp["id"],
                  environment_id=env["id"], label_ids=[label["id"]], assignee_id=str(dev.id))
    b2 = make_bug(client, a, web, title="Second bug here", severity="low", priority="p4", role="qa_lead")
    b3 = make_bug(client, a, api, title="Third bug here", severity="high", priority="p2")
    set_bug(db, b2, status="triaged")
    cases = {
        ("project_id", web["id"]): {b1["key"], b2["key"]}, ("status", "new"): {"WEB-1", "API-1"},
        ("severity", "critical"): {"WEB-1"}, ("priority", "p4"): {"WEB-2"},
        ("assignee_id", str(dev.id)): {"WEB-1"}, ("reporter_id", str(qa.id)): {"WEB-1", "API-1"},
        ("reporter_id", str(a.users["qa_lead"].id)): {"WEB-2"}, ("component_id", comp["id"]): {"WEB-1"},
        ("environment_id", env["id"]): {"WEB-1"}, ("label_id", label["id"]): {"WEB-1"},
        ("release_id", str(uuid.uuid4())): set(),
    }
    for (name, value), expected in cases.items():
        assert set(keys(listing(client, a, **{name: value}))) == expected, (name, value)
    assert b3["key"] == "API-1"
    assert set(keys(listing(client, a, severity=["critical", "low"]))) == {"WEB-1", "WEB-2"}  # repeated parameter
    assert set(keys(listing(client, a, status=["new", "triaged"], project_id=web["id"], severity="low"))) == {"WEB-2"}


def test_unassigned_filter(client, db, world) -> None:
    a = world.a
    project = make_project(client, a)
    dev = str(a.users["developer"].id)
    make_bug(client, a, project, title="Nobody has this one")
    make_bug(client, a, project, title="Diego has this one", assignee_id=dev)
    make_bug(client, a, project, title="Nobody has this either", severity="critical")
    gone = make_bug(client, a, project, title="Deleted unassigned bug")
    client.delete(f"{O}/{a.org.id}/bugs/{gone['id']}", headers=a.h("qa_lead"))
    assert set(keys(listing(client, a, unassigned="true"))) == {"WEB-1", "WEB-3"}  # the deleted one is not there
    assert keys(listing(client, a, unassigned="false")) == ["WEB-2"]
    assert keys(listing(client, a, unassigned="true", severity="critical")) == ["WEB-3"]
    assert keys(listing(client, a, unassigned="true", open="true", q="either")) == ["WEB-3"]
    assert listing(client, a, assignee_id=dev, unassigned="false")["total"] == 1
    assert listing(client, a, assignee_id=dev)["total"] == 1  # unchanged behaviour without the new parameter
    assert listing(client, a)["total"] == 3


def test_assignee_id_together_with_unassigned_true_is_422(client, world) -> None:
    make_bug(client, world.a, make_project(client, world.a))
    r = client.get(f"{O}/{world.a.org.id}/bugs", params={"assignee_id": str(world.a.users["developer"].id),
                                                         "unassigned": "true"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"
    assert r.json()["error"]["details"][0]["loc"] == ["query", "unassigned"]
    r = client.get(f"{O}/{world.a.org.id}/bugs", params={"unassigned": "maybe"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 422


def test_search_matches_key_title_and_description_case_insensitively(client, world) -> None:
    project = make_project(client, world.a)
    make_bug(client, world.a, project, title="Login page crashes")
    make_bug(client, world.a, project, title="Another thing", description="The Invoice total is wrong")
    make_bug(client, world.a, project, title="Third item here")
    assert keys(listing(client, world.a, q="CRASHES")) == ["WEB-1"]
    assert keys(listing(client, world.a, q="invoice TOTAL")) == ["WEB-2"]
    assert keys(listing(client, world.a, q="web-3")) == ["WEB-3"]
    assert sorted(keys(listing(client, world.a, q="WEB"))) == ["WEB-1", "WEB-2", "WEB-3"]
    assert listing(client, world.a, q="nothing like this")["total"] == 0
    assert listing(client, world.a, q="   ")["total"] == 3  # blank search is no search


def test_search_treats_wildcards_as_plain_characters(client, world) -> None:
    project = make_project(client, world.a)
    make_bug(client, world.a, project, title="Discount is 100% off")
    make_bug(client, world.a, project, title="snake_case names")
    make_bug(client, world.a, project, title="Plain title here")
    assert keys(listing(client, world.a, q="100%")) == ["WEB-1"]
    assert keys(listing(client, world.a, q="e_c")) == ["WEB-2"]  # underscore is not "any one character"
    assert listing(client, world.a, q="%")["total"] == 1
    assert keys(listing(client, world.a, q="'; DROP TABLE bugs; --")) == []


def test_sort_by_severity_priority_and_created(client, world) -> None:
    project = make_project(client, world.a)
    make_bug(client, world.a, project, title="Low one", severity="low", priority="p4")
    make_bug(client, world.a, project, title="Critical one", severity="critical", priority="p2")
    make_bug(client, world.a, project, title="High one", severity="high", priority="p1")
    assert keys(listing(client, world.a, sort="severity")) == ["WEB-2", "WEB-3", "WEB-1"]  # critical first
    assert keys(listing(client, world.a, sort="-severity")) == ["WEB-1", "WEB-3", "WEB-2"]
    assert keys(listing(client, world.a, sort="priority")) == ["WEB-3", "WEB-2", "WEB-1"]
    assert keys(listing(client, world.a, sort="created_at")) == ["WEB-1", "WEB-2", "WEB-3"]
    assert keys(listing(client, world.a, sort="-created_at")) == ["WEB-3", "WEB-2", "WEB-1"]


def test_the_list_only_shows_this_orgs_bugs(client, world) -> None:
    make_bug(client, world.a, make_project(client, world.a))
    make_bug(client, world.b, make_project(client, world.b), title="Org B secret bug")
    page = listing(client, world.a)
    assert keys(page) == ["WEB-1"] and listing(client, world.a, q="secret")["total"] == 0


def test_list_items_carry_labels_names_and_sla(client, world) -> None:
    project = make_project(client, world.a)
    label = client.post(f"{O}/{world.a.org.id}/labels", json={"name": "Regression", "color": "info"},
                        headers=world.a.h("qa_lead")).json()
    make_bug(client, world.a, project, label_ids=[label["id"]], assignee_id=str(world.a.users["developer"].id))
    item = listing(client, world.a)["items"][0]
    assert item["labels"] == [{"id": label["id"], "name": "Regression", "color": "info"}]
    assert item["assignee_name"] == world.a.users["developer"].full_name
    assert item["reporter_name"] == world.a.users["qa_engineer"].full_name and item["sla_breached"] is False
    assert "description" not in item  # the list carries summaries


# Soft delete (D-016) ----------------------------------------------------------------------

def test_a_deleted_bug_is_gone_from_lists_counts_search_filters_and_get(client, db, world) -> None:
    a = world.a
    project = make_project(client, a)
    label = client.post(f"{O}/{a.org.id}/labels", json={"name": "Regression"}, headers=a.h("qa_lead")).json()
    comp = client.post(f"{O}/{a.org.id}/projects/{project['id']}/components", json={"name": "Checkout"},
                       headers=a.h("qa_lead")).json()
    keep = make_bug(client, a, project, title="Keeper bug here", label_ids=[label["id"]], component_id=comp["id"])
    gone = make_bug(client, a, project, title="Doomed bug here", label_ids=[label["id"]], component_id=comp["id"],
                    severity="critical")
    assert client.delete(f"{O}/{a.org.id}/bugs/{gone['id']}", headers=a.h("qa_lead")).status_code == 204
    assert keys(listing(client, a)) == [keep["key"]]
    assert listing(client, a, q="doomed")["total"] == 0 and listing(client, a, q="WEB-2")["total"] == 0
    assert listing(client, a, severity="critical")["total"] == 0 and listing(client, a, label_id=label["id"])["total"] == 1
    assert listing(client, a, open=True)["total"] == 1 and listing(client, a, sla_breached=False)["total"] == 1
    for ref in (gone["id"], gone["key"]):
        assert client.get(f"{O}/{a.org.id}/bugs/{ref}", headers=a.h("qa_lead")).status_code == 404
    labels = client.get(f"{O}/{a.org.id}/labels", headers=a.h("qa_lead")).json()
    assert [x["bug_count"] for x in labels] == [1]
    assert client.get(f"{O}/{a.org.id}/projects/{project['id']}", headers=a.h("qa_lead")).json()["open_bug_count"] == 1
    comps = client.get(f"{O}/{a.org.id}/projects/{project['id']}/components", headers=a.h("qa_lead")).json()
    assert [c["open_bug_count"] for c in comps] == [1]
    row = db.scalar(select(Bug).where(Bug.id == uuid.UUID(gone["id"])))
    assert row is not None and row.deleted_at is not None  # soft: the row stays


# API-064 delete -------------------------------------------------------------------------

@pytest.mark.parametrize("role", LEADS)
def test_leads_delete_bugs(client, db, world, role) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h(role))
    assert r.status_code == 204 and r.content == b""
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h(role)).status_code == 404
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "bug.deleted"))
    assert event is not None and event.data["key"] == "WEB-1"


@pytest.mark.parametrize("role", NOT_LEADS)
def test_others_cannot_delete_bugs(client, world, role) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a), role="developer")
    r = client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h(role)).status_code == 200


def test_deleting_a_missing_or_already_deleted_bug_is_404(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    h = world.a.h("qa_lead")
    assert client.delete(f"{O}/{world.a.org.id}/bugs/{uuid.uuid4()}", headers=h).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=h).status_code == 204
    assert client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=h).status_code == 404
    assert client.delete(f"{O}/{world.a.org.id}/bugs/not-a-uuid", headers=h).status_code == 422


# API-063 update -------------------------------------------------------------------------

def patch(client, tenant, bug, role, **body):  # type: ignore[no-untyped-def]
    return client.patch(f"{O}/{tenant.org.id}/bugs/{bug['id']}", json=body, headers=tenant.h(role))


def test_qa_engineer_edits_fields_and_it_is_audited(client, db, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = patch(client, world.a, bug, "qa_engineer", title="A better title", description="More detail",
              steps_to_reproduce=["One", "Two"], expected_result="Works", actual_result="Does not")
    assert r.status_code == 200, r.text
    got = r.json()
    assert got["title"] == "A better title" and got["description"] == "More detail" and got["steps_to_reproduce"] == ["One", "Two"]
    assert got["updated_at"] >= bug["updated_at"]
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "bug.updated"))
    assert event is not None and event.data["changes"]["title"] == {"from": bug["title"], "to": "A better title"}
    assert event.data["changes"]["description"] == {"changed": True}  # long text is not copied into the audit log


def test_a_change_that_changes_nothing_writes_no_audit_event(client, db, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = patch(client, world.a, bug, "qa_engineer", title=bug["title"])
    assert r.status_code == 200 and r.json()["updated_at"] == bug["updated_at"]
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "bug.updated")) is None


@pytest.mark.parametrize("role", QA_SEVERITY)
def test_qa_roles_change_severity_and_priority(client, world, role) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = patch(client, world.a, bug, role, severity="high", priority="p1")
    assert r.status_code == 200 and r.json()["severity"] == "high" and r.json()["priority"] == "p1"


def test_developer_edits_only_bugs_they_reported(client, world) -> None:
    project = make_project(client, world.a)
    mine = make_bug(client, world.a, project, role="developer", title="My own bug here")
    theirs = make_bug(client, world.a, project, role="qa_engineer", title="Someone elses bug")
    assert patch(client, world.a, mine, "developer", title="Edited by its reporter").status_code == 200
    r = patch(client, world.a, theirs, "developer", title="Edited by a stranger")
    assert r.status_code == 403 and r.json()["error"]["details"]["fields"] == ["title"]


def test_developer_cannot_change_severity_even_on_their_own_bug(client, world) -> None:
    mine = make_bug(client, world.a, make_project(client, world.a), role="developer")
    for body in ({"severity": "critical"}, {"priority": "p1"}):
        assert patch(client, world.a, mine, "developer", **body).status_code == 403


def test_one_forbidden_field_rejects_the_whole_request_and_applies_nothing(client, db, world) -> None:
    mine = make_bug(client, world.a, make_project(client, world.a), role="developer", title="Original title here")
    r = patch(client, world.a, mine, "developer", title="Changed title here", severity="critical")
    assert r.status_code == 403 and r.json()["error"]["details"]["fields"] == ["severity"]
    after = client.get(f"{O}/{world.a.org.id}/bugs/{mine['id']}", headers=world.a.h("developer")).json()
    assert after["title"] == "Original title here" and after["severity"] == "medium"
    assert db.scalar(select(AuditEvent).where(AuditEvent.action == "bug.updated")) is None


def test_viewer_cannot_edit(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    for body in ({"title": "Edited by viewer"}, {"severity": "low"}, {"assignee_id": str(world.a.users["viewer"].id)}):
        r = patch(client, world.a, bug, "viewer", **body)
        assert r.status_code == 403 and code(r) == "forbidden"


def test_developer_self_assigns_only_an_unassigned_bug(client, world) -> None:
    project = make_project(client, world.a)
    dev, qa = world.a.users["developer"], world.a.users["qa_engineer"]
    free = make_bug(client, world.a, project, title="Free bug to take")
    taken = make_bug(client, world.a, project, title="Taken bug here", assignee_id=str(qa.id))
    ok = patch(client, world.a, free, "developer", assignee_id=str(dev.id))
    assert ok.status_code == 200 and ok.json()["assignee_id"] == str(dev.id)
    assert patch(client, world.a, taken, "developer", assignee_id=str(dev.id)).status_code == 403  # already assigned
    assert patch(client, world.a, free, "developer", assignee_id=str(qa.id)).status_code == 403  # not to themselves
    assert patch(client, world.a, free, "developer", assignee_id=None).status_code == 403  # no unassigning


@pytest.mark.parametrize("role", QA_SEVERITY)
def test_qa_roles_assign_and_unassign_and_it_is_audited(client, db, world, role) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    dev = world.a.users["developer"]
    r = patch(client, world.a, bug, role, assignee_id=str(dev.id))
    assert r.status_code == 200 and r.json()["assignee_name"] == dev.full_name
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "bug.assigned"))
    assert event is not None and event.data == {"key": "WEB-1", "from": None, "to": str(dev.id)}
    cleared = patch(client, world.a, bug, role, assignee_id=None)
    assert cleared.status_code == 200 and cleared.json()["assignee_id"] is None


def test_assignee_must_be_a_member_of_this_org(client, world) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    for who in (str(world.b.users["developer"].id), str(uuid.uuid4())):
        r = patch(client, world.a, bug, "qa_lead", assignee_id=who)
        assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "assignee_id"]


def test_labels_component_and_environment_can_be_replaced_and_cleared(client, world) -> None:
    a = world.a
    project = make_project(client, a)
    other = make_project(client, a, key="API")
    comp = client.post(f"{O}/{a.org.id}/projects/{project['id']}/components", json={"name": "Checkout"}, headers=a.h("qa_lead")).json()
    foreign_comp = client.post(f"{O}/{a.org.id}/projects/{other['id']}/components", json={"name": "Gateway"}, headers=a.h("qa_lead")).json()
    l1 = client.post(f"{O}/{a.org.id}/labels", json={"name": "One"}, headers=a.h("qa_lead")).json()
    l2 = client.post(f"{O}/{a.org.id}/labels", json={"name": "Two"}, headers=a.h("qa_lead")).json()
    bug = make_bug(client, a, project, label_ids=[l1["id"]])
    r = patch(client, a, bug, "qa_engineer", label_ids=[l2["id"]], component_id=comp["id"])
    assert r.status_code == 200 and [x["name"] for x in r.json()["labels"]] == ["Two"] and r.json()["component_id"] == comp["id"]
    assert patch(client, a, bug, "qa_engineer", component_id=foreign_comp["id"]).status_code == 422
    cleared = patch(client, a, bug, "qa_engineer", component_id=None, label_ids=[])
    assert cleared.json()["component_id"] is None and cleared.json()["labels"] == []


@pytest.mark.parametrize("body", [{}, {"title": None}, {"title": "abc"}, {"title": "x" * 201}, {"title": "abcd"},
                                  {"severity": None}, {"severity": "urgent"}, {"label_ids": None},
                                  {"steps_to_reproduce": None}, {"status": "closed"}, {"project_id": str(uuid.uuid4())}, {"title": 5}])
def test_update_invalid_input(client, world, body) -> None:
    bug = make_bug(client, world.a, make_project(client, world.a))
    r = client.patch(f"{O}/{world.a.org.id}/bugs/{bug['id']}", json=body, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_updating_a_missing_bug_is_404(client, world) -> None:
    r = client.patch(f"{O}/{world.a.org.id}/bugs/{uuid.uuid4()}", json={"title": "Some new title"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 404


# Open bugs, SLA, counters and the label cascade -----------------------------------------

def test_open_means_not_verified_closed_or_wont_fix(client, db, world) -> None:
    project = make_project(client, world.a)
    by_status = {}
    for status in STATUSES:
        bug = make_bug(client, world.a, project, title=f"Bug in status {status}")
        set_bug(db, bug, status=status)
        by_status[status] = bug["key"]
    assert set(OPEN_STATUSES) | set(FINISHED_STATUSES) == set(STATUSES) and set(FINISHED_STATUSES) == {"verified", "closed", "wont_fix"}
    open_keys = {by_status[s] for s in OPEN_STATUSES}
    assert open_keys == set(keys(listing(client, world.a, open=True)))  # fixed and ready_for_retest still count as open
    assert {by_status[s] for s in FINISHED_STATUSES} == set(keys(listing(client, world.a, open=False)))
    assert listing(client, world.a)["total"] == 9
    got = client.get(f"{O}/{world.a.org.id}/projects/{project['id']}", headers=world.a.h("qa_lead")).json()
    assert got["open_bug_count"] == len(OPEN_STATUSES) == 6


def test_the_open_counters_use_the_same_definition_for_components(client, db, world) -> None:
    a = world.a
    project = make_project(client, a)
    comp = client.post(f"{O}/{a.org.id}/projects/{project['id']}/components", json={"name": "Checkout"}, headers=a.h("qa_lead")).json()
    for status in ("new", "fixed", "ready_for_retest", "verified", "closed", "wont_fix"):
        set_bug(db, make_bug(client, a, project, title=f"Checkout bug {status}", component_id=comp["id"]), status=status)
    listed = client.get(f"{O}/{a.org.id}/projects/{project['id']}/components", headers=a.h("qa_lead")).json()
    assert listed[0]["open_bug_count"] == 3
    page = client.get(f"{O}/{a.org.id}/projects", headers=a.h("qa_lead")).json()
    assert page["items"][0]["open_bug_count"] == 3


def test_status_check_constraint_rejects_unknown_values(client, db, world) -> None:
    from sqlalchemy.exc import IntegrityError

    bug = make_bug(client, world.a, make_project(client, world.a))
    with pytest.raises(IntegrityError), db.begin_nested():
        db.execute(update(Bug).where(Bug.id == uuid.UUID(bug["id"])).values(status="archived"))
        db.flush()


def test_sla_rule_unit_cases() -> None:
    now = utcnow()
    hours = lambda h: now - timedelta(hours=h)  # noqa: E731
    assert not sla_breached("critical", "new", hours(23), None, now)
    assert sla_breached("critical", "new", hours(25), None, now)
    assert not sla_breached("critical", "fixed", hours(100), hours(90), now)  # fixed after 10 h: the clock stopped
    assert sla_breached("critical", "fixed", hours(100), hours(50), now)  # fixed after 50 h: late
    assert not sla_breached("high", "ready_for_retest", hours(500), hours(450), now)
    assert not sla_breached("low", "wont_fix", hours(2000), hours(1990), now)  # won't fix stops the clock
    assert sla_breached("medium", "reopened", hours(14 * 24 + 5), hours(14 * 24), now)  # reopened restarts from creation
    assert sla_breached("critical", "fixed", hours(30), None, now)  # no resolved_at: still measured to now


def test_sla_filter_agrees_with_the_rule_for_every_severity_and_status(client, db, world) -> None:
    project = make_project(client, world.a)
    now = utcnow()
    cases = []
    for severity, limit in (("critical", 24), ("high", 72), ("medium", 336), ("low", 720)):
        for status in STATUSES:
            for age, fixed_after in ((limit * 2, None), (limit * 2, 1), (limit * 2, limit + 5), (limit // 2, None)):
                cases.append((severity, status, age, fixed_after))
    for n, (severity, status, age, fixed_after) in enumerate(cases):
        bug = make_bug(client, world.a, project, title=f"SLA case number {n}")
        created = now - timedelta(hours=age)
        resolved = created + timedelta(hours=fixed_after) if fixed_after else None
        set_bug(db, bug, severity=severity, status=status, created_at=created, resolved_at=resolved)
        cases[n] = (bug["key"], severity, status, created, resolved)
    expected = {k for k, sev, st, c, r in cases if sla_breached(sev, st, c, r, utcnow())}
    assert 0 < len(expected) < len(cases)
    assert set(keys(listing(client, world.a, sla_breached=True, page_size=100))) | set(
        keys(listing(client, world.a, sla_breached=True, page_size=100, page=2))) == expected
    page = listing(client, world.a, sla_breached=True, page_size=100)
    assert page["total"] == len(expected)
    assert listing(client, world.a, sla_breached=False)["total"] == len(cases) - len(expected)
    flagged = {b["key"] for p in (1, 2, 3, 4, 5) for b in listing(client, world.a, page_size=100, page=p)["items"] if b["sla_breached"]}
    assert flagged == expected  # the flag on each item uses the same rule as the filter


def test_bug_count_on_labels_is_real_and_deleting_a_label_cascades_to_bug_labels(client, db, world) -> None:
    a = world.a
    project = make_project(client, a)
    label = client.post(f"{O}/{a.org.id}/labels", json={"name": "Regression"}, headers=a.h("qa_lead")).json()
    keep = client.post(f"{O}/{a.org.id}/labels", json={"name": "Keep"}, headers=a.h("qa_lead")).json()
    b1 = make_bug(client, a, project, label_ids=[label["id"], keep["id"]])
    make_bug(client, a, project, title="Second tagged bug", label_ids=[label["id"]])
    make_bug(client, a, project, title="Untagged bug here")
    counts = {x["name"]: x["bug_count"] for x in client.get(f"{O}/{a.org.id}/labels", headers=a.h("qa_lead")).json()}
    assert counts == {"Keep": 1, "Regression": 2}
    assert db.scalar(select(BugLabel).where(BugLabel.label_id == uuid.UUID(label["id"]))) is not None
    assert client.delete(f"{O}/{a.org.id}/labels/{label['id']}", headers=a.h("qa_lead")).status_code == 204
    assert db.scalar(select(BugLabel).where(BugLabel.label_id == uuid.UUID(label["id"]))) is None  # cascaded
    got = client.get(f"{O}/{a.org.id}/bugs/{b1['id']}", headers=a.h("qa_lead")).json()
    assert [x["name"] for x in got["labels"]] == ["Keep"]  # the bug stays, minus the deleted label
    assert listing(client, a)["total"] == 3
    assert [x["bug_count"] for x in client.get(f"{O}/{a.org.id}/labels", headers=a.h("qa_lead")).json()] == [1]


def test_deleting_a_component_or_environment_leaves_the_bug_with_none(client, world) -> None:
    a = world.a
    project = make_project(client, a)
    comp = client.post(f"{O}/{a.org.id}/projects/{project['id']}/components", json={"name": "Checkout"}, headers=a.h("qa_lead")).json()
    env = client.post(f"{O}/{a.org.id}/projects/{project['id']}/environments", json={"name": "Canary"}, headers=a.h("qa_lead")).json()
    bug = make_bug(client, a, project, component_id=comp["id"], environment_id=env["id"])
    assert client.delete(f"{O}/{a.org.id}/components/{comp['id']}", headers=a.h("qa_lead")).status_code == 204
    assert client.delete(f"{O}/{a.org.id}/environments/{env['id']}", headers=a.h("qa_lead")).status_code == 204
    got = client.get(f"{O}/{a.org.id}/bugs/{bug['id']}", headers=a.h("qa_lead")).json()
    assert got["component_id"] is None and got["environment_id"] is None
