"""One JSON POST for the REST providers (Gemini, OpenAI compatible). Every failure becomes a ProviderError or ProviderTimeout whose message
holds only the class name or the status code: never the key, the URL, the request or the response body (D-083)."""

from typing import Any

import httpx

from app.modules.ai.domain.provider import ProviderError, ProviderTimeout
from app.modules.ai.domain.rules import PROVIDER_TIMEOUT_SECONDS


def post_json(url: str, headers: dict[str, str], body: dict[str, Any], timeout: float = PROVIDER_TIMEOUT_SECONDS) -> Any:
    """POST `body` as JSON. Returns the parsed answer, or None when the answer is not JSON (an empty raw answer for the caller)."""
    try:
        response = httpx.post(url, headers=headers, json=body, timeout=timeout)
    except httpx.TimeoutException:
        raise ProviderTimeout("The AI provider timed out.") from None
    except Exception as exc:  # network, TLS, bad URL: only the class name is kept
        raise ProviderError(f"The AI provider failed ({type(exc).__name__}).") from None
    status = response.status_code
    if status == 429:
        raise ProviderError("The AI provider rate limit was reached (HTTP 429). Try again later.")
    if status >= 400:
        raise ProviderError(f"The AI provider failed (HTTP {status}).")
    try:
        return response.json()
    except ValueError:
        return None
