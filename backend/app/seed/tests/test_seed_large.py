"""The large volume scenarios for the local latency check (BL-035, D-080): their counts and that nothing loads them by default.
The data is only built here, never written to a database, so this test is fast."""

import pytest

from app.seed.domain_data import LARGE_SIZES, Totals, data_for, totals_for
from app.seed.scenarios import LARGE_SCENARIOS, SCENARIOS, expected_counts


@pytest.mark.parametrize(("scenario", "extra"), [("large-5k", 5000), ("large-20k", 20000)])
def test_large_scenario_is_baseline_plus_generated_bugs(scenario: str, extra: int) -> None:
    base = totals_for("baseline")
    got = totals_for(scenario)
    assert got == Totals(base.projects + 1, base.bugs + extra, base.suites, base.cases, base.runs, base.releases)
    assert expected_counts(scenario)["bugs"] == 68 + extra
    assert LARGE_SIZES[scenario] == extra


def test_large_scenarios_stay_out_of_the_default_scenarios() -> None:
    assert not set(LARGE_SCENARIOS) & set(SCENARIOS)


def test_generated_bugs_are_deterministic_and_cover_every_status() -> None:
    first = data_for("large-5k")["lumen"].projects[-1].bugs
    second = data_for("large-5k")["lumen"].projects[-1].bugs
    assert first == second
    assert {s.status for s in first} == {"new", "triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed",
                                         "reopened", "wont_fix"}
