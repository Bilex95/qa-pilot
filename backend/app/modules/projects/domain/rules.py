"""Project rules that do not need the database (I-01)."""

import re
from typing import Literal, get_args

# Colour names are tokens from design/TOKENS.md. The approved design draws every chip neutral, so the colour is
# stored and validated now and rendered later (docs/BACKLOG.md: coloured label chips).
LabelColor = Literal["neutral", "primary", "sev-critical", "sev-high", "sev-medium", "sev-low", "ok", "warn",
                     "danger", "info"]
LABEL_COLORS: tuple[str, ...] = get_args(LabelColor)
DEFAULT_LABEL_COLOR: LabelColor = "neutral"
KEY_RE = re.compile(r"^[A-Z]{2,6}$")
DEFAULT_ENVIRONMENTS = ("dev", "staging", "prod")


def normalise_key(key: str) -> str:
    return key.strip().upper()


def key_problem(key: str) -> str | None:
    if not KEY_RE.match(key):
        return "Use 2 to 6 letters, for example WEB. They become the start of every bug id, like WEB-42."
    return None
