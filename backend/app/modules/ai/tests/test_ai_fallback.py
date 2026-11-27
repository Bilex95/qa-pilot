"""Retry once, then fall back to a second provider, and record who answered (D-085). Fake providers and fake HTTP servers only; the clock and
the sleep are injected so nothing waits. No live call, no real key."""

import logging
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
from typing import Literal

import httpx
import pytest
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import Settings
from app.modules.ai.application import service
from app.modules.ai.domain import prompt
from app.modules.ai.domain.provider import ProviderError, ProviderResult, ProviderTimeout, ProviderUnavailable
from app.modules.ai.domain.rules import SlidingWindow
from app.modules.ai.infrastructure import factory, repository
from app.modules.ai.infrastructure.chain import ChainState, FallbackProvider
from app.modules.ai.infrastructure.gemini_provider import GeminiProvider
from app.modules.ai.infrastructure.http_json import _retry_after
from app.modules.ai.infrastructure.mock import MockProvider
from app.modules.ai.infrastructure.models import AIUsage
from app.modules.ai.infrastructure.openai_compatible_provider import OpenAICompatibleProvider
from app.modules.ai.tests.test_ai_rest_providers import KEY, Fake, call, make_compat, make_gemini, openai_body

VALID = '{"severity": "high", "summary": "Checkout total is wrong"}'


class Answer(BaseModel):
    severity: Literal["low", "high"]
    summary: str


FALLBACK = Answer(severity="low", summary="")


class Clock:
    """A monotonic clock that only moves when told to; `sleep` records the wait and moves it."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


class Scripted:
    """A provider that answers from a list: a string is a raw answer, an exception is raised, a number moves the clock first."""

    def __init__(self, name: str, clock: Clock, *script: str | Exception, takes: float = 0.0) -> None:
        self.name, self.model = name, f"{name}-model"
        self.script = list(script)
        self.clock = clock
        self.takes = takes
        self.calls = 0

    def complete_json(self, *, feature, system, blocks, output_model, max_tokens, correction=None):  # type: ignore[no-untyped-def]
        self.calls += 1
        self.clock.now += self.takes
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return ProviderResult(raw_text=item, input_tokens=10, output_tokens=5, model=self.model)


def unavailable(reason: str, retry_after: float | None = None) -> ProviderUnavailable:
    return ProviderUnavailable("down", reason=reason, retry_after=retry_after)


def permanent(status: int) -> ProviderError:
    return ProviderError(f"The AI provider failed (HTTP {status}).", reason=f"http_{status}")


def chain(clock: Clock, primary: Scripted, secondary: Scripted) -> FallbackProvider:
    return FallbackProvider(primary, secondary, state=ChainState(), clock=clock, sleep=clock.sleep, jitter=lambda: 0.0)


def go(provider) -> ProviderResult:  # type: ignore[no-untyped-def]
    return provider.complete_json(feature="triage", system="s", blocks=[prompt.block("bug_notes", "x")], output_model=Answer, max_tokens=64)


def ask(db, world, provider):  # type: ignore[no-untyped-def]
    return service.run(db, world.a.org, world.a.users["qa_engineer"].id, feature="triage", task="Suggest a severity.",
                       blocks=[prompt.block("bug_notes", "Total is wrong")], output_model=Answer, fallback=FALLBACK, provider=provider,
                       window=SlidingWindow(1000))


def rows(db, world):  # type: ignore[no-untyped-def]
    return list(db.scalars(select(AIUsage).where(AIUsage.org_id == world.a.org.id).order_by(AIUsage.created_at, AIUsage.id)))


# The chain ---------------------------------------------------------------------------------------------------------------------------------

def test_a_503_is_retried_once_on_the_same_provider_after_the_backoff() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), VALID), Scripted("openai_compatible", c)
    got = go(chain(c, p, s))
    assert (got.provider, got.attempts, got.fallback_reason) == ("gemini", 2, None) and (p.calls, s.calls) == (2, 0)
    assert c.sleeps == [1.5]


def test_the_backoff_adds_the_jitter_and_stays_under_the_cap() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), VALID), Scripted("openai_compatible", c)
    go(FallbackProvider(p, s, state=ChainState(), clock=c, sleep=c.sleep, jitter=lambda: 0.5))
    assert c.sleeps == [1.75]


def test_two_503s_go_to_the_secondary_which_answers_with_the_reason_and_three_attempts() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503")), Scripted("openai_compatible", c, VALID)
    got = go(chain(c, p, s))
    assert (got.provider, got.attempts, got.fallback_reason, got.model) == ("openai_compatible", 3, "http_503", "openai_compatible-model")
    assert (p.calls, s.calls) == (2, 1) and len(c.sleeps) == 1


@pytest.mark.parametrize(("header", "waited"), [(3, 3.0), (0, 0.0), (2.5, 2.5), (12, 12.0), (30, 30.0)])
@pytest.mark.parametrize("reason", ["http_429", "http_503"])
def test_a_retry_after_is_waited_exactly_with_no_five_second_cap(header, waited, reason) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable(reason, header), VALID), Scripted("openai_compatible", c)
    got = go(chain(c, p, s))
    assert c.sleeps == [waited] and got.attempts == 2 and got.provider == "gemini"


def test_a_wait_that_just_fits_the_budget_is_honoured() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_429", 50), VALID, takes=0), Scripted("openai_compatible", c)
    got = go(chain(c, p, s))  # 0 elapsed + 50 wait + 10 reserve = 60, which fits
    assert c.sleeps == [50.0] and got.provider == "gemini" and got.attempts == 2


def test_a_wait_that_does_not_fit_the_budget_skips_the_retry_and_falls_back_at_once() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_429", 51)), Scripted("openai_compatible", c, VALID)
    got = go(chain(c, p, s))  # 51 + 10 > 60
    assert c.sleeps == [] and (p.calls, s.calls) == (1, 1)
    assert (got.provider, got.attempts, got.fallback_reason) == ("openai_compatible", 2, "http_429")


def test_the_elapsed_time_counts_against_the_budget_when_deciding_to_wait() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503", 20), takes=35), Scripted("openai_compatible", c, VALID)
    got = go(chain(c, p, s))  # 35 elapsed + 20 + 10 > 60
    assert c.sleeps == [] and got.provider == "openai_compatible" and got.fallback_reason == "http_503"


def test_a_wait_that_does_not_fit_with_no_other_provider_raises_with_the_reason() -> None:
    c = Clock()
    p = Scripted("gemini", c, unavailable("http_503", 90))
    with pytest.raises(ProviderError) as caught:
        go(lone(c, p))
    assert c.sleeps == [] and p.calls == 1 and caught.value.reasons == "http_503"


def test_the_default_backoff_applies_when_there_is_no_retry_after() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_429", None), VALID), Scripted("openai_compatible", c)
    go(chain(c, p, s))
    assert c.sleeps == [1.5]


@pytest.mark.parametrize(("retry_after", "seconds"), [(None, 30.0), (5, 30.0), (30, 30.0), (60, 60.0), (120, 120.0), (500, 120.0)])
def test_the_cool_down_is_the_longer_of_thirty_seconds_and_retry_after_capped_at_120(retry_after, seconds) -> None:
    c = Clock()
    p = Scripted("gemini", c, unavailable("http_429", retry_after), unavailable("http_429", retry_after))
    s = Scripted("openai_compatible", c, VALID, VALID)
    provider = chain(c, p, s)
    go(provider)
    state = provider._state  # the secondary answered without taking time, so the clock is still where the primary failed
    assert state.down_until == pytest.approx(c.now + seconds)
    assert state.cooling(state.down_until - 0.01) and not state.cooling(state.down_until + 0.01)


def test_two_429s_fall_back() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_429"), unavailable("http_429")), Scripted("openai_compatible", c, VALID)
    got = go(chain(c, p, s))
    assert (got.provider, got.attempts, got.fallback_reason) == ("openai_compatible", 3, "http_429")


@pytest.mark.parametrize("failure", [ProviderTimeout("slow"), ProviderUnavailable("refused", reason="connection", retry_same=False)])
def test_a_timeout_or_a_connection_error_goes_to_the_next_provider_at_once(failure) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, failure), Scripted("openai_compatible", c, VALID)
    got = go(chain(c, p, s))
    assert (got.provider, got.attempts, got.fallback_reason) == ("openai_compatible", 2, failure.reason)
    assert (p.calls, s.calls) == (1, 1) and c.sleeps == []


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_a_permanent_error_is_not_retried_and_falls_back_with_one_admin_warning(status, caplog) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, permanent(status), permanent(status)), Scripted("openai_compatible", c, VALID, VALID)
    provider = chain(c, p, s)
    with caplog.at_level(logging.DEBUG, logger="app.ai"):
        got = go(provider)
    assert (got.provider, got.attempts, got.fallback_reason) == ("openai_compatible", 2, f"http_{status}") and c.sleeps == []
    warnings = [r for r in caplog.records if r.name == "app.ai" and r.levelno == logging.WARNING]
    assert len(warnings) == 1
    text = warnings[0].getMessage()
    assert "gemini" in text and f"http_{status}" in text and "GEMINI_MODEL" in text and "GEMINI_API_KEY" in text and "openai_compatible" in text
    assert KEY not in caplog.text and "http://" not in caplog.text


def test_the_admin_warning_is_rate_limited_to_once_per_provider_and_reason_per_ten_minutes(caplog) -> None:
    c = Clock()
    state = ChainState()
    p = Scripted("gemini", c, *[permanent(404)] * 3)
    s = Scripted("openai_compatible", c, VALID, VALID, VALID)
    provider = FallbackProvider(p, s, state=state, clock=c, sleep=c.sleep, jitter=lambda: 0.0)
    with caplog.at_level(logging.WARNING, logger="app.ai"):
        go(provider)
        c.now += 31  # past the cool-down, so the primary is asked again
        go(provider)
        assert len(caplog.records) == 1
        c.now += 601
        go(provider)
    assert len(caplog.records) == 2


def test_a_transient_failure_does_not_warn_the_admin(caplog) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503")), Scripted("openai_compatible", c, VALID)
    with caplog.at_level(logging.DEBUG, logger="app.ai"):
        go(chain(c, p, s))
    assert not [r for r in caplog.records if r.levelno >= logging.WARNING]


def test_when_everything_fails_the_last_error_is_raised_with_the_attempts_and_reasons() -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503")), Scripted("openai_compatible", c, unavailable("http_429"),
                                                                                           unavailable("http_429"))
    with pytest.raises(ProviderError) as caught:
        go(chain(c, p, s))
    assert (caught.value.attempts, caught.value.reasons) == (4, "http_503>http_429")


def test_the_budget_of_sixty_seconds_stops_the_chain_and_raises_the_last_error() -> None:
    c = Clock()
    p = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503"), takes=40)
    s = Scripted("openai_compatible", c, VALID)
    with pytest.raises(ProviderError) as caught:
        go(chain(c, p, s))
    assert (p.calls, s.calls) == (2, 0) and caught.value.reasons == "http_503"


def test_the_cool_down_skips_the_failed_primary_for_thirty_seconds_then_asks_it_again() -> None:
    c = Clock()
    p = Scripted("gemini", c, permanent(404), VALID)
    s = Scripted("openai_compatible", c, VALID, VALID, VALID)
    provider = chain(c, p, s)
    go(provider)
    c.now += 10
    got = go(provider)
    assert (p.calls, s.calls, got.provider, got.attempts, got.fallback_reason) == (1, 2, "openai_compatible", 1, "http_404")
    c.now += 25  # 35 seconds after the failure
    got = go(provider)
    assert (p.calls, got.provider, got.fallback_reason) == (2, "gemini", None)
    assert go_state_clear(provider)  # the primary is trusted again


def test_the_primary_is_tried_once_anyway_when_the_secondary_fails_during_the_cool_down() -> None:
    c = Clock()
    p = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503"), VALID)
    s = Scripted("openai_compatible", c, VALID, unavailable("http_500"), unavailable("http_500"))
    provider = chain(c, p, s)
    go(provider)  # the primary is now cooling down
    got = go(provider)  # the secondary fails (retried once), then the primary is probed once
    assert (got.provider, p.calls, s.calls) == ("gemini", 3, 3) and got.fallback_reason is None
    assert go_state_clear(provider)


def go_state_clear(provider: FallbackProvider) -> bool:
    return not provider._state.cooling(provider._clock())


def test_invalid_json_from_the_primary_is_not_an_availability_problem_and_never_reaches_the_secondary(db, world) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, "not json", "still not json"), Scripted("openai_compatible", c, VALID)
    got = ask(db, world, chain(c, p, s))
    assert got.status == "invalid_output" and got.fallback and (p.calls, s.calls) == (2, 0)
    (row,) = rows(db, world)
    assert (row.provider, row.attempts, row.fallback_reason) == ("gemini", 2, None)


# service.run records who answered -------------------------------------------------------------------------------------------------------------

def test_the_usage_row_names_who_answered_and_why_and_counts_one_call(db, world) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503")), Scripted("openai_compatible", c, VALID)
    got = ask(db, world, chain(c, p, s))
    assert got.status == "ok" and not got.fallback
    (row,) = rows(db, world)
    assert (row.provider, row.model, row.attempts, row.fallback_reason) == ("openai_compatible", "openai_compatible-model", 3, "http_503")
    assert repository.calls_since(db, world.a.org.id, row.created_at) == 1  # the daily limit counts the call, not the attempts


def test_when_every_provider_fails_one_error_row_names_the_primary_with_the_reasons_and_the_manual_fallback_is_served(db, world) -> None:
    c = Clock()
    p, s = Scripted("gemini", c, unavailable("http_503"), unavailable("http_503")), Scripted("openai_compatible", c, unavailable("http_429"),
                                                                                           unavailable("http_429"))
    got = ask(db, world, chain(c, p, s))
    assert got.fallback and got.value == FALLBACK and got.status == "error"
    (row,) = rows(db, world)
    assert (row.status, row.provider, row.attempts, row.fallback_reason) == ("error", "gemini", 4, "http_503>http_429")
    assert (row.input_tokens, row.output_tokens) == (0, 0)


def test_the_reasons_are_cut_to_the_column_width(db, world) -> None:
    error = ProviderError("down", reason="x")
    error.reasons = "a" * 40
    got = ask(db, world, Scripted("mock", Clock(), error))
    (row,) = rows(db, world)
    assert got.status == "error" and row.fallback_reason == "a" * 24


def test_a_single_provider_is_unchanged(db, world) -> None:
    got = ask(db, world, Scripted("mock", Clock(), VALID))
    (row,) = rows(db, world)
    assert got.status == "ok" and (row.provider, row.attempts, row.fallback_reason) == ("mock", 1, None)


# Real providers behind fake servers: nothing leaks ------------------------------------------------------------------------------------------

def test_real_providers_on_fake_servers_fall_back_and_the_key_never_appears_anywhere(db, world, caplog) -> None:
    g, o = Fake(), Fake()
    try:
        g.script = [(503, b"internal " + KEY.encode(), 0), (503, b"internal", 0)]
        o.script = [(200, openai_body(VALID), 0)]
        c = Clock()
        primary = GeminiProvider(KEY, "gemini-test", g.url, 5)
        secondary = OpenAICompatibleProvider(KEY, "model-test", o.url + "/v1", 5)
        with caplog.at_level(logging.DEBUG):
            got = ask(db, world, FallbackProvider(primary, secondary, state=ChainState(), clock=c, sleep=c.sleep, jitter=lambda: 0.0))
        assert got.status == "ok" and len(g.requests) == 2 and len(o.requests) == 1
        (row,) = rows(db, world)
        assert (row.provider, row.attempts, row.fallback_reason) == ("openai_compatible", 3, "http_503")
        assert KEY not in caplog.text and KEY not in repr([row.provider, row.model, row.fallback_reason])
    finally:
        g.close()
        o.close()


def test_a_permanent_http_error_on_a_fake_server_warns_without_the_key_or_url(db, world, caplog) -> None:
    g, o = Fake(), Fake()
    try:
        g.script = [(404, b"model " + KEY.encode() + b" not found", 0)]
        o.script = [(200, openai_body(VALID), 0)]
        c = Clock()
        with caplog.at_level(logging.DEBUG):
            ask(db, world, FallbackProvider(GeminiProvider(KEY, "gone", g.url, 5), OpenAICompatibleProvider(KEY, "m", o.url + "/v1", 5),
                                            state=ChainState(), clock=c, sleep=c.sleep))
        ours = " ".join(r.getMessage() for r in caplog.records if r.name == "app.ai")  # httpx itself logs request lines with the URL
        assert len(g.requests) == 1 and "http_404" in ours and KEY not in caplog.text and g.url not in ours
        (row,) = rows(db, world)
        assert row.fallback_reason == "http_404"
    finally:
        g.close()
        o.close()


@pytest.fixture
def fake():  # type: ignore[no-untyped-def]
    f = Fake()
    yield f
    f.close()


NOW = datetime(2026, 10, 21, 7, 28, 0, tzinfo=UTC)


@pytest.mark.parametrize(("value", "seconds"), [
    ("3", 3.0), (" 2.5 ", 2.5), ("0", 0.0), ("12.75", 12.75), ("", None), ("soon", None), ("-4", None), ("-0.5", None), ("1e3", None),
    ("nan", None), ("inf", None), ("Wed, 21 Oct 2026 07:28:30 GMT", 30.0), ("Wed, 21 Oct 2026 07:30:00 GMT", 120.0),
    ("Wed, 21 Oct 2026 07:27:00 GMT", None), ("Wed, 99 Foo 2026 07:28:00 GMT", None)])
def test_retry_after_is_read_as_seconds_or_an_http_date(value, seconds) -> None:
    assert _retry_after(httpx.Response(429, headers={"retry-after": value} if value else {}), NOW) == seconds


def test_a_missing_retry_after_header_is_none() -> None:
    assert _retry_after(httpx.Response(503)) is None


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
@pytest.mark.parametrize(("header", "seconds"), [("7", 7.0), ("1.5", 1.5), ("junk", None), ("-3", None)])
def test_a_fake_server_retry_after_is_parsed_without_leaking_the_value(fake, status, header, seconds, caplog) -> None:
    fake.headers = {"Retry-After": header}
    fake.script = [(status, b"slow down", 0)]
    with caplog.at_level(logging.DEBUG), pytest.raises(ProviderUnavailable) as caught:
        call(make_compat(fake.url))
    assert caught.value.retry_after == seconds and caught.value.reason == f"http_{status}"
    assert header not in str(caught.value) and f"retry-after: {header}" not in caplog.text.lower()


def test_a_fake_server_http_date_is_parsed(fake) -> None:
    future = format_datetime(datetime.now(UTC) + timedelta(seconds=40), usegmt=True)
    fake.headers = {"Retry-After": future}
    fake.script = [(429, b"x", 0)]
    with pytest.raises(ProviderUnavailable) as caught:
        call(make_gemini(fake.url))
    assert caught.value.retry_after is not None and 30 <= caught.value.retry_after <= 40
    assert future not in str(caught.value)


def test_the_header_is_ignored_on_a_permanent_error(fake) -> None:
    fake.headers = {"Retry-After": "9"}
    fake.script = [(404, b"gone", 0)]
    with pytest.raises(ProviderError) as caught:
        call(make_gemini(fake.url))
    assert not isinstance(caught.value, ProviderUnavailable)


# A single provider (D-087) -----------------------------------------------------------------------------------------------------------------

def lone(c: Clock, p: Scripted) -> FallbackProvider:
    return FallbackProvider(p, state=ChainState(), clock=c, sleep=c.sleep, jitter=lambda: 0.0)


def test_a_lone_provider_retries_a_503_once_and_records_no_fallback_reason() -> None:
    c = Clock()
    p = Scripted("gemini", c, unavailable("http_503"), VALID)
    got = go(lone(c, p))
    assert (got.provider, got.attempts, got.fallback_reason, p.calls) == ("gemini", 2, None, 2) and c.sleeps == [1.5]


def test_a_lone_provider_with_two_429s_ends_in_the_manual_fallback_with_one_usage_row(db, world) -> None:
    c = Clock()
    p = Scripted("gemini", c, unavailable("http_429"), unavailable("http_429"))
    got = ask(db, world, lone(c, p))
    assert got.status == "error" and got.fallback and p.calls == 2
    (row,) = rows(db, world)
    assert (row.status, row.provider, row.attempts, row.fallback_reason) == ("error", "gemini", 2, "http_429")


@pytest.mark.parametrize("failure", [ProviderTimeout("slow"), ProviderUnavailable("refused", reason="connection", retry_same=False)])
def test_a_lone_provider_does_not_retry_a_timeout_or_a_connection_error(failure) -> None:
    c = Clock()
    p = Scripted("gemini", c, failure)
    with pytest.raises(ProviderError):
        go(lone(c, p))
    assert p.calls == 1 and c.sleeps == []


def test_a_lone_provider_does_not_retry_a_permanent_error_and_warns_once(caplog) -> None:
    c = Clock()
    p = Scripted("gemini", c, permanent(404), permanent(404))
    provider = lone(c, p)
    with caplog.at_level(logging.WARNING, logger="app.ai"):
        for _ in range(2):
            with pytest.raises(ProviderError):
                go(provider)
    warnings = [r.getMessage() for r in caplog.records if r.name == "app.ai" and r.levelno == logging.WARNING]
    assert p.calls == 2 and c.sleeps == [] and len(warnings) == 1 and "No other provider is available" in warnings[0]


def test_a_lone_provider_has_no_cool_down() -> None:
    c = Clock()
    p = Scripted("gemini", c, permanent(404), VALID)
    provider = lone(c, p)
    with pytest.raises(ProviderError):
        go(provider)
    assert go(provider).provider == "gemini" and p.calls == 2


# The factory -------------------------------------------------------------------------------------------------------------------------------

BASE = {"jwt_secret": "x" * 40}


def settings(**kw):  # type: ignore[no-untyped-def]
    kw.setdefault("ai_fallback_provider", "")  # never read the process environment
    return Settings(gemini_api_key="g", openai_compat_api_key="o", openai_compat_base_url="http://h/v1", openai_compat_model="m",
                    ai_provider="gemini", **BASE, **kw)


def test_a_configured_different_fallback_wraps_the_primary(caplog) -> None:
    got = factory.get_provider(settings(ai_fallback_provider="openai_compatible"))
    assert isinstance(got, FallbackProvider) and (got.name, got.model) == ("gemini", "gemini-3.5-flash-lite")


def test_no_fallback_setting_gives_the_single_provider_in_a_retry_only_chain() -> None:
    got = factory.get_provider(settings())
    assert isinstance(got, FallbackProvider) and isinstance(got._primary, GeminiProvider) and got._secondary is None


@pytest.mark.parametrize(("kw", "words"), [({"ai_fallback_provider": "gemini"}, "same as AI_PROVIDER"),
                                           ({"ai_fallback_provider": "anthropic"}, "ANTHROPIC_API_KEY is empty")])
def test_a_fallback_equal_to_the_primary_or_unconfigured_is_ignored_with_one_warning(kw, words, caplog) -> None:
    factory._warned_fallback = False
    with caplog.at_level(logging.WARNING, logger="app.ai"):
        for _ in range(2):
            got = factory.get_provider(settings(**kw))
            assert isinstance(got, FallbackProvider) and got._secondary is None
    messages = [r.getMessage() for r in caplog.records if r.name == "app.ai"]
    assert len(messages) == 1 and words in messages[0]
    factory._warned_fallback = False


def test_the_mock_is_never_wrapped() -> None:
    got = factory.get_provider(Settings(ai_provider="mock", ai_fallback_provider="gemini", gemini_api_key="g", **BASE))
    assert isinstance(got, MockProvider)


def test_the_state_of_a_pair_of_providers_is_shared_by_every_call() -> None:
    a = factory.get_provider(settings(ai_fallback_provider="openai_compatible"))
    b = factory.get_provider(settings(ai_fallback_provider="openai_compatible"))
    assert isinstance(a, FallbackProvider) and isinstance(b, FallbackProvider) and a._state is b._state
