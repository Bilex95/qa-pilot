"""Test suite and case persistence. Every query takes org_id (NFR-TEN-02) and hides soft deleted rows (D-016)."""

import uuid
from datetime import datetime

from sqlalchemy import Select, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.modules.testing.infrastructure.models import TestCase, TestCaseCounter, TestSuite

# Suites -------------------------------------------------------------------

def suites_query(org_id: uuid.UUID, project_id: uuid.UUID | None) -> Select[TestSuite]:
    stmt = select(TestSuite).where(TestSuite.org_id == org_id, TestSuite.deleted_at.is_(None))
    if project_id:
        stmt = stmt.where(TestSuite.project_id == project_id)
    return stmt.order_by(func.lower(TestSuite.name), TestSuite.id)


def get_suite(db: Session, org_id: uuid.UUID, suite_id: uuid.UUID, *, lock: bool = False) -> TestSuite | None:
    stmt = select(TestSuite).where(TestSuite.org_id == org_id, TestSuite.id == suite_id, TestSuite.deleted_at.is_(None))
    return db.scalar(stmt.with_for_update() if lock else stmt)


def suite_name_taken(db: Session, project_id: uuid.UUID, name: str, *, except_id: uuid.UUID | None = None) -> bool:
    stmt = select(func.count()).select_from(TestSuite).where(
        TestSuite.project_id == project_id, TestSuite.deleted_at.is_(None), func.lower(TestSuite.name) == name.lower())
    if except_id:
        stmt = stmt.where(TestSuite.id != except_id)
    return db.scalar(stmt) != 0


def case_counts(db: Session, org_id: uuid.UUID, suite_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not suite_ids:
        return {}
    rows = db.execute(select(TestCase.suite_id, func.count()).where(
        TestCase.org_id == org_id, TestCase.suite_id.in_(suite_ids), TestCase.deleted_at.is_(None))
        .group_by(TestCase.suite_id))
    return {suite_id: int(n) for suite_id, n in rows}


def soft_delete_cases_of_suite(db: Session, org_id: uuid.UUID, suite_id: uuid.UUID, now: datetime) -> int:
    result = db.execute(
        update(TestCase).where(TestCase.org_id == org_id, TestCase.suite_id == suite_id, TestCase.deleted_at.is_(None))
        .values(deleted_at=now).execution_options(synchronize_session=False))
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


# Cases --------------------------------------------------------------------

def cases_query(org_id: uuid.UUID, suite_id: uuid.UUID, *, tag: str | None,
                case_type: str | None) -> Select[TestCase]:
    stmt = select(TestCase).where(TestCase.org_id == org_id, TestCase.suite_id == suite_id, TestCase.deleted_at.is_(None))
    if tag:
        stmt = stmt.where(TestCase.tags.contains([tag.strip().lower()]))
    if case_type:
        stmt = stmt.where(TestCase.case_type == case_type)
    return stmt.order_by(TestCase.number)


def get_case(db: Session, org_id: uuid.UUID, case_id: uuid.UUID, *, lock: bool = False) -> TestCase | None:
    stmt = select(TestCase).where(TestCase.org_id == org_id, TestCase.id == case_id, TestCase.deleted_at.is_(None))
    return db.scalar(stmt.with_for_update() if lock else stmt)


def get_case_by_number(db: Session, org_id: uuid.UUID, number: int) -> TestCase | None:
    return db.scalar(select(TestCase).where(
        TestCase.org_id == org_id, TestCase.number == number, TestCase.deleted_at.is_(None)))


def take_case_numbers(db: Session, org_id: uuid.UUID, count: int) -> list[int]:
    """Reserve `count` consecutive case numbers in one UPSERT ... RETURNING. The row lock it takes is held until the
    caller commits, so two cases created at once in one org never get the same number; numbers are never given back."""
    stmt = pg_insert(TestCaseCounter).values(org_id=org_id, last_number=count)
    stmt = stmt.on_conflict_do_update(
        index_elements=[TestCaseCounter.org_id], set_={"last_number": TestCaseCounter.last_number + count})
    last = db.execute(stmt.returning(TestCaseCounter.last_number)).scalar_one()
    return list(range(int(last) - count + 1, int(last) + 1))
