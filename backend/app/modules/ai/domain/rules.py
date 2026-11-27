"""AI rules without a database or a network (AI_SPEC sections 2 and 4, D-012, D-018, D-069). Pure."""

import threading
import time
from collections import deque

FEATURES = ("bug_writer", "explain_log", "triage", "duplicates", "test_cases", "release_summary")
# ok: valid answer from the provider. invalid_output: two invalid answers, the feature fallback was returned. error: the provider failed or
# timed out, the fallback was returned. fallback: the feature returned its own fallback without asking the model (nothing to analyse).
# rate_limited: refused before any call (per user per minute, or the organization's daily limit).
STATUSES = ("ok", "invalid_output", "error", "rate_limited", "fallback")
OUTCOMES = ("accepted", "edited", "discarded")

TEXT_LIMIT = 12_000  # characters per text field sent to the model (D-012)
LOG_LINES = 300  # a log is cut to its last lines
PROVIDER_TIMEOUT_SECONDS = 30
TEMPERATURE = 0.2
# Output token limits per feature (D-088). Groq counts the REQUESTED max_tokens against its 8,000 tokens per minute budget, so a limit far
# above the real output causes 429s. Each limit is about twice the largest output measured over 3 runs on Gemini 3.5 Flash-Lite, Groq
# qwen3.8-27b and Gemini 3.1 Flash-Lite, at least 256, rounded up to a multiple of 64, and never above the limit used before:
#   bug_writer 186 -> 384 (was 1200), explain_log 183 -> 384 (was 600), triage 88 -> 256 (was 400), release_summary 175 -> 384 (was 800),
#   test_cases 689 for 3 cases (about 230 per case) -> 480 per requested case plus 128, so 1,568 for 3 (cap 3000, the earlier value).
# The schema maximums are larger (for example a 4,000 character bug description), but real answers are far shorter; a cut answer is
# invalid JSON and goes through the correction retry, then to the manual fallback (status invalid_output).
# The duplicate check is local and needs no limit.
MAX_TOKENS = {"bug_writer": 384, "explain_log": 384, "triage": 256, "release_summary": 384}
TEST_CASES_TOKENS_PER_CASE = 480
TEST_CASES_TOKENS_BASE = 128
TEST_CASES_TOKENS_CAP = 3000


def max_tokens_for(feature: str, count: int = 1) -> int:
    """The output token limit a feature asks the provider for; `count` only matters for test_cases."""
    if feature == "test_cases":
        return min(TEST_CASES_TOKENS_PER_CASE * max(count, 1) + TEST_CASES_TOKENS_BASE, TEST_CASES_TOKENS_CAP)
    return MAX_TOKENS[feature]


# Statuses that count against the organization's daily limit: the model was asked, or a fallback was served
COUNTED = ("ok", "invalid_output", "error", "fallback")


class SlidingWindow:
    """At most `limit` events per `window` seconds per key, kept in memory of this process (a documented limit for several backend
    processes, D-012). `clock` is a parameter so tests need no sleeping."""

    def __init__(self, limit: int, window: float = 60.0, clock=time.monotonic) -> None:  # type: ignore[no-untyped-def]
        self.limit, self.window, self._clock = limit, window, clock
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Record one event for `key` and say whether it is within the limit (a refused event is not recorded)."""
        now = self._clock()
        with self._lock:
            events = self._events.setdefault(key, deque())
            while events and now - events[0] >= self.window:
                events.popleft()
            if len(events) >= self.limit:
                return False
            events.append(now)
            return True

    def retry_after(self, key: str) -> int:
        """Whole seconds until the oldest event of `key` leaves the window."""
        now = self._clock()
        with self._lock:
            events = self._events.get(key)
            if not events:
                return 1
            return max(1, int(self.window - (now - events[0])) + 1)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()


def acceptance_rate(accepted: int, edited: int, discarded: int) -> int | None:
    """Percent of the suggestions with an outcome that were used as they were or after an edit; None while no outcome is set."""
    decided = accepted + edited + discarded
    if decided == 0:
        return None
    return int((100 * (accepted + edited) + decided // 2) // decided)  # rounded half up, like the pass rate
