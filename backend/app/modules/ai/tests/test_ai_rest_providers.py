"""The Gemini and OpenAI compatible providers against a fake HTTP server on 127.0.0.1 (D-083). No network, no live call, no real key."""

import json
import logging
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Literal

import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.modules.ai.application import service
from app.modules.ai.domain import prompt
from app.modules.ai.domain.provider import ProviderError, ProviderTimeout
from app.modules.ai.domain.rules import SlidingWindow
from app.modules.ai.infrastructure import factory
from app.modules.ai.infrastructure.gemini_provider import GeminiProvider
from app.modules.ai.infrastructure.openai_compatible_provider import OpenAICompatibleProvider

KEY = "sk-test-SECRET-key-0123456789"
VALID = '{"severity": "high", "summary": "Checkout total is wrong"}'
BAD = '{"severity": "critical", "summary": "x"}'


class Answer(BaseModel):
    severity: Literal["low", "high"]
    summary: str


FALLBACK = Answer(severity="low", summary="")


class Fake:
    """A scripted server: each request takes the next (status, body, delay) and is recorded."""

    def __init__(self) -> None:
        self.script: list[tuple[int, bytes, float]] = []
        self.requests: list[dict] = []
        self.headers: dict[str, str] = {}  # extra response headers on every answer (for example Retry-After)
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:
                length = int(self.headers.get("content-length", "0"))
                outer.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()},
                                       "body": json.loads(self.rfile.read(length) or b"{}")})
                status, body, delay = outer.script.pop(0)
                time.sleep(delay)
                try:
                    self.send_response(status)
                    self.send_header("content-type", "application/json")
                    self.send_header("content-length", str(len(body)))
                    for name, value in outer.headers.items():
                        self.send_header(name, value)
                    self.end_headers()
                    self.wfile.write(body)
                except OSError:
                    pass  # the client gave up (the timeout test)

            def log_message(self, *args) -> None:  # type: ignore[no-untyped-def]
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()


@pytest.fixture
def fake():  # type: ignore[no-untyped-def]
    f = Fake()
    yield f
    f.close()


def gemini_body(text: str, tin: int = 11, tout: int = 7) -> bytes:
    return json.dumps({"candidates": [{"content": {"parts": [{"text": text}]}}],
                       "usageMetadata": {"promptTokenCount": tin, "candidatesTokenCount": tout}}).encode()


def openai_body(text: str, tin: int = 11, tout: int = 7) -> bytes:
    return json.dumps({"choices": [{"message": {"content": text}}], "usage": {"prompt_tokens": tin, "completion_tokens": tout}}).encode()


def make_gemini(url: str, timeout: float = 5) -> GeminiProvider:
    return GeminiProvider(KEY, "gemini-test", url, timeout)


def make_compat(url: str, timeout: float = 5) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(KEY, "model-test", url + "/openai/v1", timeout)


CASES = [pytest.param(make_gemini, gemini_body, id="gemini"), pytest.param(make_compat, openai_body, id="openai_compatible")]


def call(provider, correction=None):  # type: ignore[no-untyped-def]
    return provider.complete_json(feature="triage", system="Be brief.", blocks=[prompt.block("bug_notes", "Total is wrong")],
                                  output_model=Answer, max_tokens=256, correction=correction)


def ask(db, world, provider):  # type: ignore[no-untyped-def]
    return service.run(db, world.a.org, world.a.users["qa_engineer"].id, feature="triage", task="Suggest a severity.",
                       blocks=[prompt.block("bug_notes", "Total is wrong")], output_model=Answer, fallback=FALLBACK, provider=provider,
                       window=SlidingWindow(1000))


@pytest.mark.parametrize(("make", "body"), CASES)
def test_the_happy_path_returns_the_raw_text_and_real_token_counts(fake, make, body) -> None:
    fake.script = [(200, body(VALID), 0)]
    result = call(make(fake.url))
    assert result.raw_text == VALID and (result.input_tokens, result.output_tokens) == (11, 7)


def test_the_gemini_request_has_the_key_header_not_in_the_url_asks_for_json_and_carries_the_schema(fake) -> None:
    fake.script = [(200, gemini_body(VALID), 0)]
    call(make_gemini(fake.url))
    (req,) = fake.requests
    assert req["path"] == "/v1beta/models/gemini-test:generateContent" and KEY not in req["path"] and "?" not in req["path"]
    assert req["headers"]["x-goog-api-key"] == KEY
    assert req["body"]["generationConfig"]["responseMimeType"] == "application/json"
    assert "responseSchema" not in req["body"]["generationConfig"]
    text = req["body"]["contents"][0]["parts"][0]["text"]
    assert '"severity"' in text and "JSON Schema" in text and "Total is wrong" in text
    assert req["body"]["systemInstruction"]["parts"][0]["text"] == "Be brief."


def test_the_openai_compatible_request_uses_bearer_json_object_and_the_schema_in_the_prompt(fake) -> None:
    fake.script = [(200, openai_body(VALID), 0)]
    call(make_compat(fake.url))
    (req,) = fake.requests
    assert req["path"] == "/openai/v1/chat/completions" and KEY not in req["path"]
    assert req["headers"]["authorization"] == f"Bearer {KEY}"
    assert req["body"]["response_format"] == {"type": "json_object"} and req["body"]["model"] == "model-test"
    assert req["body"]["messages"][0] == {"role": "system", "content": "Be brief."}
    assert '"severity"' in req["body"]["messages"][1]["content"]


def test_every_rest_provider_forwards_max_tokens(fake) -> None:
    fake.script = [(200, gemini_body(VALID), 0), (200, openai_body(VALID), 0)]
    call(make_gemini(fake.url))
    call(make_compat(fake.url))
    assert fake.requests[0]["body"]["generationConfig"]["maxOutputTokens"] == 256
    assert fake.requests[1]["body"]["max_tokens"] == 256


@pytest.mark.parametrize(("make", "body"), CASES)
def test_a_correction_is_appended_to_the_retry_prompt(fake, make, body) -> None:
    fake.script = [(200, body(VALID), 0)]
    call(make(fake.url), correction="severity: bad value")
    assert "severity: bad value" in json.dumps(fake.requests[0]["body"])


@pytest.mark.parametrize(("make", "body"), CASES)
def test_a_slow_server_becomes_a_provider_timeout(fake, make, body, caplog) -> None:
    fake.script = [(200, body(VALID), 1.5)]
    with caplog.at_level(logging.DEBUG), pytest.raises(ProviderTimeout) as caught:
        call(make(fake.url, timeout=0.3))
    assert KEY not in str(caught.value) and "127.0.0.1" not in str(caught.value)


@pytest.mark.parametrize(("make", "body"), CASES)
def test_429_is_a_provider_error_that_names_the_rate_limit_and_leaks_nothing(fake, make, body, caplog) -> None:
    fake.script = [(429, b'{"error": {"message": "quota for key ' + KEY.encode() + b' exceeded"}}', 0)]
    with caplog.at_level(logging.DEBUG), pytest.raises(ProviderError) as caught:
        call(make(fake.url))
    message = str(caught.value)
    assert not isinstance(caught.value, ProviderTimeout) and "rate limit" in message and "429" in message
    assert KEY not in message and "quota" not in message and "127.0.0.1" not in message
    assert KEY not in caplog.text


@pytest.mark.parametrize(("make", "body"), CASES)
def test_a_500_is_a_provider_error_with_the_status_only(fake, make, body, caplog) -> None:
    fake.script = [(500, b"internal " + KEY.encode() + b" details", 0)]
    with caplog.at_level(logging.DEBUG), pytest.raises(ProviderError) as caught:
        call(make(fake.url))
    message = str(caught.value)
    assert "500" in message and KEY not in message and "internal" not in message and "127.0.0.1" not in message
    assert KEY not in caplog.text


@pytest.mark.parametrize("make", [make_gemini, make_compat])
def test_a_refused_connection_is_a_provider_error_without_the_url(make) -> None:
    with pytest.raises(ProviderError) as caught:
        call(make("http://127.0.0.1:1"))
    assert KEY not in str(caught.value) and "127.0.0.1" not in str(caught.value)


@pytest.mark.parametrize(("make", "body"), CASES)
@pytest.mark.parametrize("raw", [b"this is not json {", b"{}", b'{"candidates": [], "choices": []}'])
def test_an_unusable_answer_body_is_returned_as_empty_raw_text(fake, make, body, raw) -> None:
    fake.script = [(200, raw, 0)]
    result = call(make(fake.url))
    assert result.raw_text == "" and (result.input_tokens, result.output_tokens) == (0, 0)


@pytest.mark.parametrize(("make", "body"), CASES)
def test_json_that_is_not_the_schema_is_retried_once_with_the_error_and_then_used(db, world, fake, make, body) -> None:
    fake.script = [(200, body(BAD), 0), (200, body(VALID), 0)]
    got = ask(db, world, make(fake.url))
    assert got.status == "ok" and got.value.severity == "high" and not got.fallback
    assert len(fake.requests) == 2 and "severity" in json.dumps(fake.requests[1]["body"]).split("previous output was invalid")[1]


@pytest.mark.parametrize(("make", "body"), CASES)
def test_two_invalid_answers_fall_back(db, world, fake, make, body) -> None:
    fake.script = [(200, body("not json"), 0), (200, body(BAD), 0)]
    got = ask(db, world, make(fake.url))
    assert got.fallback and got.value == FALLBACK and got.status == "invalid_output" and len(fake.requests) == 2


@pytest.mark.parametrize(("make", "body"), CASES)
@pytest.mark.parametrize("status", [429, 500])
def test_an_http_failure_falls_back_as_an_error(db, world, fake, make, body, status) -> None:
    fake.script = [(status, b"{}", 0)]
    got = ask(db, world, make(fake.url))
    assert got.fallback and got.status == "error" and len(fake.requests) == 1


def test_the_factory_builds_the_new_providers_and_uses_the_mock_without_a_key(caplog) -> None:
    base = {"jwt_secret": "x" * 40}
    g = factory.get_provider(Settings(ai_provider="gemini", gemini_api_key="k", **base))
    assert isinstance(g._primary, GeminiProvider) and (g.name, g.model) == ("gemini", "gemini-3.5-flash-lite")  # type: ignore[attr-defined]
    g2 = factory.get_provider(Settings(ai_provider="gemini", gemini_api_key="k", gemini_model="gemini-x", **base))
    assert g2.model == "gemini-x"
    o = factory.get_provider(Settings(ai_provider="openai_compatible", openai_compat_api_key="k", openai_compat_base_url="http://h/v1",
                                      openai_compat_model="m", **base))
    assert isinstance(o._primary, OpenAICompatibleProvider) and (o.name, o.model) == ("openai_compatible", "m")
    factory._warned = False
    with caplog.at_level(logging.WARNING, logger="app.ai"):
        assert factory.get_provider(Settings(ai_provider="gemini", gemini_api_key="", **base)).name == "mock"
        assert factory.get_provider(Settings(ai_provider="openai_compatible", **base)).name == "mock"
    assert len([r for r in caplog.records if r.name == "app.ai"]) == 1  # one warning, like anthropic
    factory._warned = False
