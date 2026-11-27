"""A primary provider, usually with a second one behind it (D-085). The second may be absent (D-087): then it only retries once.
A 429 or 5xx answer is retried once on the same provider after a short backoff;
a timeout or a connection error goes straight to the next provider; a permanent failure (bad key, retired model) goes to the next provider
and is logged once as a warning for the workspace admin. The whole request has a 60 second budget, and a primary that just failed is
skipped for 30 seconds. Invalid JSON is not an availability problem and never reaches this class (service.run handles it). No key, URL or
body is ever put in a message or a log line."""

import dataclasses
import logging
import random
import threading
import time
from collections.abc import Callable, Sequence
from typing import Any

from pydantic import BaseModel

from app.modules.ai.domain.prompt import Block
from app.modules.ai.domain.provider import AIProvider, ProviderError, ProviderResult, ProviderUnavailable

log = logging.getLogger("app.ai")

BUDGET_SECONDS = 60.0
COOLDOWN_SECONDS = 30.0
BACKOFF_BASE_SECONDS = 1.5
BACKOFF_JITTER_SECONDS = 0.5
BACKOFF_CAP_SECONDS = 5.0
WARN_EVERY_SECONDS = 600.0
REASONS_MAX = 24

_SETTINGS_PREFIX = {"anthropic": "ANTHROPIC", "gemini": "GEMINI", "openai_compatible": "OPENAI_COMPAT"}
_HINTS = {"http_400": "the request or the model setting may be invalid", "http_401": "the key may be invalid",
          "http_403": "the key may not be allowed to use this model", "http_404": "the model may be retired or the key invalid"}


class ChainState:
    """What is shared by every call in one process: the cool-down of the primary and the rate limit of the admin warning."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.down_until = 0.0
        self.last_reason = "unavailable"
        self.warned: dict[tuple[str, str], float] = {}

    def cooling(self, now: float) -> bool:
        with self.lock:
            return now < self.down_until

    def mark_down(self, now: float, reason: str) -> None:
        with self.lock:
            self.down_until = now + COOLDOWN_SECONDS
            self.last_reason = reason

    def mark_up(self) -> None:
        with self.lock:
            self.down_until = 0.0

    def reason(self) -> str:
        with self.lock:
            return self.last_reason

    def may_warn(self, provider: str, reason: str, now: float) -> bool:
        with self.lock:
            last = self.warned.get((provider, reason))
            if last is not None and now - last < WARN_EVERY_SECONDS:
                return False
            self.warned[(provider, reason)] = now
            return True


class FallbackProvider:
    """The AIProvider protocol over [primary, secondary]. `name` and `model` are the primary's (what a refused call is logged with)."""

    def __init__(self, primary: AIProvider, secondary: AIProvider | None = None, *, state: ChainState | None = None,
                 clock: Callable[[], float] = time.monotonic, sleep: Callable[[float], None] = time.sleep,
                 jitter: Callable[[], float] = random.random) -> None:
        self._primary = primary
        self._secondary = secondary
        self._state = state or ChainState()
        self._clock = clock
        self._sleep = sleep
        self._jitter = jitter
        self.name = primary.name
        self.model = primary.model

    def _delay(self, error: ProviderUnavailable) -> float:
        if error.retry_after is not None:
            return min(error.retry_after, BACKOFF_CAP_SECONDS)
        return min(BACKOFF_BASE_SECONDS + self._jitter() * BACKOFF_JITTER_SECONDS, BACKOFF_CAP_SECONDS)

    def _warn_permanent(self, failed: AIProvider, error: ProviderError, other: AIProvider | None) -> None:
        if not error.reason.startswith("http_4") or not self._state.may_warn(failed.name, error.reason, self._clock()):
            return
        prefix = _SETTINGS_PREFIX.get(failed.name, failed.name.upper())
        hint = _HINTS.get(error.reason, "the settings may be wrong")
        follow = f"Falling back to {other.name}." if other is not None else "No other provider is available."
        log.warning("AI provider %s failed with %s (%s). %s Check %s_MODEL and %s_API_KEY in the server settings.",
                    failed.name, error.reason, hint, follow, prefix, prefix)

    def _ask(self, provider: AIProvider, may_retry: bool, started: float,
             kwargs: dict[str, Any]) -> tuple[ProviderResult | None, int, ProviderError | None]:
        """One provider, with at most one retry. Returns the answer or the final error, and the number of calls made."""
        calls = 0
        error: ProviderError | None = None
        while True:
            if self._clock() - started >= BUDGET_SECONDS:
                return None, calls, error
            calls += 1
            try:
                return provider.complete_json(**kwargs), calls, None
            except ProviderError as exc:
                error = exc
            if not (may_retry and calls == 1 and isinstance(error, ProviderUnavailable) and error.retry_same):
                return None, calls, error
            self._sleep(self._delay(error))

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        kwargs = {"feature": feature, "system": system, "blocks": blocks, "output_model": output_model, "max_tokens": max_tokens,
                  "correction": correction}
        started = self._clock()
        secondary = self._secondary
        if secondary is None:  # a lone provider: retry once, nothing to skip to, so no cool-down
            cooling = False
            sequence = [(self._primary, True)]
        else:
            cooling = self._state.cooling(started)
            # While the primary cools down the secondary goes first, and the primary is tried once anyway if the secondary fails.
            sequence = [(secondary, True), (self._primary, False)] if cooling else [(self._primary, True), (secondary, True)]
        total = 0
        final: dict[str, str] = {}
        last: ProviderError | None = None
        for provider, may_retry in sequence:
            result, calls, error = self._ask(provider, may_retry, started, kwargs)
            total += calls
            if result is not None:
                if provider is self._primary:
                    self._state.mark_up()
                    reason = None
                else:
                    reason = final.get("primary") or (self._state.reason() if cooling else None)
                return dataclasses.replace(result, provider=provider.name, attempts=total, fallback_reason=reason)
            if error is None:  # the budget ran out before this provider was asked
                break
            last = error
            final["primary" if provider is self._primary else "secondary"] = error.reason
            other = secondary if provider is self._primary else None
            if provider is self._primary and secondary is not None:
                self._state.mark_down(self._clock(), error.reason)
            self._warn_permanent(provider, error, other)
            if self._clock() - started >= BUDGET_SECONDS:
                break
        if last is None:
            last = ProviderError("The AI provider failed (no time left).", reason="budget")
        last.attempts = total
        last.reasons = ">".join(final[k] for k in ("primary", "secondary") if k in final)[:REASONS_MAX] or last.reason
        raise last
