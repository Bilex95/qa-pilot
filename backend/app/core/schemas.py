"""Shared Pydantic types."""

import re
from datetime import UTC, datetime
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


def iso_utc(value: datetime) -> str:
    """One wire format for every timestamp: UTC, always six fractional digits, `Z` (BL-041).

    Pydantic's own output drops the fraction when the microsecond is exactly 0 (`...:01Z`) and keeps six digits
    otherwise (`...:01.500000Z`). Mixed lengths do not sort as text (`Z` is after `.`), so a client that compares
    the strings would see an earlier whole second timestamp as later. A fixed width makes text order equal time order.
    A value without a zone is taken as UTC (the database stores UTC)."""
    moment = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid", json_encoders={datetime: iso_utc})


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
    413: {"model": ErrorResponse, "description": "Payload too large"},
    415: {"model": ErrorResponse, "description": "Unsupported media type"},
    422: {"model": ErrorResponse, "description": "Validation error"},
    429: {"model": ErrorResponse, "description": "Rate limited"},
}


def errors(*codes: int) -> dict[int | str, dict[str, object]]:
    return {c: ERRORS[c] for c in codes}
