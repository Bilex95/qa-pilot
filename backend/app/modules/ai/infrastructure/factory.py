"""Which provider is in use (REQ-042): `AI_PROVIDER=mock|anthropic|gemini|openai_compatible`. A real provider without its key (or, for
openai_compatible, without a base URL) logs a warning once and uses the mock."""

import logging

from app.core.config import Settings, get_settings
from app.modules.ai.domain.provider import AIProvider
from app.modules.ai.infrastructure.anthropic_provider import AnthropicProvider
from app.modules.ai.infrastructure.gemini_provider import DEFAULT_GEMINI_MODEL, GeminiProvider
from app.modules.ai.infrastructure.mock import MockProvider
from app.modules.ai.infrastructure.openai_compatible_provider import OpenAICompatibleProvider

log = logging.getLogger("app.ai")
_warned = False


def _warn_once(message: str) -> None:
    global _warned
    if not _warned:
        _warned = True
        log.warning(message)


def get_provider(settings: Settings | None = None) -> AIProvider:
    s = settings or get_settings()
    if s.ai_provider == "anthropic":
        if s.anthropic_api_key:
            return AnthropicProvider(s.anthropic_api_key, s.anthropic_model)
        _warn_once("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty: using the mock provider.")
    elif s.ai_provider == "gemini":
        if s.gemini_api_key:
            return GeminiProvider(s.gemini_api_key, s.gemini_model or DEFAULT_GEMINI_MODEL, s.gemini_base_url)
        _warn_once("AI_PROVIDER=gemini but GEMINI_API_KEY is empty: using the mock provider.")
    elif s.ai_provider == "openai_compatible":
        if s.openai_compat_api_key and s.openai_compat_base_url and s.openai_compat_model:
            return OpenAICompatibleProvider(s.openai_compat_api_key, s.openai_compat_model, s.openai_compat_base_url)
        _warn_once("AI_PROVIDER=openai_compatible but OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_BASE_URL or OPENAI_COMPAT_MODEL is empty: "
                   "using the mock provider.")
    return MockProvider()
