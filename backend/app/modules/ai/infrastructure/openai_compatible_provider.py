"""The OpenAI compatible provider: chat completions with `response_format` json_object for any compatible base URL (Groq, OpenRouter and
others). Settings OPENAI_COMPAT_BASE_URL (for example https://api.groq.com/openai/v1), OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_MODEL.
The output schema goes into the prompt text. The key travels in the Authorization header only. Errors follow the contract of the other
providers (D-083)."""

from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel

from app.modules.ai.domain.prompt import Block, render
from app.modules.ai.domain.provider import ProviderResult
from app.modules.ai.domain.rules import PROVIDER_TIMEOUT_SECONDS, TEMPERATURE
from app.modules.ai.infrastructure.gemini_provider import schema_instruction
from app.modules.ai.infrastructure.http_json import post_json


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float = PROVIDER_TIMEOUT_SECONDS) -> None:
        self.model = model
        self._api_key = api_key
        self._base = base_url.rstrip("/")
        self._timeout = timeout

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        content = render(blocks) + schema_instruction(output_model)
        if correction:
            content += f"\n\nYour previous output was invalid: {correction}\nReturn only valid JSON that matches the schema."
        body: dict[str, Any] = {
            "model": self.model, "temperature": TEMPERATURE, "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}],
        }
        data = post_json(f"{self._base}/chat/completions",
                         {"authorization": f"Bearer {self._api_key}", "content-type": "application/json"}, body, self._timeout)
        raw = ""
        tokens_in = tokens_out = 0
        if isinstance(data, dict):
            try:
                text = data["choices"][0]["message"]["content"]
                raw = text if isinstance(text, str) else ""
            except (KeyError, IndexError, TypeError):
                raw = ""
            usage = data.get("usage")
            if isinstance(usage, dict):
                tokens_in = _count(usage.get("prompt_tokens"))
                tokens_out = _count(usage.get("completion_tokens"))
        return ProviderResult(raw_text=raw, input_tokens=tokens_in, output_tokens=tokens_out, model=self.model)


def _count(value: Any) -> int:
    return value if isinstance(value, int) and value > 0 else 0
