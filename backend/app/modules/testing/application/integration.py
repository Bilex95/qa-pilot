"""Registers the run hooks other modules call: the bugs module asks whether a run result exists and where it came from, the suites list
asks for the last run pass rate, and the projects list asks for the test figures of each project. Imported once by the run routes."""

import uuid

from sqlalchemy.orm import Session

from app.modules.bugs.application import hooks as bug_hooks
from app.modules.projects.application import hooks as project_hooks
from app.modules.testing.application import hooks
from app.modules.testing.domain.rules import pass_rate, run_key
from app.modules.testing.infrastructure import run_repository as repo


def _result_exists(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, result_id: uuid.UUID) -> bool:
    found = repo.get_result_any_run(db, org_id, result_id)
    return found is not None and found[1].project_id == project_id


def _result_info(db: Session, org_id: uuid.UUID, result_id: uuid.UUID) -> bug_hooks.SourceRun | None:
    found = repo.get_result_any_run(db, org_id, result_id)
    if found is None:
        return None
    result, run = found
    return bug_hooks.SourceRun(run_id=run.id, run_key=run_key(run.number), run_name=run.name, case_key=result.case_key)


def _project_testing(db: Session, org_id: uuid.UUID, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, project_hooks.ProjectTesting]:
    """The test figures of the projects list and overview: pass rate of the newest run, of all runs together, and the suite count."""
    last = repo.last_run_counts(db, org_id, project_ids)
    everything = repo.project_result_counts(db, org_id, project_ids)
    suites = repo.suite_counts(db, org_id, project_ids)
    return {pid: project_hooks.ProjectTesting(
        last_run_pass_rate=pass_rate(last.get(pid, {})), pass_rate=pass_rate(everything.get(pid, {})), suite_count=suites.get(pid, 0))
        for pid in project_ids}


def register() -> None:
    if _project_testing not in project_hooks.testing_by_project:
        project_hooks.testing_by_project.append(_project_testing)
    if _result_exists not in bug_hooks.run_result_exists:  # importing twice (tests, reloads) must not register twice
        bug_hooks.run_result_exists.append(_result_exists)
        bug_hooks.run_result_info.append(_result_info)
    if repo.last_run_pass_rates not in hooks.last_run_pass_rates:
        hooks.last_run_pass_rates.append(repo.last_run_pass_rates)
