"""Shared Pydantic types."""

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
_EMAIL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@" + _LABEL + r"(?:\." + _LABEL + r")+$")


def _email(v: str) -> str:
    v = v.strip().lower()
    if len(v) > 254 or not _EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address.")
    return v


# Plain syntax check (no deliverability or special use domain rules, so .test addresses work in seed data)
Email = Annotated[str, StringConstraints(min_length=3, max_length=254), AfterValidator(_email)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")


class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, object] | list[object]


class ErrorResponse(BaseModel):
    error: ErrorBody


ERRORS = {
    400: {"model": ErrorResponse, "description": "Bad request"},
    401: {"model": ErrorResponse, "description": "Not signed in"},
    403: {"model": ErrorResponse, "description": "Role not allowed"},
    404: {"model": ErrorResponse, "description": "Not found, or not a member of the org"},
    409: {"model": ErrorResponse, "description": "Conflict"},
    410: {"model": ErrorResponse, "description": "Gone"},
    422: {"model": ErrorResponse, "description": "Validation error"},
    429: {"model": ErrorResponse, "description": "Rate limited"},
}


def errors(*codes: int) -> dict[int | str, dict[str, object]]:
    return {c: ERRORS[c] for c in codes}
