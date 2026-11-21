"""Release readiness (D-014, D-063). Pure rules: numbers in, a status and the reasons that fired out. The status is computed every
time, never stored, and is advisory: a QA Lead may release a Blocked release (the audit event records it).

  Blocked: an open Critical bug, or a combined pass rate under 80%.
  At risk: an open High bug, a pass rate from 80% to 94%, a linked run still in progress, no runs linked, or runs with nothing decided.
  Ready:   none of the above and at least one completed linked run.
The pass rate is the one of the runs (pass over pass, fail and blocked, rounded half up) taken over all linked runs together.
"""

from dataclasses import dataclass, field
from typing import Literal

Readiness = Literal["ready", "at_risk", "blocked"]

BLOCKED_BELOW = 80  # percent
AT_RISK_BELOW = 95


@dataclass(frozen=True)
class Inputs:
    open_critical: int = 0
    open_high: int = 0
    open_total: int = 0
    linked_bugs: int = 0
    pass_rate: int | None = None  # None: no result was decided in the linked runs
    linked_runs: int = 0
    runs_in_progress: int = 0
    runs_completed: int = 0


@dataclass(frozen=True)
class Verdict:
    status: Readiness
    reasons: list[str] = field(default_factory=list)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def evaluate(i: Inputs) -> Verdict:
    blocking: list[str] = []
    risks: list[str] = []
    if i.open_critical:
        blocking.append(f"{_plural(i.open_critical, 'open Critical bug')}")
    if i.pass_rate is not None and i.pass_rate < BLOCKED_BELOW:
        blocking.append(f"Pass rate {i.pass_rate}% is below {BLOCKED_BELOW}%")
    if i.open_high:
        risks.append(f"{_plural(i.open_high, 'open High bug')}")
    if i.pass_rate is not None and BLOCKED_BELOW <= i.pass_rate < AT_RISK_BELOW:
        risks.append(f"Pass rate {i.pass_rate}% is below {AT_RISK_BELOW}%")
    if i.linked_runs and i.pass_rate is None:
        risks.append("No results are decided in the linked runs yet")
    if i.runs_in_progress:
        risks.append(f"{_plural(i.runs_in_progress, 'run')} still in progress")
    if not i.linked_runs:
        risks.append("No test runs linked")
    if blocking:
        return Verdict("blocked", [*blocking, *risks])
    if risks:
        return Verdict("at_risk", risks)
    return Verdict("ready", [f"No open Critical or High bugs, pass rate {i.pass_rate}%"])
