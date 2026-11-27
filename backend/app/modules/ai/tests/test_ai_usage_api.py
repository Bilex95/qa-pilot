"""API-146 to API-148 (I-14): the usage log, the summary and the outcome of a suggestion; and the `ai_usage_id` check the testing module asks.
Unauthorized and the generic cross tenant org check are covered by app/core/tests/test_contract.py."""

import uuid
from datetime import timedelta

import pytest

from app.core.db import utcnow
from app.core.permissions import Role
from app.modules.ai.infrastructure import repository as repo
from app.modules.ai.infrastructure.models import AIUsage
from app.modules.testing.tests.test_cases_api import bulk, case_body
from app.modules.testing.tests.test_cases_api import setup as case_setup

O = "/api/v1/orgs"
LEADS = ["org_admin", "qa_lead"]
OTHERS = ["qa_engineer", "developer", "viewer"]
KEYS = {"id", "user_id", "user_name", "feature", "provider", "model", "status", "input_tokens", "output_tokens", "latency_ms", "outcome", "created_at"}


def code(r) -> str:  # type: ignore[no-untyped-def]
    return r.json()["error"]["code"]


def usage(db, tenant, who="qa_engineer", feature="triage", status="ok", outcome=None, tokens=(100, 20), latency=50, days_ago=0):  # type: ignore[no-untyped-def]
    row = repo.add(db, org_id=tenant.org.id, user_id=tenant.users[Role(who)].id, feature=feature, provider="mock", model="mock-1", status=status,
                   input_tokens=tokens[0], output_tokens=tokens[1], latency_ms=latency)
    row.outcome = outcome
    row.created_at = utcnow() - timedelta(days=days_ago)
    db.flush()
    return row


def get(client, tenant, path, role="qa_lead", **params):  # type: ignore[no-untyped-def]
    return client.get(f"{O}/{tenant.org.id}/ai/{path}", params=params, headers=tenant.h(role))


def outcome(client, tenant, row, value, role="qa_engineer"):  # type: ignore[no-untyped-def]
    return client.post(f"{O}/{tenant.org.id}/ai/usage/{row.id}/outcome", json={"outcome": value}, headers=tenant.h(role))


# API-146 the log -------------------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("role", LEADS)
def test_leads_read_the_log_newest_first_with_who_asked_and_never_any_text(client, db, world, role) -> None:
    old = usage(db, world.a, days_ago=2)
    new = usage(db, world.a, who="developer", feature="explain_log", status="error", outcome="discarded", tokens=(5, 0), latency=9000)
    r = get(client, world.a, "usage", role)
    assert r.status_code == 200 and r.json()["total"] == 2
    first, second = r.json()["items"]
    assert (first["id"], second["id"]) == (str(new.id), str(old.id)) and set(first) == KEYS
    assert first["user_name"] == "developer a" and first["feature"] == "explain_log" and first["outcome"] == "discarded"
    assert (first["status"], first["provider"], first["model"], first["input_tokens"], first["latency_ms"]) == ("error", "mock", "mock-1", 5, 9000)


@pytest.mark.parametrize("role", OTHERS)
def test_other_roles_cannot_read_the_usage(client, db, world, role) -> None:
    usage(db, world.a)
    for path in ("usage", "usage/summary"):
        r = get(client, world.a, path, role)
        assert r.status_code == 403 and code(r) == "forbidden"


def test_the_log_filters_by_feature_person_and_date(client, db, world) -> None:
    usage(db, world.a, feature="triage")
    usage(db, world.a, feature="bug_writer", who="qa_lead")
    usage(db, world.a, feature="triage", days_ago=10)
    assert get(client, world.a, "usage", feature="bug_writer").json()["total"] == 1
    assert get(client, world.a, "usage", user_id=str(world.a.users[Role.QA_LEAD].id)).json()["total"] == 1
    today = utcnow().date().isoformat()
    assert get(client, world.a, "usage", **{"from": today}).json()["total"] == 2
    assert get(client, world.a, "usage", to=(utcnow() - timedelta(days=5)).date().isoformat()).json()["total"] == 1
    assert get(client, world.a, "usage", feature="triage", **{"from": today}).json()["total"] == 1
    assert get(client, world.a, "usage", **{"from": today, "to": today}).json()["total"] == 2  # the end day is included


def test_the_log_is_paged(client, db, world) -> None:
    for i in range(5):
        usage(db, world.a, days_ago=i)
    page = get(client, world.a, "usage", page=2, page_size=2).json()
    assert (page["page"], page["page_size"], page["total"], len(page["items"])) == (2, 2, 5, 2)


@pytest.mark.parametrize("params", [{"feature": "nope"}, {"from": "yesterday"}, {"to": "2026-13-40"}, {"user_id": "x"}, {"page_size": 0}, {"page": 0}])
def test_the_log_refuses_bad_filters(client, world, params) -> None:
    r = get(client, world.a, "usage", **params)
    assert r.status_code == 422 and code(r) == "validation_error"


def test_the_log_of_another_workspace_never_shows(client, db, world) -> None:
    usage(db, world.b)
    mine = usage(db, world.a)
    assert [i["id"] for i in get(client, world.a, "usage").json()["items"]] == [str(mine.id)]
    assert get(client, world.b, "usage").json()["total"] == 1


# API-147 the summary ---------------------------------------------------------------------------------------------------------------------

def test_the_summary_totals_by_feature_with_the_acceptance_rate_and_today_against_the_limit(client, db, world) -> None:
    for o in ("accepted", "accepted", "edited", "discarded"):
        usage(db, world.a, outcome=o, tokens=(100, 10), latency=40)
    usage(db, world.a, outcome=None, tokens=(200, 30), latency=100)  # no outcome yet: not part of the rate
    usage(db, world.a, feature="explain_log", status="error", tokens=(10, 0), latency=3000)
    usage(db, world.a, status="rate_limited", tokens=(0, 0), latency=0)  # refused: not a call
    usage(db, world.a, feature="bug_writer", days_ago=3, outcome="accepted")
    world.a.org.ai_daily_limit = 50
    body = get(client, world.a, "usage/summary").json()
    assert (body["provider"], body["model"], body["ai_enabled"], body["daily_limit"], body["used_today"]) == ("mock", "mock-1", True, 50, 6)
    by = {t["feature"]: t for t in body["totals_by_feature"]}
    assert list(by) == ["bug_writer", "explain_log", "triage"]  # sorted by feature
    assert by["triage"] == {"feature": "triage", "calls": 5, "input_tokens": 600, "output_tokens": 70, "avg_latency_ms": 52, "acceptance_rate": 75}
    assert by["explain_log"]["calls"] == 1 and by["explain_log"]["acceptance_rate"] is None and by["explain_log"]["avg_latency_ms"] == 3000
    assert by["bug_writer"]["acceptance_rate"] == 100


def test_the_summary_of_another_workspace_never_counts(client, db, world) -> None:
    usage(db, world.b)
    usage(db, world.b, feature="explain_log")
    assert get(client, world.a, "usage/summary").json()["totals_by_feature"] == []
    assert get(client, world.a, "usage/summary").json()["used_today"] == 0
    usage(db, world.a)
    body = get(client, world.a, "usage/summary").json()
    assert [t["calls"] for t in body["totals_by_feature"]] == [1] and body["used_today"] == 1


def test_the_summary_range_leaves_out_older_calls_but_today_is_always_today(client, db, world) -> None:
    usage(db, world.a, days_ago=20)
    usage(db, world.a)
    day = (utcnow() - timedelta(days=1)).date().isoformat()
    ranged = get(client, world.a, "usage/summary", **{"from": day}).json()
    assert ranged["totals_by_feature"][0]["calls"] == 1 and ranged["used_today"] == 1
    assert get(client, world.a, "usage/summary", to=day).json()["totals_by_feature"][0]["calls"] == 1


def test_an_empty_summary_and_the_switch_are_reported(client, db, world) -> None:
    world.a.org.ai_enabled = False
    body = get(client, world.a, "usage/summary").json()
    assert body["totals_by_feature"] == [] and body["used_today"] == 0 and body["ai_enabled"] is False


# API-148 the outcome ---------------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("value", ["accepted", "edited", "discarded"])
def test_the_person_who_asked_records_what_they_did_once(client, db, world, value) -> None:
    row = usage(db, world.a)
    assert outcome(client, world.a, row, value).status_code == 204
    db.refresh(row)
    assert row.outcome == value
    again = outcome(client, world.a, row, "discarded" if value != "discarded" else "accepted")
    assert again.status_code == 409 and code(again) == "outcome_set" and again.json()["error"]["details"] == {"outcome": value}
    db.refresh(row)
    assert row.outcome == value  # the first outcome stands


@pytest.mark.parametrize("role", ["org_admin", "qa_lead", "developer", "viewer"])
def test_nobody_else_records_the_outcome_not_even_an_admin(client, db, world, role) -> None:
    row = usage(db, world.a, who="qa_engineer")
    r = outcome(client, world.a, row, "accepted", role)
    assert r.status_code == 404 and code(r) == "not_found"
    db.refresh(row)
    assert row.outcome is None


def test_a_refused_call_has_no_suggestion_to_decide_on(client, db, world) -> None:
    row = usage(db, world.a, status="rate_limited")
    assert outcome(client, world.a, row, "accepted").status_code == 404


def test_an_unknown_foreign_or_malformed_id_is_refused(client, db, world) -> None:
    foreign = usage(db, world.b, who="qa_engineer")
    assert outcome(client, world.a, foreign, "accepted").status_code == 404  # the other workspace's id through this workspace's path
    ghost = AIUsage(id=uuid.uuid4())
    assert outcome(client, world.a, ghost, "accepted").status_code == 404
    r = client.post(f"{O}/{world.a.org.id}/ai/usage/not-a-uuid/outcome", json={"outcome": "accepted"}, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422
    db.refresh(foreign)
    assert foreign.outcome is None


@pytest.mark.parametrize("body", [{}, {"outcome": "maybe"}, {"outcome": None}, {"outcome": "accepted", "extra": 1}, {"outcome": 1}])
def test_an_invalid_outcome_is_a_422_and_changes_nothing(client, db, world, body) -> None:
    row = usage(db, world.a)
    r = client.post(f"{O}/{world.a.org.id}/ai/usage/{row.id}/outcome", json=body, headers=world.a.h("qa_engineer"))
    assert r.status_code == 422 and code(r) == "validation_error"
    db.refresh(row)
    assert row.outcome is None


# The check the testing module asks (ai_usage_id) ----------------------------------------------------------------------------------------

def test_a_saved_suggestion_may_name_a_real_call_of_its_own_workspace_only(client, db, world) -> None:
    _, suite = case_setup(client, world.a)
    mine = usage(db, world.a, feature="test_cases")
    theirs = usage(db, world.b, feature="test_cases")
    refused = usage(db, world.a, feature="test_cases", status="rate_limited")
    assert bulk(client, world.a, suite, [case_body(1, ai_generated=True)], ai_usage_id=str(mine.id)).status_code == 201
    for bad in (theirs.id, refused.id, uuid.uuid4()):
        r = bulk(client, world.a, suite, [case_body(2)], ai_usage_id=str(bad))
        assert r.status_code == 422 and r.json()["error"]["details"][0]["loc"] == ["body", "ai_usage_id"]
