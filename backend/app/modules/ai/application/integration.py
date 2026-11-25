"""Registers the AI usage check with the testing module (its `hooks.py`): a test case saved with `ai_usage_id` must point at a real AI
call of this workspace (I-17 sends it; until this module registered, the id was refused). Imported once by the AI routes."""

from app.modules.ai.infrastructure import repository as repo
from app.modules.testing.application import hooks as testing_hooks


def register() -> None:
    if repo.exists not in testing_hooks.ai_usage_exists:  # importing twice (tests, reloads) must not register twice
        testing_hooks.ai_usage_exists.append(repo.exists)
