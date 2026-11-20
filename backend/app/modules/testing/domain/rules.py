"""Test suite and test case vocabulary and rules that do not touch the database (DOMAIN_MODEL 1.4, D-031)."""

import re
import uuid
from typing import Literal

CaseType = Literal["positive", "negative", "edge"]  # REQ-047, DOMAIN_MODEL 1.4
Priority = Literal["p1", "p2", "p3", "p4"]

CASE_TYPES: tuple[str, ...] = ("positive", "negative", "edge")
PRIORITIES: tuple[str, ...] = ("p1", "p2", "p3", "p4")
DEFAULT_PRIORITY = "p3"
DEFAULT_CASE_TYPE = "positive"

MIN_STEPS = 1
MAX_STEPS = 50  # also the bulk limit for cases per request
MAX_BULK_CASES = 50
MAX_TAGS = 20
MAX_TAG_LENGTH = 30

CASE_KEY_PREFIX = "TC"
CASE_KEY_RE = re.compile(rf"^{CASE_KEY_PREFIX}-(\d{{1,9}})$", re.IGNORECASE)


def case_key(number: int) -> str:
    return f"{CASE_KEY_PREFIX}-{number}"


def parse_case_ref(ref: str) -> tuple[uuid.UUID | None, int | None]:
    """A case reference is a UUID or a key like TC-103. Returns (uuid, None), (None, number) or (None, None)."""
    try:
        return uuid.UUID(ref), None
    except ValueError:
        pass
    match = CASE_KEY_RE.match(ref)
    return (None, int(match.group(1))) if match else (None, None)


def normalise_tags(tags: list[str]) -> list[str]:
    """Trimmed, lower case, without blanks or repeats, in the order given."""
    seen: dict[str, None] = {}
    for tag in tags:
        value = tag.strip().lower()
        if value:
            seen.setdefault(value, None)
    return list(seen)
