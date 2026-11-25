"""Registers the AI usage checks with the modules that save what an AI suggested: a test case saved with `ai_usage_id` (testing, I-17) and a
release summary accepted with `ai_usage_id` (releases, I-18) must point at a real AI call of this workspace. Imported by the AI routes."""

from app.modules.ai.infrastructure import repository as repo
from app.modules.releases.application import hooks as releases_hooks
from app.modules.testing.application import hooks as testing_hooks


def register() -> None:
    if repo.exists not in testing_hooks.ai_usage_exists:  # importing twice (tests, reloads) must not register twice
        testing_hooks.ai_usage_exists.append(repo.exists)
    if repo.release_summary_exists not in releases_hooks.ai_summary_usage_exists:
        releases_hooks.ai_summary_usage_exists.append(repo.release_summary_exists)
