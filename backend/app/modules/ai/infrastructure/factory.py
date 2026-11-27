"""Which provider is in use (REQ-042): `AI_PROVIDER=mock|anthropic`. `anthropic` without a key logs a warning once and uses the mock."""

import logging

from app.core.config import Settings, get_settings
from app.modules.ai.domain.provider import AIProvider
from app.modules.ai.infrastructure.anthropic_provider import AnthropicProvider
from app.modules.ai.infrastructure.mock import MockProvider

log = logging.getLogger("app.ai")
_warned = False


def get_provider(settings: Settings | None = None) -> AIProvider:
    global _warned
    s = settings or get_settings()
    if s.ai_provider == "anthropic":
        if s.anthropic_api_key:
            return AnthropicProvider(s.anthropic_api_key, s.anthropic_model)
        if not _warned:
            _warned = True
            log.warning("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty: using the mock provider.")
    return MockProvider()
