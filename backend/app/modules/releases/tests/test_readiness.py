"""The readiness rules of D-014 (and D-063), one rule and one boundary at a time. No database."""

import pytest

from app.modules.releases.domain.readiness import Inputs, evaluate

DONE = {"linked_runs": 1, "runs_completed": 1}  # one completed run, nothing else wrong


def status(**kw) -> str:  # type: ignore[no-untyped-def]
    return evaluate(Inputs(**{**DONE, "pass_rate": 100, **kw})).status


def test_a_release_with_a_completed_perfect_run_and_no_open_bugs_is_ready() -> None:
    verdict = evaluate(Inputs(**DONE, pass_rate=100))
    assert verdict.status == "ready" and verdict.reasons == ["No open Critical or High bugs, pass rate 100%"]


@pytest.mark.parametrize(("rate", "expected"),
                         [(0, "blocked"), (79, "blocked"), (80, "at_risk"), (94, "at_risk"), (95, "ready"), (100, "ready")])
def test_pass_rate_boundaries_are_79_80_94_and_95(rate: int, expected: str) -> None:
    assert status(pass_rate=rate) == expected


def test_the_pass_rate_reasons_name_the_limit_that_was_missed() -> None:
    assert evaluate(Inputs(**DONE, pass_rate=79)).reasons == ["Pass rate 79% is below 80%"]
    assert evaluate(Inputs(**DONE, pass_rate=80)).reasons == ["Pass rate 80% is below 95%"]
    assert evaluate(Inputs(**DONE, pass_rate=94)).reasons == ["Pass rate 94% is below 95%"]


@pytest.mark.parametrize(("critical", "text"), [(1, "1 open Critical bug"), (2, "2 open Critical bugs")])
def test_any_open_critical_bug_blocks(critical: int, text: str) -> None:
    verdict = evaluate(Inputs(**DONE, pass_rate=100, open_critical=critical))
    assert verdict.status == "blocked" and verdict.reasons == [text]


@pytest.mark.parametrize(("high", "text"), [(1, "1 open High bug"), (3, "3 open High bugs")])
def test_any_open_high_bug_is_at_risk(high: int, text: str) -> None:
    verdict = evaluate(Inputs(**DONE, pass_rate=100, open_high=high))
    assert verdict.status == "at_risk" and verdict.reasons == [text]


def test_medium_and_low_bugs_do_not_change_readiness() -> None:
    assert evaluate(Inputs(**DONE, pass_rate=100, open_total=40)).status == "ready"


def test_no_runs_linked_is_at_risk_even_with_no_bugs() -> None:
    verdict = evaluate(Inputs())
    assert verdict.status == "at_risk" and verdict.reasons == ["No test runs linked"]


@pytest.mark.parametrize(("running", "text"), [(1, "1 run still in progress"), (2, "2 runs still in progress")])
def test_a_run_still_in_progress_is_at_risk(running: int, text: str) -> None:
    verdict = evaluate(Inputs(linked_runs=running + 1, runs_in_progress=running, runs_completed=1, pass_rate=100))
    assert verdict.status == "at_risk" and verdict.reasons == [text]


def test_only_runs_in_progress_with_everything_untested_is_at_risk_for_both_reasons() -> None:
    verdict = evaluate(Inputs(linked_runs=1, runs_in_progress=1, pass_rate=None))
    assert verdict.status == "at_risk"
    assert verdict.reasons == ["No results are decided in the linked runs yet", "1 run still in progress"]


def test_a_completed_run_with_nothing_decided_is_not_ready() -> None:
    verdict = evaluate(Inputs(linked_runs=1, runs_completed=1, pass_rate=None))
    assert verdict.status == "at_risk" and verdict.reasons == ["No results are decided in the linked runs yet"]


def test_blocked_lists_the_blocking_reasons_first_and_every_risk_after_them() -> None:
    verdict = evaluate(Inputs(open_critical=2, open_high=1, pass_rate=60, linked_runs=2, runs_in_progress=1, runs_completed=1))
    assert verdict.status == "blocked"
    assert verdict.reasons == ["2 open Critical bugs", "Pass rate 60% is below 80%", "1 open High bug", "1 run still in progress"]


def test_the_acceptance_example_two_blocking_reasons() -> None:
    """WEB 2.4.0 of the release blocked scenario: open Critical bugs and a regression run at 63%."""
    verdict = evaluate(Inputs(open_critical=2, open_high=2, open_total=4, linked_bugs=5, pass_rate=63, linked_runs=1, runs_in_progress=1))
    assert verdict.status == "blocked" and verdict.reasons[:2] == ["2 open Critical bugs", "Pass rate 63% is below 80%"]
