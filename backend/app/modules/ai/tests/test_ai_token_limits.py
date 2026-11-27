"""Output token limits per feature (D-088): the table, the generator scaling, what `service.run` hands to the provider, and a cut answer
ending in the manual fallback. Capturing fakes only; no live call."""

from pathlib import Path

import pytest
from pydantic import BaseModel

from app.modules.ai.application import features, service
from app.modules.ai.domain import prompt
from app.modules.ai.domain.provider import ProviderResult
from app.modules.ai.domain.rules import (
    FEATURES,
    MAX_TOKENS,
    TEST_CASES_TOKENS_CAP,
    SlidingWindow,
    max_tokens_for,
)

OLD_LIMITS = {"bug_writer": 1200, "explain_log": 600, "triage": 400, "release_summary": 800, "test_cases": 3000}
TABLE = {"bug_writer": 384, "explain_log": 384, "triage": 256, "release_summary": 384}


class Answer(BaseModel):
    summary: str


class Capture:
    name, model = "mock", "capture-1"

    def __init__(self, *answers: str) -> None:
        self.answers, self.seen = list(answers), []

    def complete_json(self, *, feature, system, blocks, output_model, max_tokens, correction=None):  # type: ignore[no-untyped-def]
        self.seen.append(max_tokens)
        return ProviderResult(raw_text=self.answers.pop(0), input_tokens=5, output_tokens=5, model=self.model)


def test_the_table_is_what_was_decided_and_never_above_the_old_values() -> None:
    assert MAX_TOKENS == TABLE
    for feature, limit in TABLE.items():
        assert limit >= 256 and limit % 64 == 0 and limit <= OLD_LIMITS[feature]
        assert max_tokens_for(feature) == limit


@pytest.mark.parametrize(("count", "limit"), [(1, 608), (2, 1088), (3, 1568), (4, 2048), (5, 2528), (6, 3000), (15, 3000)])
def test_the_generator_limit_scales_with_the_count_and_respects_the_cap(count, limit) -> None:
    assert max_tokens_for("test_cases", count) == limit <= TEST_CASES_TOKENS_CAP == OLD_LIMITS["test_cases"]


def test_every_model_feature_has_a_limit() -> None:
    for feature in FEATURES:
        if feature != "duplicates":  # the duplicate check is local
            assert max_tokens_for(feature, 3) > 0


@pytest.mark.parametrize("feature", ["bug_writer", "explain_log", "triage", "release_summary", "test_cases"])
def test_service_run_hands_the_feature_limit_to_the_provider(db, world, feature) -> None:
    capture = Capture('{"summary": "ok"}')
    count = 3 if feature == "test_cases" else 1
    service.run(db, world.a.org, world.a.users["qa_engineer"].id, feature=feature, task="t", blocks=[prompt.block("bug_notes", "x")],
                output_model=Answer, fallback=Answer(summary=""), max_tokens=max_tokens_for(feature, count), provider=capture,
                window=SlidingWindow(1000))
    assert capture.seen == [max_tokens_for(feature, count)] and capture.seen[0] == (1568 if feature == "test_cases" else TABLE[feature])


def test_the_feature_functions_read_the_limit_from_the_table() -> None:
    source = Path(features.__file__).read_text(encoding="utf-8")
    assert "max_tokens=" in source and not any(f"max_tokens={n}" in source for n in (400, 600, 800, 1200, 3000))


@pytest.mark.parametrize("cut", ['{"summary": "cut off in the mid', '{"summary": ', "", "```json\n{"])
def test_a_truncated_answer_is_retried_once_and_ends_in_the_manual_fallback(db, world, cut) -> None:
    capture = Capture(cut, cut)
    fallback = Answer(summary="manual")
    got = service.run(db, world.a.org, world.a.users["qa_engineer"].id, feature="triage", task="t", blocks=[prompt.block("bug_notes", "x")],
                      output_model=Answer, fallback=fallback, max_tokens=256, provider=capture, window=SlidingWindow(1000))
    assert got.status == "invalid_output" and got.fallback and got.value == fallback and capture.seen == [256, 256]


def test_a_truncated_first_answer_followed_by_a_valid_one_is_accepted(db, world) -> None:
    capture = Capture('{"summary": "cut', '{"summary": "whole"}')
    got = service.run(db, world.a.org, world.a.users["qa_engineer"].id, feature="triage", task="t", blocks=[prompt.block("bug_notes", "x")],
                      output_model=Answer, fallback=Answer(summary="manual"), max_tokens=256, provider=capture, window=SlidingWindow(1000))
    assert got.status == "ok" and not got.fallback and got.value.summary == "whole"
