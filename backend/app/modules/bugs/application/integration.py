"""Registers the bug counts with the projects module (its `hooks.py`), replacing the zero placeholders of I-01 and I-02.
Imported once by the bugs routes. Deleting a component or an environment needs no hook: the foreign keys on `bugs` are
ON DELETE SET NULL."""

from app.modules.bugs.infrastructure import repository as repo
from app.modules.projects.application import hooks


def register() -> None:
    for registry, hook in ((hooks.label_bug_counts, repo.label_bug_counts),
                           (hooks.open_bugs_by_project, repo.open_counts_by_project),
                           (hooks.open_bugs_by_component, repo.open_counts_by_component)):
        if hook not in registry:  # importing twice (tests, reloads) must not double the counts
            registry.append(hook)  # type: ignore[arg-type]
