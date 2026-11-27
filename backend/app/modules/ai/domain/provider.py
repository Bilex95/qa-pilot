"""The provider contract (AI_SPEC section 1): what a provider returns and fails with. No implementation here."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel

from app.modules.ai.domain.prompt import Block


@dataclass(frozen=True)
class ProviderResult:
    raw_text: str  # the JSON the model answered with, not yet validated
    input_tokens: int
    output_tokens: int
    model: str
    provider: str = ""  # who answered; empty means the provider that was asked (service.run falls back to its name)
    attempts: int = 1  # calls made to providers for this answer (a retry or a fallback makes it more than 1)
    fallback_reason: str | None = None  # why the primary provider was not used, when the secondary answered (D-085)


class ProviderError(Exception):
    """The provider failed (network, refusal, bad key, server error). The message never contains the request or the key.
    `reason` is a short machine string (`http_404`, `timeout`...) with no key, URL or body. `attempts` and `reasons` are set by the
    fallback chain when every provider failed (`reasons` is the final reason of each provider joined with `>`)."""

    def __init__(self, message: str = "", *, reason: str = "error") -> None:
        super().__init__(message)
        self.reason = reason
        self.attempts = 1
        self.reasons: str | None = None


class ProviderUnavailable(ProviderError):
    """A transient failure: HTTP 429, 500, 502, 503, 504, a timeout or a connection error. `retry_after` is the Retry-After header in
    seconds when there was one. `retry_same` is False for a timeout or a connection error (the chain goes to the next provider at once)."""

    def __init__(self, message: str = "", *, reason: str = "unavailable", retry_after: float | None = None,
                 retry_same: bool = True) -> None:
        super().__init__(message, reason=reason)
        self.retry_after = retry_after
        self.retry_same = retry_same


class ProviderTimeout(ProviderUnavailable):
    """The provider did not answer within the timeout (30 seconds)."""

    def __init__(self, message: str = "", *, reason: str = "timeout", retry_after: float | None = None) -> None:
        super().__init__(message, reason=reason, retry_after=retry_after, retry_same=False)


class AIProvider(Protocol):
    name: str  # "mock" or "anthropic"
    model: str

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        """Ask for JSON shaped like `output_model`. `correction` is the validation error of a first invalid answer (the one retry)."""
        ...
