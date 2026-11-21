"""Test runs, results and the bug draft of a failed step (I-07; REQ-032, REQ-033, REQ-034; D-062).

A run copies its cases when it starts (key, title, preconditions, steps, suite), so later edits or deletes of a case never change it.
A completed run is read only (409 `run_completed`)."""

import contextlib
import re
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate
from app.modules.audit.application import service as audit
from app.modules.auth.application import service as auth
from app.modules.bugs.application import service as bugs
from app.modules.projects.application import service as projects
from app.modules.testing.application import hooks
from app.modules.testing.domain.rules import MAX_CASES_PER_RUN, draft_title, pass_rate, run_key
from app.modules.testing.infrastructure import repository as case_repo
from app.modules.testing.infrastructure import run_repository as repo
from app.modules.testing.infrastructure.models import TestRun, TestRunResult
from app.modules.testing.schemas.runs import ResultUpdateIn, RunCreateIn, RunUpdateIn

RUN_KEY_RE = re.compile(r"^R-(\d{1,9})$", re.IGNORECASE)
RESULT_ORDER = ("pass", "fail", "blocked", "skipped", "untested")


@dataclass(frozen=True)
class RunContext:
    """What a run's output needs besides the row: result counts, environment names and people's names."""

    counts: dict[uuid.UUID, dict[str, int]]
    environments: dict[uuid.UUID, str]
    names: dict[uuid.UUID, str]


def _invalid(field: str, message: str) -> Unprocessable:
    return Unprocessable("Some fields are not valid.", details=[{"loc": ["body", field], "msg": message}])


def _completed(run: TestRun) -> Conflict:
    return Conflict(f"{run_key(run.number)} is completed and read only.", code="run_completed",
                    details={"key": run_key(run.number), "completed_at": run.completed_at.isoformat() if run.completed_at else None})


# Reads ----------------------------------------------------------------------

def get_run(db: Session, org_id: uuid.UUID, run_id: uuid.UUID) -> TestRun:
    run = repo.get_run(db, org_id, run_id)
    if run is None:
        raise NotFound("Test run not found.")
    return run


def get_run_by_ref(db: Session, org_id: uuid.UUID, ref: str) -> TestRun:
    """`ref` is a UUID or a key like R-31. Another org's run and a malformed ref are both a 404."""
    run = None
    try:
        run = repo.get_run(db, org_id, uuid.UUID(ref))
    except ValueError:
        match = RUN_KEY_RE.match(ref)
        if match:
            run = repo.get_run_by_number(db, org_id, int(match.group(1)))
    if run is None:
        raise NotFound("Test run not found.")
    return run


def context_for(db: Session, org_id: uuid.UUID, runs: list[TestRun]) -> RunContext:
    env_ids = {r.environment_id for r in runs if r.environment_id}
    environments: dict[uuid.UUID, str] = {}
    for env_id in env_ids:
        with contextlib.suppress(NotFound):
            environments[env_id] = projects.get_environment(db, org_id, env_id).name
    names = {uid: user.full_name for uid, user in auth.get_users_by_ids(db, list({r.created_by_id for r in runs})).items()}
    return RunContext(counts=repo.counts_by_run(db, org_id, [r.id for r in runs]), environments=environments, names=names)


def counts_of(ctx: RunContext, run: TestRun) -> dict[str, int]:
    have = ctx.counts.get(run.id, {})
    return {k: have.get(k, 0) for k in RESULT_ORDER}


def rate_of(counts: dict[str, int]) -> int | None:
    return pass_rate(counts)


def list_runs(db: Session, org_id: uuid.UUID, params: PageParams, *, project_id: uuid.UUID | None, status: str | None,
              release_id: uuid.UUID | None) -> tuple[list[TestRun], int]:
    return paginate(db, repo.runs_query(org_id, project_id=project_id, status=status, release_id=release_id), params)


def results_with_people(db: Session, org_id: uuid.UUID, run: TestRun) -> tuple[list[TestRunResult], dict[uuid.UUID, str],
                                                                             dict[uuid.UUID, list[tuple[uuid.UUID, str]]]]:
    """The results of a run in order, the names of the people who executed them and the bugs filed from each."""
    results = repo.results_of(db, org_id, run.id)
    people = {r.executed_by_id for r in results if r.executed_by_id}
    names = {uid: user.full_name for uid, user in auth.get_users_by_ids(db, list(people)).items()}
    return results, names, bugs.bugs_from_run_results(db, org_id, [r.id for r in results])


# Create ---------------------------------------------------------------------

def create_run(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, body: RunCreateIn) -> TestRun:
    try:
        project = projects.get_project(db, org_id, body.project_id)
    except NotFound:
        raise _invalid("project_id", "This project does not exist in this workspace.") from None
    if project.archived_at is not None:
        raise _invalid("project_id", "This project is archived and takes no new runs.")
    if body.environment_id is not None:
        try:
            environment = projects.get_environment(db, org_id, body.environment_id)
        except NotFound:
            environment = None
        if environment is None or environment.project_id != project.id:
            raise _invalid("environment_id", "This environment does not belong to the run's project.")
    if body.release_id is not None and not hooks.release_accepted(db, org_id, project.id, body.release_id):
        raise _invalid("release_id", "This release does not exist in the run's project.")
    suite_ids = list(dict.fromkeys(body.suite_ids))
    case_ids = list(dict.fromkeys(body.case_ids))
    if not suite_ids and not case_ids:
        raise _invalid("suite_ids", "Choose at least one suite or case to run.")
    if repo.existing_suite_ids(db, org_id, project.id, suite_ids) != set(suite_ids):
        raise _invalid("suite_ids", "One or more suites do not exist in the run's project.")
    found = repo.cases_for_run(db, org_id, project.id, suite_ids=suite_ids, case_ids=case_ids)
    if not set(case_ids) <= {case.id for case, _ in found}:
        raise _invalid("case_ids", "One or more cases do not exist in the run's project.")
    if not found:
        raise _invalid("suite_ids", "The chosen suites have no cases to run.")
    if len(found) > MAX_CASES_PER_RUN:
        raise _invalid("suite_ids", f"A run holds at most {MAX_CASES_PER_RUN} cases. Choose fewer suites.")

    number = repo.take_run_number(db, org_id)  # holds the org counter row lock until the commit
    run = TestRun(org_id=org_id, project_id=project.id, number=number, name=body.name, environment_id=body.environment_id,
                  release_id=body.release_id, created_by_id=actor_id, started_at=utcnow())
    db.add(run)
    db.flush()
    db.add_all([TestRunResult(org_id=org_id, run_id=run.id, case_id=case.id, suite_id=suite.id, position=i,
                              case_key=f"TC-{case.number}", case_title=case.title, preconditions=case.preconditions,
                              steps=[dict(s) for s in case.steps]) for i, (case, suite) in enumerate(found)])
    audit.record(db, "run.created", actor_id=actor_id, org_id=org_id, entity_type="test_run", entity_id=run.id,
                 data={"key": run_key(number), "name": run.name, "project_id": str(project.id), "case_count": len(found)})
    db.commit()
    return run


# Update ---------------------------------------------------------------------

def update_run(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, run_id: uuid.UUID, body: RunUpdateIn) -> TestRun:
    run = repo.get_run(db, org_id, run_id, lock=True)
    if run is None:
        raise NotFound("Test run not found.")
    if run.status == "completed":
        raise _completed(run)
    sent = body.model_dump(exclude_unset=True)
    wanted = sent.get("release_id")
    if wanted is not None and not hooks.release_accepted(db, org_id, run.project_id, wanted):
        raise _invalid("release_id", "This release does not exist in the run's project.")
    if "name" in sent:
        run.name = sent["name"]
    if "release_id" in sent:
        run.release_id = sent["release_id"]
    run.updated_at = utcnow()
    if sent.get("status") == "completed":
        have = repo.counts_by_run(db, org_id, [run.id])[run.id]
        counts = {k: have.get(k, 0) for k in RESULT_ORDER}
        run.status = "completed"
        run.completed_at = utcnow()
        audit.record(db, "run.completed", actor_id=actor_id, org_id=org_id, entity_type="test_run", entity_id=run.id,
                     data={"key": run_key(run.number), "name": run.name, "counts": counts, "pass_rate": pass_rate(counts)})
    db.commit()
    return run


def update_result(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, run_id: uuid.UUID, result_id: uuid.UUID,
                  body: ResultUpdateIn) -> TestRunResult:
    run = repo.get_run(db, org_id, run_id, lock=True)  # the run lock orders a result change against "complete run"
    if run is None:
        raise NotFound("Test run not found.")
    result = repo.get_result(db, org_id, run.id, result_id, lock=True)
    if result is None:
        raise NotFound("Test run result not found.")
    if run.status == "completed":
        raise _completed(run)
    sent = body.model_dump(exclude_unset=True)
    if body.result != "fail":
        for field in ("failed_step_index", "actual_result"):
            if sent.get(field) is not None:
                raise _invalid(field, "This only goes with a failed result.")
    index = sent.get("failed_step_index")
    if index is not None and index >= len(result.steps):
        raise _invalid("failed_step_index", f"This case has {len(result.steps)} steps.")
    result.result = body.result
    if body.result == "fail":
        if "failed_step_index" in sent:
            result.failed_step_index = index
        if "actual_result" in sent:
            result.actual_result = sent["actual_result"] or ""
    else:
        result.failed_step_index = None
        result.actual_result = ""
    if "note" in sent:
        result.note = sent["note"] or ""
    if body.result == "untested":
        result.executed_by_id, result.executed_at = None, None
    else:
        result.executed_by_id, result.executed_at = actor_id, utcnow()
    run.updated_at = utcnow()
    db.commit()
    return result


# Bug draft ------------------------------------------------------------------

def bug_draft(db: Session, org_id: uuid.UUID, run_id: uuid.UUID, result_id: uuid.UUID) -> dict[str, Any]:
    """The New bug form's fields for a failed result: title, the steps up to the failed one, the expected result of that step, the
    actual result, the run's environment and release and the suite's component. Nothing is saved (REQ-034)."""
    run = get_run(db, org_id, run_id)
    result = repo.get_result(db, org_id, run.id, result_id)
    if result is None:
        raise NotFound("Test run result not found.")
    if result.result != "fail":
        raise Conflict("Only a failed result can start a bug.", code="result_not_failed", details={"result": result.result})
    index = result.failed_step_index
    steps = result.steps
    upto = steps[: index + 1] if index is not None else steps
    suite = case_repo.get_suite(db, org_id, result.suite_id)
    return {
        "project_id": run.project_id, "title": draft_title(result.case_title, index),
        "steps_to_reproduce": [s["action"] for s in upto],
        "expected_result": steps[index]["expected"] if index is not None else "",
        "actual_result": result.actual_result, "environment_id": run.environment_id,
        "component_id": suite.component_id if suite else None, "release_id": run.release_id,
        "source_run_result_id": result.id, "case_key": result.case_key, "run_key": run_key(run.number),
    }
