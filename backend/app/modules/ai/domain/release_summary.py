"""The release readiness summary (AI_SPEC 3.6, REQ-048). Pure: the facts the server built about a release become tagged blocks for the
model, and the same facts become the templated summary that the mock and the fallback serve. No text typed by the requester is in the
facts: only what the release, its bugs and its runs hold."""

from dataclasses import dataclass, field
from typing import Literal

from app.modules.ai.domain.prompt import Block, block

Recommendation = Literal["ship", "ship_with_caution", "do_not_ship"]
HEADLINE_MAX = 160
SUMMARY_MAX = 1500
RISK_MAX = 300
RISKS = 5
LISTED_BUGS = 10
RECOMMENDATION_NAME = {"ship": "Ship", "ship_with_caution": "Ship with caution", "do_not_ship": "Do not ship"}


@dataclass(frozen=True)
class BugFact:
    key: str
    title: str
    severity: str
    status: str


@dataclass(frozen=True)
class RunFact:
    name: str
    status: str
    pass_rate: int | None


@dataclass(frozen=True)
class Facts:
    name: str
    target_date: str | None
    status: str  # planned, in_progress, released
    readiness: str  # ready, at_risk, blocked
    reasons: list[str]
    linked_bugs: int
    open_total: int
    open_by_severity: dict[str, int]
    pass_rate: int | None
    linked_runs: int
    runs_in_progress: int
    bugs: list[BugFact] = field(default_factory=list)  # up to 10 open Critical and High bugs, Critical first
    runs: list[RunFact] = field(default_factory=list)


def recommendation_for(readiness: str) -> Recommendation:
    return "do_not_ship" if readiness == "blocked" else "ship_with_caution" if readiness == "at_risk" else "ship"


def contradicts(readiness: str, recommendation: str) -> bool:
    """AI_SPEC 3.6: a blocked release cannot be recommended for shipping."""
    return readiness == "blocked" and recommendation == "ship"


def _rate(rate: int | None) -> str:
    return "no result" if rate is None else f"{rate}%"


# Facts to blocks and back ----------------------------------------------------------------------------------------------------------------

def to_blocks(f: Facts) -> list[Block]:
    sev = f.open_by_severity
    numbers = [f"target_date: {f.target_date or 'not set'}", f"release_status: {f.status}", f"readiness: {f.readiness}",
               f"linked_bugs: {f.linked_bugs}", f"open_bugs: {f.open_total}", f"open_critical: {sev.get('critical', 0)}",
               f"open_high: {sev.get('high', 0)}", f"open_medium: {sev.get('medium', 0)}", f"open_low: {sev.get('low', 0)}",
               f"pass_rate: {'none' if f.pass_rate is None else f'{f.pass_rate}%'}", f"linked_runs: {f.linked_runs}",
               f"runs_in_progress: {f.runs_in_progress}"]
    return [
        block("release_name", f.name), block("release_numbers", "\n".join(numbers)), block("readiness_reasons", "\n".join(f.reasons)),
        block("open_critical_and_high_bugs", "\n".join(f"{b.key} ({b.severity}, {b.status}): {b.title}" for b in f.bugs)),
        block("test_runs", "\n".join(f"{r.name} ({r.status}): {_rate(r.pass_rate)}" for r in f.runs)),
    ]


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def from_blocks(blocks: list[Block] | tuple[Block, ...]) -> Facts:
    """The mock reads the facts back from the blocks it was given, like a model would."""
    by = {b.tag: b.text for b in blocks}
    num = dict(ln.split(": ", 1) for ln in _lines(by.get("release_numbers", "")) if ": " in ln)

    def count(key: str) -> int:
        return int(num.get(key, "0") or 0)

    rate = num.get("pass_rate", "none")
    bugs = []
    for ln in _lines(by.get("open_critical_and_high_bugs", "")):
        head, _, title = ln.partition("): ")
        key, _, rest = head.partition(" (")
        severity, _, status = rest.partition(", ")
        bugs.append(BugFact(key, title, severity, status))
    runs = []
    for ln in _lines(by.get("test_runs", "")):
        head, _, value = ln.rpartition("): ")
        name, _, status = head.rpartition(" (")
        runs.append(RunFact(name=name, status=status, pass_rate=None if value.startswith("no") else int(value.rstrip("%"))))
    return Facts(
        name=by.get("release_name", ""), target_date=None if num.get("target_date", "not set") == "not set" else num["target_date"],
        status=num.get("release_status", "planned"), readiness=num.get("readiness", "at_risk"),
        reasons=_lines(by.get("readiness_reasons", "")), linked_bugs=count("linked_bugs"), open_total=count("open_bugs"),
        open_by_severity={s: count(f"open_{s}") for s in ("critical", "high", "medium", "low")},
        pass_rate=None if rate == "none" else int(rate.rstrip("%")), linked_runs=count("linked_runs"),
        runs_in_progress=count("runs_in_progress"), bugs=bugs, runs=runs)


# The template (mock and fallback) --------------------------------------------------------------------------------------------------------

def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def template(f: Facts) -> dict[str, object]:
    """A plain English summary built only from the facts. Same shape as the model's answer."""
    lead = {"blocked": "Do not ship yet", "at_risk": "Ship only with caution", "ready": "Ready to ship"}.get(f.readiness, "Check readiness")
    first = f.reasons[0] if f.reasons else ""
    headline = f"{lead}: {first[:1].lower()}{first[1:]}" if first else lead
    sev = f.open_by_severity
    parts = [f"{f.name} has {_plural(f.linked_bugs, 'linked bug')}, {f.open_total} still open."]
    urgent = [f"{_plural(sev.get('critical', 0), 'Critical bug')}"] if sev.get("critical") else []
    if sev.get("high"):
        urgent.append(_plural(sev["high"], "High bug"))
    if urgent:
        parts.append(f"Open: {' and '.join(urgent)}.")
    if f.pass_rate is None:
        parts.append("No test result has been decided yet." if f.linked_runs else "No test runs are linked.")
    else:
        parts.append(f"The linked test runs are {f.pass_rate}% passed.")
    if f.runs_in_progress:
        parts.append(f"{_plural(f.runs_in_progress, 'run')} still in progress.")
    if f.target_date:
        parts.append(f"The target date is {f.target_date}.")
    risks = [f"{b.key}: {b.title} ({b.severity.capitalize()}, {b.status.replace('_', ' ')})"[:RISK_MAX] for b in f.bugs]
    risks += [r[:RISK_MAX] for r in f.reasons if r not in risks]
    return {"headline": headline[:HEADLINE_MAX], "summary": " ".join(parts)[:SUMMARY_MAX], "top_risks": risks[:RISKS],
            "recommendation": recommendation_for(f.readiness)}
