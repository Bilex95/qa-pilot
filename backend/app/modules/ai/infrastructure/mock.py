"""The mock provider (AI_SPEC section 1): deterministic, no network. Every feature (I-15 to I-18) registers a handler that derives its
answer from the input with plain rules, so tests repeat and the offline demo looks real. Token counts are `ceil(chars / 4)`."""

import json
import math
from collections.abc import Callable, Sequence
from typing import Any

from pydantic import BaseModel

from app.modules.ai.domain.prompt import Block, render
from app.modules.ai.domain.provider import ProviderResult

MODEL = "mock-1"
# feature -> (blocks) -> the answer as a dict, or a raw string (tests use it to send an answer that is not valid JSON)
MockHandler = Callable[[Sequence[Block]], dict[str, Any] | str]
_HANDLERS: dict[str, MockHandler] = {}


def register_mock(feature: str, handler: MockHandler) -> None:
    _HANDLERS[feature] = handler


def tokens(text: str) -> int:
    return math.ceil(len(text) / 4)


class MockProvider:
    name = "mock"
    model = MODEL

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        handler = _HANDLERS.get(feature)
        answer = handler(blocks) if handler else {}
        raw = answer if isinstance(answer, str) else json.dumps(answer, sort_keys=True)
        return ProviderResult(raw_text=raw, input_tokens=tokens(system + render(blocks) + (correction or "")), output_tokens=tokens(raw),
                              model=MODEL)
