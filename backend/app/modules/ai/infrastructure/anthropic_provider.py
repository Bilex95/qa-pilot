"""The Anthropic provider (AI_SPEC section 1): the official SDK, the model from ANTHROPIC_MODEL, the key from ANTHROPIC_API_KEY, a 30 second
timeout and temperature 0.2. The answer is structured through a tool shaped like the output schema, with a JSON only instruction. The key
is never logged and never part of an error message."""

import json
from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel

from app.modules.ai.domain.prompt import Block, render
from app.modules.ai.domain.provider import ProviderError, ProviderResult, ProviderTimeout, ProviderUnavailable
from app.modules.ai.domain.rules import PROVIDER_TIMEOUT_SECONDS, TEMPERATURE

TOOL_NAME = "answer"
# SDK error class names (matched by name so the SDK is only imported when used) to a short reason (D-085)
_TRANSIENT = {"RateLimitError": "http_429", "OverloadedError": "overloaded", "InternalServerError": "http_500",
              "ServiceUnavailableError": "http_503"}
_CONNECTION = {"APIConnectionError"}
_PERMANENT = {"AuthenticationError": "http_401", "PermissionDeniedError": "http_403", "NotFoundError": "http_404",
              "BadRequestError": "http_400", "UnprocessableEntityError": "http_422"}


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, client: Any = None) -> None:
        self.model = model
        self._api_key = api_key
        self._client = client  # tests pass a stub; None means the real SDK client

    def _sdk(self) -> Any:
        if self._client is None:
            import anthropic  # imported here so the mock needs no SDK at all

            self._client = anthropic.Anthropic(api_key=self._api_key, timeout=PROVIDER_TIMEOUT_SECONDS, max_retries=0)
        return self._client

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        content = render(blocks)
        if correction:
            content += f"\n\nYour previous output was invalid: {correction}\nReturn only valid JSON that matches the schema."
        tool = {"name": TOOL_NAME, "description": f"Return the {feature} answer as JSON.", "input_schema": output_model.model_json_schema()}
        try:
            response = self._sdk().messages.create(
                model=self.model, max_tokens=max_tokens, temperature=TEMPERATURE, system=system,
                messages=[{"role": "user", "content": content}], tools=[tool], tool_choice={"type": "tool", "name": TOOL_NAME},
                timeout=PROVIDER_TIMEOUT_SECONDS)
        except Exception as exc:  # every SDK failure becomes a provider error; only the class name is kept
            kind = type(exc).__name__
            message = f"The AI provider failed ({kind})."
            if "Timeout" in kind:
                raise ProviderTimeout(message) from None
            if kind in _CONNECTION:
                raise ProviderUnavailable(message, reason="connection", retry_same=False) from None
            if kind in _TRANSIENT:
                raise ProviderUnavailable(message, reason=_TRANSIENT[kind]) from None
            raise ProviderError(message, reason=_PERMANENT.get(kind, "error")) from None
        raw = ""
        for part in getattr(response, "content", []) or []:
            if getattr(part, "type", "") == "tool_use":
                raw = json.dumps(part.input)
                break
            if getattr(part, "type", "") == "text" and not raw:
                raw = part.text
        usage = getattr(response, "usage", None)
        return ProviderResult(raw_text=raw, input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
                              output_tokens=int(getattr(usage, "output_tokens", 0) or 0), model=self.model)
