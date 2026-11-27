"""Test suites and test cases (I-06; REQ-030, REQ-031).

Public contract for other modules: get_suite, get_case_by_ref, create_cases (the AI generator, I-17, and the bug from a failed
step flow, I-07, go through it). Runs arrive with I-07, AI generation with I-17.
"""

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate
from app.modules.audit.application import service as audit
from app.modules.projects.application import service as projects
from app.modules.testing.application import hooks
from app.modules.testing.domain.rules import case_key, parse_case_ref
from app.modules.testing.infrastructure import repository as repo
from app.modules.testing.infrastructure.models import TestCase, TestSuite
from app.modules.testing.schemas.testing import CaseIn, CaseUpdateIn, StepIn, SuiteIn, SuiteUpdateIn


@dataclass(frozen=True)
class SuiteContext:
    """What a suite's output needs besides the row: case counts, component names and the last run pass rate."""

    case_counts: dict[uuid.UUID, int]
    component_names: dict[uuid.UUID, str]
    pass_rates: dict[uuid.UUID, float]


def _invalid(field: str, message: str) -> Unprocessable:
    return Unprocessable("Some fields are not valid.", details=[{"loc": ["body", field], "msg": message}])


# Suites --------------------------------------------------------------------

def get_suite(db: Session, org_id: uuid.UUID, suite_id: uuid.UUID) -> TestSuite:
    suite = repo.get_suite(db, org_id, suite_id)
    if suite is None:
        raise NotFound("Test suite not found.")
    return suite


def suite_context(db: Session, org_id: uuid.UUID, suites: list[TestSuite]) -> SuiteContext:
    ids = [s.id for s in suites]
    component_ids = [s.component_id for s in suites if s.component_id]
    return SuiteContext(
        case_counts=repo.case_counts(db, org_id, ids),
        component_names={c.id: c.name for c in projects.get_components(db, org_id, component_ids)},
        pass_rates=hooks.pass_rates(db, org_id, ids),
    )


def list_suites(db: Session, org_id: uuid.UUID, project_id: uuid.UUID | None,
                params: PageParams) -> tuple[list[TestSuite], int]:
    return paginate(db, repo.suites_query(org_id, project_id), params)


def _check_component(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, component_id: uuid.UUID | None) -> None:
    if component_id is None:
        return
    try:
        component = projects.get_component(db, org_id, component_id)
    except NotFound:
        component = None
    if component is None or component.project_id != project_id:
        raise _invalid("component_id", "This component does not belong to the suite's project.")


def _name_taken(name: str) -> Conflict:
    return Conflict(f"A suite named {name} already exists in this project.", code="name_taken")


def create_suite(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, body: SuiteIn) -> TestSuite:
    try:
        project = projects.get_project(db, org_id, body.project_id)
    except NotFound:
        raise _invalid("project_id", "This project does not exist in this workspace.") from None
    if project.archived_at is not None:
        raise _invalid("project_id", "This project is archived and takes no new suites.")
    _check_component(db, org_id, project.id, body.component_id)
    name = body.name.strip()
    if repo.suite_name_taken(db, project.id, name):
        raise _name_taken(name)
    suite = TestSuite(org_id=org_id, project_id=project.id, name=name, description=body.description,
                      component_id=body.component_id)
    db.add(suite)
    try:
        db.flush()  # the partial unique index catches a race past the check above
    except IntegrityError as exc:
        db.rollback()
        raise _name_taken(name) from exc
    audit.record(db, "suite.created", actor_id=actor_id, org_id=org_id, entity_type="test_suite", entity_id=suite.id,
                 data={"name": name, "project_id": str(project.id)})
    db.commit()
    return suite


def update_suite(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, suite_id: uuid.UUID,
                 body: SuiteUpdateIn) -> TestSuite:
    suite = repo.get_suite(db, org_id, suite_id, lock=True)
    if suite is None:
        raise NotFound("Test suite not found.")
    sent = body.model_dump(exclude_unset=True)
    diff: dict[str, Any] = {}
    if "name" in sent and sent["name"] != suite.name:
        name = sent["name"].strip()
        if name.lower() != suite.name.lower() and repo.suite_name_taken(db, suite.project_id, name, except_id=suite.id):
            raise _name_taken(name)
        diff["name"] = {"from": suite.name, "to": name}
        suite.name = name
    if "description" in sent and sent["description"] != suite.description:
        diff["description"] = {"changed": True}
        suite.description = sent["description"]
    if "component_id" in sent and sent["component_id"] != suite.component_id:
        _check_component(db, org_id, suite.project_id, sent["component_id"])
        diff["component_id"] = {"from": str(suite.component_id) if suite.component_id else None,
                                "to": str(sent["component_id"]) if sent["component_id"] else None}
        suite.component_id = sent["component_id"]
    if diff:
        suite.updated_at = utcnow()
        audit.record(db, "suite.updated", actor_id=actor_id, org_id=org_id, entity_type="test_suite",
                     entity_id=suite.id, data={"name": suite.name, "changes": diff})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _name_taken(suite.name) from exc
    return suite


def delete_suite(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, suite_id: uuid.UUID) -> None:
    suite = repo.get_suite(db, org_id, suite_id, lock=True)
    if suite is None:
        raise NotFound("Test suite not found.")
    now = utcnow()
    cases = repo.soft_delete_cases_of_suite(db, org_id, suite.id, now)  # the cases go with their suite
    suite.deleted_at = now
    audit.record(db, "suite.deleted", actor_id=actor_id, org_id=org_id, entity_type="test_suite", entity_id=suite.id,
                 data={"name": suite.name, "cases_deleted": cases})
    db.commit()


# Cases ---------------------------------------------------------------------

def _steps_json(steps: list[StepIn]) -> list[dict[str, Any]]:
    return [{"id": str(s.id or uuid.uuid4()), "action": s.action, "expected": s.expected} for s in steps]


def get_case(db: Session, org_id: uuid.UUID, case_id: uuid.UUID) -> TestCase:
    case = repo.get_case(db, org_id, case_id)
    if case is None:
        raise NotFound("Test case not found.")
    return case


def get_case_by_ref(db: Session, org_id: uuid.UUID, ref: str) -> TestCase:
    """`ref` is a UUID or a key like TC-103. Another org's case, a deleted case and a malformed ref are all a 404."""
    case_id, number = parse_case_ref(ref)
    case = None
    if case_id is not None:
        case = repo.get_case(db, org_id, case_id)
    elif number is not None:
        case = repo.get_case_by_number(db, org_id, number)
    if case is None:
        raise NotFound("Test case not found.")
    return case


def project_id_of(db: Session, org_id: uuid.UUID, case: TestCase) -> uuid.UUID:
    return get_suite(db, org_id, case.suite_id).project_id


def project_ids_of(db: Session, org_id: uuid.UUID, cases: list[TestCase]) -> dict[uuid.UUID, uuid.UUID]:
    """{suite_id: project_id} for the cases (their suites are not deleted: deleting a suite deletes its cases)."""
    return {sid: get_suite(db, org_id, sid).project_id for sid in {c.suite_id for c in cases}}


def list_cases(db: Session, org_id: uuid.UUID, suite_id: uuid.UUID, params: PageParams, *, tag: str | None,
               case_type: str | None) -> tuple[list[TestCase], int]:
    get_suite(db, org_id, suite_id)  # 404 for a missing, deleted or foreign suite
    return paginate(db, repo.cases_query(org_id, suite_id, tag=tag, case_type=case_type), params)


def create_cases(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, suite_id: uuid.UUID, bodies: list[CaseIn], *,
                 ai_usage_id: uuid.UUID | None = None) -> list[TestCase]:
    """All or nothing: the numbers are reserved and every case is added in one transaction."""
    suite = get_suite(db, org_id, suite_id)
    if ai_usage_id is not None and not hooks.ai_usage_accepted(db, org_id, ai_usage_id):
        # The AI usage log arrives with I-14; until it registers its check no id can be valid
        raise _invalid("ai_usage_id", "This AI usage record does not exist.")
    numbers = repo.take_case_numbers(db, org_id, len(bodies))  # holds the org counter row lock until the commit
    cases = [TestCase(org_id=org_id, suite_id=suite.id, number=n, title=b.title.strip(), preconditions=b.preconditions,
                      steps=_steps_json(b.steps), tags=b.tags, priority=b.priority, case_type=b.case_type,
                      ai_generated=b.ai_generated) for n, b in zip(numbers, bodies, strict=True)]
    db.add_all(cases)
    db.flush()
    for case in cases:
        audit.record(db, "case.created", actor_id=actor_id, org_id=org_id, entity_type="test_case", entity_id=case.id,
                     data={"key": case_key(case.number), "title": case.title, "suite_id": str(suite.id),
                           "ai_generated": case.ai_generated})
    db.commit()
    return cases


def update_case(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, case_id: uuid.UUID, body: CaseUpdateIn) -> TestCase:
    case = repo.get_case(db, org_id, case_id, lock=True)
    if case is None:
        raise NotFound("Test case not found.")
    sent = body.model_dump(exclude_unset=True)
    if "suite_id" in sent and sent["suite_id"] != case.suite_id:
        current = get_suite(db, org_id, case.suite_id)
        try:
            target = get_suite(db, org_id, sent["suite_id"])
        except NotFound:
            raise _invalid("suite_id", "This suite does not exist in this workspace.") from None
        if target.project_id != current.project_id:
            raise _invalid("suite_id", "A case can only move to a suite of the same project.")
    diff: dict[str, Any] = {}
    for name in ("title", "preconditions", "priority", "case_type"):
        if name in sent and sent[name] != getattr(case, name):
            diff[name] = {"changed": True} if name == "preconditions" else {"from": getattr(case, name), "to": sent[name]}
            setattr(case, name, sent[name].strip() if name == "title" else sent[name])
    if "tags" in sent and sent["tags"] != case.tags:
        diff["tags"] = {"from": case.tags, "to": sent["tags"]}
        case.tags = sent["tags"]
    if "steps" in sent:
        steps = _steps_json(body.steps or [])
        if steps != case.steps:
            diff["steps"] = {"changed": True, "count": len(steps)}
            case.steps = steps
    if "suite_id" in sent and sent["suite_id"] != case.suite_id:
        diff["suite_id"] = {"from": str(case.suite_id), "to": str(sent["suite_id"])}
        case.suite_id = sent["suite_id"]
    if diff:
        case.updated_at = utcnow()
        audit.record(db, "case.updated", actor_id=actor_id, org_id=org_id, entity_type="test_case", entity_id=case.id,
                     data={"key": case_key(case.number), "changes": diff})
    db.commit()
    return case


def delete_case(db: Session, org_id: uuid.UUID, actor_id: uuid.UUID, case_id: uuid.UUID) -> None:
    case = repo.get_case(db, org_id, case_id, lock=True)
    if case is None:
        raise NotFound("Test case not found.")
    case.deleted_at = utcnow()  # the number stays used (D-016)
    audit.record(db, "case.deleted", actor_id=actor_id, org_id=org_id, entity_type="test_case", entity_id=case.id,
                 data={"key": case_key(case.number), "title": case.title})
    db.commit()
