"""Which provider is in use (REQ-042): `AI_PROVIDER=mock|anthropic|gemini|openai_compatible`. A real provider without its key (or, for
openai_compatible, without a base URL) logs a warning once and uses the mock. `AI_FALLBACK_PROVIDER` (empty by default) names a second
provider behind the first (D-085). Every real provider is wrapped in the retry chain, alone when there is no usable fallback (D-087);
the mock is never wrapped."""

import logging

from app.core.config import Settings, get_settings
from app.modules.ai.domain.provider import AIProvider
from app.modules.ai.infrastructure.anthropic_provider import AnthropicProvider
from app.modules.ai.infrastructure.chain import ChainState, FallbackProvider
from app.modules.ai.infrastructure.gemini_provider import DEFAULT_GEMINI_MODEL, GeminiProvider
from app.modules.ai.infrastructure.mock import MockProvider
from app.modules.ai.infrastructure.openai_compatible_provider import OpenAICompatibleProvider

log = logging.getLogger("app.ai")
_warned = False
_warned_fallback = False
_states: dict[tuple[str, str], ChainState] = {}  # one cool-down per pair of providers, per process

_MISSING = {
    "anthropic": "ANTHROPIC_API_KEY is empty",
    "gemini": "GEMINI_API_KEY is empty",
    "openai_compatible": "OPENAI_COMPAT_API_KEY, OPENAI_COMPAT_BASE_URL or OPENAI_COMPAT_MODEL is empty",
}


def _warn_once(message: str) -> None:
    global _warned
    if not _warned:
        _warned = True
        log.warning(message)


def _warn_fallback_once(message: str) -> None:
    global _warned_fallback
    if not _warned_fallback:
        _warned_fallback = True
        log.warning(message)


def _build(name: str, s: Settings) -> AIProvider | None:
    """The named provider, or None when it is not configured."""
    if name == "anthropic" and s.anthropic_api_key:
        return AnthropicProvider(s.anthropic_api_key, s.anthropic_model)
    if name == "gemini" and s.gemini_api_key:
        return GeminiProvider(s.gemini_api_key, s.gemini_model or DEFAULT_GEMINI_MODEL, s.gemini_base_url)
    if name == "openai_compatible" and s.openai_compat_api_key and s.openai_compat_base_url and s.openai_compat_model:
        return OpenAICompatibleProvider(s.openai_compat_api_key, s.openai_compat_model, s.openai_compat_base_url)
    return None


def get_provider(settings: Settings | None = None) -> AIProvider:
    s = settings or get_settings()
    if s.ai_provider == "mock":
        return MockProvider()
    primary = _build(s.ai_provider, s)
    if primary is None:
        _warn_once(f"AI_PROVIDER={s.ai_provider} but {_MISSING[s.ai_provider]}: using the mock provider.")
        return MockProvider()
    wanted = s.ai_fallback_provider
    if not wanted:
        return FallbackProvider(primary)  # retry once on 429 or 5xx even without a second provider (D-087)
    if wanted == s.ai_provider:
        _warn_fallback_once("AI_FALLBACK_PROVIDER is the same as AI_PROVIDER: no fallback is used.")
        return FallbackProvider(primary)
    secondary = _build(wanted, s)
    if secondary is None:
        _warn_fallback_once(f"AI_FALLBACK_PROVIDER={wanted} but {_MISSING[wanted]}: no fallback is used.")
        return FallbackProvider(primary)
    return FallbackProvider(primary, secondary, state=_states.setdefault((primary.name, secondary.name), ChainState()))
