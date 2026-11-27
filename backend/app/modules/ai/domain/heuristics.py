"""The plain rules behind the mock provider and the fallbacks (AI_SPEC 3.1 to 3.3): keyword severity, the first sentence, numbered steps,
error lines. No model, no I/O. Pure and deterministic."""

import re

CRITICAL = re.compile(r"crash|data loss|payment|security", re.IGNORECASE)
HIGH = re.compile(r"error|fail|500", re.IGNORECASE)
LOW = re.compile(r"typo|alignment", re.IGNORECASE)
ERROR_LINE = re.compile(r"error|exception|fatal", re.IGNORECASE)
EXCEPTION = re.compile(r"\b([A-Za-z_][\w.]*(?:Exception|Error))\b")
ENVIRONMENT = re.compile(r"\b(prod|staging|dev)\b", re.IGNORECASE)
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
LIST_MARK = re.compile(r"^\s*(?:\d+[.)]|[-*])\s*")


def severity_for(text: str) -> str:
    """critical for crash, data loss, payment or security; high for error, fail or 500; low for typo or alignment; else medium."""
    if CRITICAL.search(text):
        return "critical"
    if HIGH.search(text):
        return "high"
    if LOW.search(text):
        return "low"
    return "medium"


PRIORITY_FOR = {"critical": "p1", "high": "p2", "medium": "p3", "low": "p4"}
PRIORITY_ORDER = ("p1", "p2", "p3", "p4")


def severity_keywords(text: str) -> list[str]:
    """The words of the severity rule that decided `severity_for` (the rule of the highest level that matched), lower case, no repeats."""
    for pattern in (CRITICAL, HIGH, LOW):
        found = [m.group(0).lower() for m in pattern.finditer(text)]
        if found:
            return list(dict.fromkeys(found))
    return []


def priority_for(severity: str, environment: str | None) -> str:
    """The priority that goes with a severity (critical p1, high p2, medium p3, low p4), one level more urgent on prod."""
    level = PRIORITY_FOR.get(severity, "p3")
    if environment and environment.strip().lower() in ("prod", "production"):
        level = PRIORITY_ORDER[max(PRIORITY_ORDER.index(level) - 1, 0)]
    return level


def first_sentence(text: str, limit: int = 200) -> str:
    """The first sentence of the first non empty line, cut to `limit` characters."""
    line = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
    return SENTENCE_END.split(line, maxsplit=1)[0].strip()[:limit]


def steps_from(text: str, limit: int = 20, length: int = 500) -> list[str]:
    """Steps from the notes: the numbered or bulleted lines if there are any (a first line without a mark is the title, not a step),
    else every line, else the sentences of a single line."""
    lines = [ln for ln in text.splitlines() if ln.strip()]
    marked = [LIST_MARK.sub("", ln).strip() for ln in lines if LIST_MARK.match(ln)]
    if marked:
        parts = marked
    elif len(lines) > 1:
        parts = [ln.strip() for ln in lines]
    else:
        parts = [s.strip() for s in SENTENCE_END.split(lines[0])] if lines else []
    return [p[:length] for p in parts if p][:limit]


def environment_hint(text: str) -> str | None:
    found = ENVIRONMENT.search(text)
    return found.group(1).lower() if found else None


def error_lines(text: str, limit: int = 10) -> list[str]:
    """The lines that contain error, exception or fatal, first ten, trimmed."""
    return [ln.strip()[:300] for ln in text.splitlines() if ERROR_LINE.search(ln)][:limit]


def first_exception(text: str) -> str | None:
    found = EXCEPTION.search(text)
    return found.group(1) if found else None
