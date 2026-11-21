"""Registers the release hooks the bugs and testing modules call: does this release exist in the project, and what is it called.
Imported once by the release routes."""

from app.modules.bugs.application import hooks as bug_hooks
from app.modules.releases.application import service
from app.modules.testing.application import hooks as test_hooks


def register() -> None:
    if service.exists_in_project not in bug_hooks.release_exists:  # importing twice (tests, reloads) must not register twice
        bug_hooks.release_exists.append(service.exists_in_project)
        bug_hooks.release_names.append(service.names_of)
        test_hooks.release_exists.append(service.exists_in_project)
        test_hooks.release_names.append(service.names_of)
