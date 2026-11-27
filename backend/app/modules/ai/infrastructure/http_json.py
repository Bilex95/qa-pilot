"""One JSON POST for the REST providers (Gemini, OpenAI compatible). Every failure becomes a ProviderError (permanent), a
ProviderUnavailable (429, 500, 502, 503, 504, connection error) or a ProviderTimeout, with a short `reason`. The message holds only the
class name or the status code: never the key, the URL, the request or the response body (D-083, D-085)."""

import re
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from app.modules.ai.domain.provider import ProviderError, ProviderTimeout, ProviderUnavailable
from app.modules.ai.domain.rules import PROVIDER_TIMEOUT_SECONDS

TRANSIENT_STATUSES = frozenset({429, 500, 502, 503, 504})
MAX_RETRY_AFTER_SECONDS = 86400.0  # a day: any larger value never fits the 60 second budget anyway
_NUMBER = re.compile(r"\d+(\.\d+)?")


def _retry_after(response: httpx.Response, now: datetime | None = None) -> float | None:
    """The Retry-After header as seconds: a plain non negative number (integer or decimal) or an HTTP date (seconds from now). A missing,
    invalid or negative value, or a date in the past, is None. The value itself is never kept in a message (D-088)."""
    value = response.headers.get("retry-after", "").strip()
    if not value:
        return None
    if _NUMBER.fullmatch(value):
        return min(float(value), MAX_RETRY_AFTER_SECONDS)
    try:
        moment = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    seconds = (moment - (now or datetime.now(UTC))).total_seconds()
    return min(seconds, MAX_RETRY_AFTER_SECONDS) if seconds >= 0 else None


def post_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: float = PROVIDER_TIMEOUT_SECONDS) -> Any:
    """POST `body` as JSON. Returns the parsed answer, or None when the answer is not JSON (an empty raw answer for the caller)."""
    try:
        response = httpx.post(url, headers=headers, json=body, timeout=timeout)
    except httpx.TimeoutException:
        raise ProviderTimeout("The AI provider timed out.") from None
    except httpx.TransportError as exc:  # connection refused, reset, DNS, TLS: only the class name is kept
        raise ProviderUnavailable(f"The AI provider failed ({type(exc).__name__}).", reason="connection", retry_same=False) from None
    except Exception as exc:  # a bad URL or anything else: permanent, only the class name is kept
        raise ProviderError(f"The AI provider failed ({type(exc).__name__}).", reason="request") from None
    status = response.status_code
    if status == 429:
        raise ProviderUnavailable("The AI provider rate limit was reached (HTTP 429). Try again later.", reason="http_429",
                                  retry_after=_retry_after(response))
    if status in TRANSIENT_STATUSES:
        raise ProviderUnavailable(f"The AI provider failed (HTTP {status}).", reason=f"http_{status}", retry_after=_retry_after(response))
    if status >= 400:
        raise ProviderError(f"The AI provider failed (HTTP {status}).", reason=f"http_{status}")
    try:
        return response.json()
    except ValueError:
        return None
