"""Test mode (D-086): when the local scripts set QAP_TEST_MODE, the process must see the mock AI provider and no key, whatever the
developer's .env holds, so no test can reach a live provider. Skipped when the variable is not set (a plain `pytest` run)."""

import os

import pytest

from app.core.config import Settings, get_settings

pytestmark = pytest.mark.skipif(not os.environ.get("QAP_TEST_MODE"), reason="not in test mode")


def test_the_process_is_on_the_mock_provider_with_no_key_and_no_fallback() -> None:
    s = get_settings()
    assert s.ai_provider == "mock" and s.ai_fallback_provider == ""
    assert not s.anthropic_api_key and not s.gemini_api_key and not s.openai_compat_api_key


def test_a_fresh_settings_object_agrees() -> None:
    s = Settings()
    assert s.ai_provider == "mock" and not (s.anthropic_api_key or s.gemini_api_key or s.openai_compat_api_key)
