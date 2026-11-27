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


class ProviderError(Exception):
    """The provider failed (network, refusal, bad key, server error). The message never contains the request or the key."""


class ProviderTimeout(ProviderError):
    """The provider did not answer within the timeout (30 seconds)."""


class AIProvider(Protocol):
    name: str  # "mock" or "anthropic"
    model: str

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        """Ask for JSON shaped like `output_model`. `correction` is the validation error of a first invalid answer (the one retry)."""
        ...
