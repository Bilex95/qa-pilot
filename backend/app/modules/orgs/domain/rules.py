"""Org rules that do not need the database."""

import re

SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")
RESERVED_SLUGS = frozenset({"api", "admin", "login", "register", "invite", "forgot-password", "reset-password", "onboarding",
                            "o", "new", "settings"})


def slug_problem(slug: str) -> str | None:
    if len(slug) < 2 or not SLUG_RE.match(slug) or "--" in slug:
        return "Use 2 to 40 lowercase letters, numbers and single hyphens, starting and ending with a letter or number."
    if slug in RESERVED_SLUGS:
        return "This address is reserved. Choose another."
    return None


def mask_email(email: str) -> str:
    """t•••s@lumenfreight.test style masking for the public invitation preview."""
    local, _, domain = email.partition("@")
    dots = "•••"
    shown = local[:1] + dots if len(local) <= 2 else local[0] + dots + local[-1]
    return f"{shown}@{domain}"
