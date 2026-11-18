"""Project rules that do not need the database (I-01)."""

import re

KEY_RE = re.compile(r"^[A-Z]{2,6}$")
DEFAULT_ENVIRONMENTS = ("dev", "staging", "prod")


def normalise_key(key: str) -> str:
    return key.strip().upper()


def key_problem(key: str) -> str | None:
    if not KEY_RE.match(key):
        return "Use 2 to 6 letters, for example WEB. They become the start of every bug id, like WEB-42."
    return None
