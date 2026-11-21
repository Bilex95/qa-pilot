"""Test run persistence. Every query takes org_id (NFR-TEN-02)."""

import uuid
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.modules.testing.domain.rules import pass_rate
from app.modules.testing.infrastructure.models import TestCase, TestRun, TestRunCounter, TestRunResult, TestSuite


def take_run_number(db: Session, org_id: uuid.UUID) -> int:
    """The next run number of the org. The UPSERT holds the counter row lock until the caller commits."""
    stmt = pg_insert(TestRunCounter).values(org_id=org_id, last_number=1)
    stmt = stmt.on_conflict_do_update(index_elements=[TestRunCounter.org_id], set_={"last_number": TestRunCounter.last_number + 1})
    return int(db.execute(stmt.returning(TestRunCounter.last_number)).scalar_one())


def runs_query(org_id: uuid.UUID, *, project_id: uuid.UUID | None, status: str | None,
               release_id: uuid.UUID | None) -> Select[Any]:
    stmt = select(TestRun).where(TestRun.org_id == org_id)
    if project_id:
        stmt = stmt.where(TestRun.project_id == project_id)
    if status:
        stmt = stmt.where(TestRun.status == status)
    if release_id:
        stmt = stmt.where(TestRun.release_id == release_id)
    return stmt.order_by(TestRun.started_at.desc(), TestRun.id)


def get_run(db: Session, org_id: uuid.UUID, run_id: uuid.UUID, *, lock: bool = False) -> TestRun | None:
    stmt = select(TestRun).where(TestRun.org_id == org_id, TestRun.id == run_id)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def get_run_by_number(db: Session, org_id: uuid.UUID, number: int) -> TestRun | None:
    return db.scalar(select(TestRun).where(TestRun.org_id == org_id, TestRun.number == number))


def results_of(db: Session, org_id: uuid.UUID, run_id: uuid.UUID) -> list[TestRunResult]:
    return list(db.scalars(select(TestRunResult).where(TestRunResult.org_id == org_id, TestRunResult.run_id == run_id)
                           .order_by(TestRunResult.position)))


def get_result(db: Session, org_id: uuid.UUID, run_id: uuid.UUID, result_id: uuid.UUID, *,
               lock: bool = False) -> TestRunResult | None:
    stmt = select(TestRunResult).where(TestRunResult.org_id == org_id, TestRunResult.run_id == run_id,
                                       TestRunResult.id == result_id)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def get_result_any_run(db: Session, org_id: uuid.UUID, result_id: uuid.UUID) -> tuple[TestRunResult, TestRun] | None:
    row = db.execute(select(TestRunResult, TestRun).join(TestRun, TestRun.id == TestRunResult.run_id)
                     .where(TestRunResult.org_id == org_id, TestRunResult.id == result_id)).first()
    return (row[0], row[1]) if row else None


def counts_by_run(db: Session, org_id: uuid.UUID, run_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    out: dict[uuid.UUID, dict[str, int]] = {rid: {} for rid in run_ids}
    if run_ids:
        rows = db.execute(select(TestRunResult.run_id, TestRunResult.result, func.count()).where(
            TestRunResult.org_id == org_id, TestRunResult.run_id.in_(run_ids)).group_by(TestRunResult.run_id, TestRunResult.result))
        for run_id, result, n in rows:
            out[run_id][result] = int(n)
    return out


def cases_for_run(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, *, suite_ids: list[uuid.UUID],
                  case_ids: list[uuid.UUID]) -> list[tuple[TestCase, TestSuite]]:
    """The cases of the chosen suites plus the chosen cases, each once, in case number order. Only cases and suites that are
    not deleted and belong to the project are returned, so the caller can tell when something asked for was left out."""
    stmt = (select(TestCase, TestSuite).join(TestSuite, TestSuite.id == TestCase.suite_id)
            .where(TestCase.org_id == org_id, TestCase.deleted_at.is_(None), TestSuite.deleted_at.is_(None),
                   TestSuite.project_id == project_id)
            .order_by(TestCase.number))
    clauses = []
    if suite_ids:
        clauses.append(TestCase.suite_id.in_(suite_ids))
    if case_ids:
        clauses.append(TestCase.id.in_(case_ids))
    if not clauses:
        return []
    return [(c, s) for c, s in db.execute(stmt.where(or_(*clauses))).all()]


def existing_suite_ids(db: Session, org_id: uuid.UUID, project_id: uuid.UUID, suite_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    if not suite_ids:
        return set()
    return set(db.scalars(select(TestSuite.id).where(TestSuite.org_id == org_id, TestSuite.project_id == project_id,
                                                      TestSuite.deleted_at.is_(None), TestSuite.id.in_(suite_ids))))


def release_run_counts(db: Session, org_id: uuid.UUID, release_ids: list[uuid.UUID]) -> tuple[
        dict[uuid.UUID, dict[str, int]], dict[uuid.UUID, dict[str, int]]]:
    """(runs per release per status, results per release per result) over the runs linked to each release."""
    runs: dict[uuid.UUID, dict[str, int]] = {rid: {} for rid in release_ids}
    results: dict[uuid.UUID, dict[str, int]] = {rid: {} for rid in release_ids}
    if not release_ids:
        return runs, results
    for rid, status, n in db.execute(select(TestRun.release_id, TestRun.status, func.count()).where(
            TestRun.org_id == org_id, TestRun.release_id.in_(release_ids)).group_by(TestRun.release_id, TestRun.status)):
        if rid is not None:
            runs[rid][status] = int(n)
    for rid, result, n in db.execute(select(TestRun.release_id, TestRunResult.result, func.count())
                                     .join(TestRun, TestRun.id == TestRunResult.run_id)
                                     .where(TestRun.org_id == org_id, TestRun.release_id.in_(release_ids))
                                     .group_by(TestRun.release_id, TestRunResult.result)):
        if rid is not None:
            results[rid][result] = int(n)
    return runs, results


def runs_of_release(db: Session, org_id: uuid.UUID, release_id: uuid.UUID) -> list[TestRun]:
    return list(db.scalars(select(TestRun).where(TestRun.org_id == org_id, TestRun.release_id == release_id)
                           .order_by(TestRun.started_at.desc(), TestRun.id)))


def get_runs(db: Session, org_id: uuid.UUID, run_ids: list[uuid.UUID]) -> list[TestRun]:
    return list(db.scalars(select(TestRun).where(TestRun.org_id == org_id, TestRun.id.in_(run_ids)).with_for_update()))


def last_run_pass_rates(db: Session, org_id: uuid.UUID, suite_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    """Pass rate (0 to 100) of each suite in the last completed run that had cases of it (`suite_id` is the snapshot)."""
    if not suite_ids:
        return {}
    pairs = (select(TestRunResult.suite_id.label("suite_id"), TestRun.id.label("run_id"), TestRun.completed_at.label("done"))
             .join(TestRun, TestRun.id == TestRunResult.run_id)
             .where(TestRunResult.org_id == org_id, TestRunResult.suite_id.in_(suite_ids), TestRun.status == "completed")
             .distinct().subquery())
    ranked = select(pairs.c.suite_id, pairs.c.run_id,
                    func.row_number().over(partition_by=pairs.c.suite_id, order_by=(pairs.c.done.desc(), pairs.c.run_id)).label("rn")
                    ).subquery()
    last = select(ranked.c.suite_id, ranked.c.run_id).where(ranked.c.rn == 1).subquery()
    rows = db.execute(select(TestRunResult.suite_id, TestRunResult.result, func.count())
                      .join(last, (last.c.suite_id == TestRunResult.suite_id) & (last.c.run_id == TestRunResult.run_id))
                      .group_by(TestRunResult.suite_id, TestRunResult.result)).all()
    per: dict[uuid.UUID, dict[str, int]] = {}
    for suite_id, result, n in rows:
        per.setdefault(suite_id, {})[result] = int(n)
    return {sid: float(rate) for sid, counts in per.items() if (rate := pass_rate(counts)) is not None}
