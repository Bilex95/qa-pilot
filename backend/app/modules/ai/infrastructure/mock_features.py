"""The mock answers of the I-15 features (AI_SPEC 3.1 and 3.2): plain rules over the tagged blocks, so tests repeat and the offline demo
looks real. Registered when this module is imported (the features service imports it)."""

from collections.abc import Sequence
from typing import Any

from app.modules.ai.domain import heuristics
from app.modules.ai.domain.prompt import Block
from app.modules.ai.infrastructure.mock import register_mock


def _by_tag(blocks: Sequence[Block]) -> dict[str, str]:
    return {b.tag: b.text for b in blocks}


def _names(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _match(hint: str | None, names: list[str]) -> str | None:
    """The project's own name that the hint points at (a name that contains it, in any case), or none."""
    if not hint:
        return None
    return next((n for n in names if hint.lower() in n.lower()), None)


def bug_writer(blocks: Sequence[Block]) -> dict[str, Any]:
    tags = _by_tag(blocks)
    notes, log = tags.get("bug_notes", ""), tags.get("log", "")
    text = f"{notes}\n{log}"
    components = _names(tags.get("project_components", ""))
    lowered = notes.lower()
    component = next((c for c in components if c.lower() in lowered), None)
    title = heuristics.first_sentence(notes, 120)
    steps = heuristics.steps_from(notes) or [title]
    missing = []
    if len(steps) < 2:
        missing.append("What are the exact steps to reproduce it?")
    if not heuristics.environment_hint(text):
        missing.append("In which environment did it happen?")
    return {
        "title": title if len(title) >= 5 else f"{title} (needs a clearer title)",
        "description": notes[:4000], "steps_to_reproduce": steps,
        "expected_result": "", "actual_result": heuristics.first_sentence(log or notes, 300),
        "environment": _match(heuristics.environment_hint(text), _names(tags.get("project_environments", ""))),
        "component": component, "suggested_severity": heuristics.severity_for(text), "missing_information": missing,
    }


def explain_log(blocks: Sequence[Block]) -> dict[str, Any]:
    log = _by_tag(blocks).get("log", "")
    lines = heuristics.error_lines(log)
    kind = heuristics.first_exception(log)
    summary = (f"The log shows a {kind}." if kind else "The log shows an error." if lines else "The log shows no error line.")
    return {
        "summary": summary + (f" The first error line is: {lines[0][:200]}" if lines else ""),
        "likely_cause": f"Look at the code that raises {kind}, and at what happened just before the first error line." if kind else "",
        "key_lines": lines, "error_type": kind,
    }


def triage(blocks: Sequence[Block]) -> dict[str, Any]:
    """AI_SPEC 3.3: the keyword severity, the priority that goes with it (one level up on prod), the first component named in the text."""
    tags = _by_tag(blocks)
    text = "\n".join(tags.get(t, "") for t in ("bug_title", "bug_description", "bug_steps", "bug_actual_result"))
    environment = tags.get("bug_environment", "").strip() or heuristics.environment_hint(text)
    severity = heuristics.severity_for(text)
    keywords = heuristics.severity_keywords(text)
    lowered = text.lower()
    component = next((c for c in _names(tags.get("project_components", "")) if c.lower() in lowered), None)
    reason = (f"Matched {', '.join(repr(k) for k in keywords)}, so the impact looks {severity}." if keywords
              else "No severity keyword was found, so it is rated medium.")
    if environment and environment.lower() in ("prod", "production"):
        reason += " It happens in production, so the fix is more urgent."
    if component:
        reason += f" The text names the {component} component."
    return {"severity": severity, "priority": heuristics.priority_for(severity, environment), "component": component, "reason": reason,
            "confidence": "medium" if keywords else "low"}


def _criteria(story: str) -> list[str]:
    """Acceptance criteria of a story: the bulleted, numbered or Given lines; else its sentences (at most five)."""
    lines = [ln.strip() for ln in story.splitlines() if ln.strip()]
    marked = [heuristics.LIST_MARK.sub("", ln).strip() for ln in lines if heuristics.LIST_MARK.match(ln) or ln.lower().startswith("given")]
    found = marked or [s.strip() for s in heuristics.SENTENCE_END.split(" ".join(lines)) if len(s.strip()) >= 5]
    return [c for c in found if c][:5] or [story.strip()[:200]]


def _case(title: str, kind: str, action: str, expected: str, priority: str, tags: list[str], pre: str = "") -> dict[str, Any]:
    return {"title": title[:200], "case_type": kind, "preconditions": pre, "priority": priority, "tags": tags[:5],
            "steps": [{"action": action[:500], "expected": expected}]}


def test_cases(blocks: Sequence[Block]) -> dict[str, Any]:
    """AI_SPEC 3.5: a positive case per criterion, two fixed negative and two fixed edge cases, taken in turn so every type is there."""
    tags = _by_tag(blocks)
    story, count = tags.get("story", ""), int(tags.get("case_count", "8") or 8)
    area = [n.lower() for n in _names(tags.get("project_components", ""))[:1]]
    positive = [_case(f"Works: {c}", "positive", f"Do what the story describes: {c}", "The expected result is shown.", "p2",
                      ["smoke", *area], "The user is signed in.") for c in _criteria(story)]
    negative = [_case("Empty input is rejected", "negative", "Submit the form with every field empty",
                      "A clear error is shown and nothing is saved", "p2", ["validation", *area]),
                _case("Invalid format is rejected", "negative", "Enter a value in the wrong format and submit",
                      "The field shows an error and nothing is saved", "p3", ["validation", *area])]
    edge = [_case("Maximum length input is accepted", "edge", "Enter the longest allowed value and submit",
                  "The value is saved and shown in full", "p3", ["limits", *area]),
            _case("Special characters are handled", "edge", "Enter quotes, angle brackets and emoji and submit",
                  "The text is saved and shown as typed", "p4", ["limits", *area])]
    ordered = [c for group in zip(positive, negative, edge, strict=False) for c in group]  # one of each type first
    ordered += [c for c in (*positive, *negative, *edge) if c not in ordered]
    notes = f"{len(positive)} acceptance criteria became positive cases, plus negative and edge checks."
    return {"cases": ordered[:count], "coverage_notes": notes}


register_mock("test_cases", test_cases)
register_mock("bug_writer", bug_writer)
register_mock("triage", triage)
register_mock("explain_log", explain_log)
