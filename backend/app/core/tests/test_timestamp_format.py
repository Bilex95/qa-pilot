"""BL-041: every timestamp the API sends has one fixed width format, `YYYY-MM-DDTHH:MM:SS.ffffffZ` in UTC.

Pydantic alone writes `...:01Z` when the microsecond is exactly 0 and `...:01.500000Z` otherwise. As text, `Z` sorts after `.`,
so a client that sorts or compares the strings put a whole second moment after a later one (Newman failure on `main`,
CI run 46010951819). The API level check, through a real endpoint, is in bugs/tests/test_activity_api.py."""

import re
from datetime import UTC, datetime, timedelta, timezone

import pytest
from pydantic import BaseModel

from app.core.schemas import ApiModel, iso_utc

WIRE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")


@pytest.mark.parametrize("microsecond", [0, 1, 100, 500_000, 120_000, 999_999])
def test_the_format_is_fixed_width_for_every_microsecond(microsecond: int) -> None:
    text = iso_utc(datetime(2026, 11, 27, 13, 57, 1, microsecond, tzinfo=UTC))
    assert WIRE.match(text), text
    assert text == f"2026-11-27T13:57:01.{microsecond:06d}Z"


def test_text_order_equals_time_order_across_the_whole_second() -> None:
    base = datetime(2026, 11, 27, 13, 57, 1, tzinfo=UTC)
    moments = [base + timedelta(microseconds=us) for us in (0, 1, 100, 120_000, 500_000, 999_999)] + [base + timedelta(seconds=1)]
    texts = [iso_utc(m) for m in moments]
    assert texts == sorted(texts)  # the old output put "...:01Z" after "...:01.500000Z"


def test_another_zone_is_converted_and_a_naive_value_is_taken_as_utc() -> None:
    assert iso_utc(datetime(2026, 11, 27, 15, 57, 1, 5, tzinfo=timezone(timedelta(hours=2)))) == "2026-11-27T13:57:01.000005Z"
    assert iso_utc(datetime(2026, 11, 27, 13, 57, 1)) == "2026-11-27T13:57:01.000000Z"


class _Out(ApiModel):
    at: datetime
    maybe: datetime | None = None


def test_api_models_use_the_format_in_json_and_json_mode_dumps() -> None:
    whole = datetime(2026, 11, 27, 13, 57, 1, tzinfo=UTC)
    out = _Out(at=whole, maybe=None)
    assert out.model_dump(mode="json") == {"at": "2026-11-27T13:57:01.000000Z", "maybe": None}
    assert out.model_dump_json() == '{"at":"2026-11-27T13:57:01.000000Z","maybe":null}'
    assert _Out(at=whole, maybe=whole.replace(microsecond=5)).model_dump(mode="json")["maybe"] == "2026-11-27T13:57:01.000005Z"


def test_the_format_survives_a_page_wrapper_and_python_mode_keeps_datetimes() -> None:
    class _Page(BaseModel):
        items: list[_Out]

    whole = datetime(2026, 11, 27, 13, 57, 1, tzinfo=UTC)
    page = _Page(items=[_Out(at=whole)])
    assert page.model_dump(mode="json")["items"][0]["at"] == "2026-11-27T13:57:01.000000Z"
    assert page.model_dump()["items"][0]["at"] == whole  # only the JSON output changes, not the Python value
