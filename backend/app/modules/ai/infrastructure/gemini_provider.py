"""The Gemini provider (Google AI Studio free tier, REST generateContent). Model from GEMINI_MODEL, key from GEMINI_API_KEY, sent in the
`x-goog-api-key` header (never in the URL), base URL from GEMINI_BASE_URL (tests point it at a fake server). The output schema goes into the
prompt text because Gemini's responseSchema rejects many Pydantic constructs; `responseMimeType` asks for JSON. Invalid or empty answers are
returned as raw text so the service validates, retries once and falls back (D-083)."""

import json
from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel

from app.modules.ai.domain.prompt import Block, render
from app.modules.ai.domain.provider import ProviderResult
from app.modules.ai.domain.rules import PROVIDER_TIMEOUT_SECONDS, TEMPERATURE
from app.modules.ai.infrastructure.http_json import post_json

DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"  # an empty GEMINI_MODEL (the .env.example value) falls back to this
DEFAULT_BASE_URL ="https://generativelanguage.googleapis.com"


def schema_instruction(output_model: type[BaseModel]) -> str:
    return ("\n\nReturn only one JSON object, with no markdown and no text around it, that matches this JSON Schema:\n"
            + json.dumps(output_model.model_json_schema()))


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, base_url: str = "", timeout: float = PROVIDER_TIMEOUT_SECONDS) -> None:
        self.model = model
        self._api_key = api_key
        self._base = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout

    def complete_json(self, *, feature: str, system: str, blocks: Sequence[Block], output_model: type[BaseModel], max_tokens: int,
                      correction: str | None = None) -> ProviderResult:
        content = render(blocks) + schema_instruction(output_model)
        if correction:
            content += f"\n\nYour previous output was invalid: {correction}\nReturn only valid JSON that matches the schema."
        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": content}]}],
            "generationConfig": {"temperature": TEMPERATURE, "maxOutputTokens": max_tokens, "responseMimeType": "application/json"},
        }
        data = post_json(f"{self._base}/v1beta/models/{self.model}:generateContent",
                         {"x-goog-api-key": self._api_key, "content-type": "application/json"}, body, self._timeout)
        raw = ""
        tokens_in = tokens_out = 0
        if isinstance(data, dict):
            try:
                parts = data["candidates"][0]["content"]["parts"]
                raw = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought"))
            except (KeyError, IndexError, TypeError, AttributeError):
                raw = ""
            usage = data.get("usageMetadata")
            if isinstance(usage, dict):
                tokens_in = _count(usage.get("promptTokenCount"))
                tokens_out = _count(usage.get("candidatesTokenCount")) + _count(usage.get("thoughtsTokenCount"))
        return ProviderResult(raw_text=raw, input_tokens=tokens_in, output_tokens=tokens_out, model=self.model)


def _count(value: Any) -> int:
    return value if isinstance(value, int) and value > 0 else 0
