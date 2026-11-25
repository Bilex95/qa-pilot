"""Seed projects, bugs, tests and releases through the services (I-12, REQ-060, D-066).

Everything is written by the same services the API uses, so the timeline, the audit trail, the counters and the rules are the real
ones. The only thing the seed does by hand is move the clock back afterwards (`_retime_*`): ages are relative to the moment of seeding.
A project that already exists in an organization (same key) is left alone, so running the seed twice changes nothing.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.permissions import Role
from app.modules.bugs.application import detail as bug_detail
from app.modules.bugs.application import service as bug_service
from app.modules.bugs.application.service import Actor
from app.modules.bugs.infrastructure.models import Bug, BugActivity, Comment
from app.modules.bugs.schemas.bugs import BugCreateIn
from app.modules.projects.application import service as project_service
from app.modules.projects.infrastructure.models import Label, Project
from app.modules.releases.application import service as release_service
from app.modules.releases.infrastructure.models import Release
from app.modules.releases.schemas.releases import ReleaseIn, ReleaseUpdateIn
from app.modules.testing.application import runs as run_service
from app.modules.testing.application import service as test_service
from app.modules.testing.infrastructure.models import TestCase, TestRun, TestRunResult, TestSuite
from app.modules.testing.schemas.runs import ResultUpdateIn, RunCreateIn, RunUpdateIn
from app.modules.testing.schemas.testing import CaseIn, StepIn, SuiteIn
from app.seed.domain_data import DATA, BugSpec, OrgData, ProjectSpec, ReleaseSpec, RunSpec, SuiteSpec, Totals
from app.seed.scenarios import USERS, SeedOrg

# The moves that take a new bug to each status (every one is a move of the workflow table, D-058)
PATH: dict[str, tuple[str, ...]] = {
    "new": (),
    "triaged": ("triaged",),
    "in_progress": ("triaged", "in_progress"),
    "fixed": ("triaged", "in_progress", "fixed"),
    "ready_for_retest": ("triaged", "in_progress", "fixed", "ready_for_retest"),
    "verified": ("triaged", "in_progress", "fixed", "ready_for_retest", "verified"),
    "closed": ("triaged", "in_progress", "fixed", "ready_for_retest", "verified", "closed"),
    "reopened": ("triaged", "in_progress", "fixed", "reopened"),
    "wont_fix": ("wont_fix",),
}
PRIORITY = {"critical": "p1", "high": "p2", "medium": "p3", "low": "p4"}
CASE_TYPES = ("positive", "negative", "edge")
CASE_PRIORITIES = ("p2", "p3", "p3", "p4")
RESOLVED = {"fixed", "wont_fix"}


class _People:
    """The people of one seeded organization, by user key."""

    def __init__(self, org: SeedOrg) -> None:
        self.org = org
        self.roles = {k: Role(r) for k, r in org.members}
        self.lead = next(k for k, r in org.members if r in ("qa_lead", "org_admin"))
        self.reporters = [k for k, r in org.members if r in ("qa_lead", "qa_engineer")]
        self.developers = [k for k, r in org.members if r == "developer"]

    def id(self, key: str) -> uuid.UUID:
        return USERS[key].id

    def actor(self, key: str) -> Actor:
        return Actor(user_id=USERS[key].id, role=self.roles[key])

    def assignee(self, spec: str | None) -> uuid.UUID | None:
        if spec is None:
            return None
        return self.id(self.developers[0] if spec == "dev" else spec)


# Moving the clock back -------------------------------------------------------------------------------------------------------------

def _retime_bug(db: Session, bug_id: uuid.UUID, created: datetime, span_hours: float) -> None:
    """Spread the bug's timeline from `created` over `span_hours` and make the bug's own dates agree with it."""
    bug = db.get(Bug, bug_id)
    if bug is None:
        raise LookupError(f"seeded bug {bug_id} disappeared")
    acts = list(db.scalars(select(BugActivity).where(BugActivity.bug_id == bug_id).order_by(BugActivity.created_at)))
    last = max(len(acts) - 1, 1)
    times = [created + timedelta(hours=span_hours * i / last) for i in range(len(acts))]
    for act, when in zip(acts, times, strict=True):
        act.created_at = when
    comment_times = [t for a, t in zip(acts, times, strict=True) if a.kind == "commented"]
    comments = list(db.scalars(select(Comment).where(Comment.bug_id == bug_id).order_by(Comment.created_at)))
    for comment, when in zip(comments, comment_times, strict=False):
        comment.created_at = comment.updated_at = when
    moves = [(a, t) for a, t in zip(acts, times, strict=True) if a.kind == "status_changed"]
    bug.created_at = created
    bug.status_changed_at = bug.updated_at = times[-1] if times else created
    if bug.resolved_at is not None:
        bug.resolved_at = next(t for a, t in reversed(moves) if a.new_value in RESOLVED)
    if bug.closed_at is not None:
        bug.closed_at = next(t for a, t in reversed(moves) if a.new_value == "closed")
    db.commit()


def _retime_run(db: Session, run: TestRun, started: datetime) -> None:
    run.created_at = run.started_at = started
    results = list(db.scalars(select(TestRunResult).where(TestRunResult.run_id == run.id).order_by(TestRunResult.position)))
    for i, result in enumerate(results):
        if result.executed_at is not None:
            result.executed_at = started + timedelta(minutes=5 * (i + 1))
    last = max((r.executed_at for r in results if r.executed_at is not None), default=started)
    run.updated_at = last
    if run.completed_at is not None:
        run.completed_at = run.updated_at = last + timedelta(minutes=5)
    db.commit()


# One project -------------------------------------------------------------------------------------------------------------------------

def _seed_bug(db: Session, people: _People, project: Project, comps: dict[str, uuid.UUID], labels: dict[str, uuid.UUID],
              spec: BugSpec, index: int, now: datetime) -> Bug:
    reporter = people.reporters[index % len(people.reporters)]
    body = BugCreateIn(
        project_id=project.id, title=spec.title,
        description=f"{spec.title}. Reported while testing the {project.name.lower()}.",
        steps_to_reproduce=["Sign in as a shipper.", f"Open the {(spec.comp or 'main').lower()} screen.",
                            "Repeat the action from the title."],
        expected_result="It works as described in the requirements.", actual_result="The problem described in the title.",
        severity=spec.severity, priority=PRIORITY[spec.severity],  # type: ignore[arg-type]
        component_id=comps.get(spec.comp or ""), label_ids=[labels[n] for n in spec.labels], assignee_id=people.assignee(spec.assignee),
    )
    bug = bug_service.create_bug(db, people.org.id, people.actor(reporter), body)
    lead = people.actor(people.lead)
    for to in PATH[spec.status]:
        bug_service.transition_bug(db, people.org.id, lead, bug.id, to, None)
    if index % 6 == 0:
        bug_detail.add_comment(db, people.org.id, lead, bug.id, "Reproduced on the test environment. Details are in the description.")
    if index % 6 == 3 and people.developers:
        bug_detail.add_comment(db, people.org.id, people.actor(people.developers[0]), bug.id, "I am looking into this.")
    age_hours = spec.age_days * 24
    span = spec.done_hours if spec.done_hours is not None else min(age_hours * 0.4, 96.0)
    _retime_bug(db, bug.id, now - timedelta(hours=age_hours), min(span, age_hours))
    return bug


def _seed_suite(db: Session, people: _People, project: Project, comps: dict[str, uuid.UUID], spec: SuiteSpec) -> TestSuite:
    lead = people.id(people.lead)
    suite = test_service.create_suite(db, people.org.id, lead, SuiteIn(project_id=project.id, name=spec.name,
                                                                      component_id=comps.get(spec.component or "")))
    cases = [
        CaseIn(
            title=title, preconditions="The shipper account exists and is signed in.",
            steps=[StepIn(action="Open the screen for this check.", expected="The screen loads without an error."),
                   StepIn(action=f"Do this: {title.lower()}.", expected="The result matches the requirement."),
                   StepIn(action="Look at the result.", expected="No error message is shown.")],
            case_type=CASE_TYPES[i % 3], priority=CASE_PRIORITIES[i % 4],  # type: ignore[arg-type]
        )
        for i, title in enumerate(spec.cases)
    ]
    test_service.create_cases(db, people.org.id, lead, suite.id, cases)
    return suite


def _seed_run(db: Session, people: _People, project: Project, suites: dict[str, TestSuite], releases: dict[str, Release],
              spec: RunSpec, now: datetime) -> TestRun:
    lead = people.id(people.lead)
    release = releases.get(spec.release or "")
    run = run_service.create_run(db, people.org.id, lead, RunCreateIn(
        project_id=project.id, name=spec.name, suite_ids=[suites[s].id for s in spec.suites], release_id=release.id if release else None))
    results = list(db.scalars(select(TestRunResult).where(TestRunResult.run_id == run.id).order_by(TestRunResult.position)))
    plan = [name for name, count in spec.results for _ in range(count)]
    for i, (result, name) in enumerate(zip(results, plan, strict=False)):
        who = people.id(people.reporters[i % len(people.reporters)])
        body = ResultUpdateIn(result=name, failed_step_index=1, actual_result="The result did not match the requirement.") \
            if name == "fail" else ResultUpdateIn(result=name)  # type: ignore[arg-type]
        run_service.update_result(db, people.org.id, who, run.id, result.id, body)
    if spec.completed:
        run_service.update_run(db, people.org.id, lead, run.id, RunUpdateIn(status="completed"))
    db.refresh(run)
    _retime_run(db, run, now - timedelta(days=spec.age_days))
    return run


def _seed_release(db: Session, people: _People, project: Project, spec: ReleaseSpec, now: datetime) -> Release:
    lead = people.id(people.lead)
    target = (now + timedelta(days=spec.target_in_days)).date()
    release = release_service.create_release(db, people.org.id, lead, ReleaseIn(
        project_id=project.id, name=spec.name, target_date=target, description=spec.description))
    if spec.status != "planned":
        release_service.update_release(db, people.org.id, lead, release.id, ReleaseUpdateIn(status=spec.status))  # type: ignore[arg-type]
    return release


def _seed_project(db: Session, people: _People, spec: ProjectSpec, labels: dict[str, uuid.UUID], now: datetime) -> None:
    org_id, lead = people.org.id, people.id(people.lead)
    if db.scalar(select(Project).where(Project.org_id == org_id, Project.key == spec.key)) is not None:
        return  # seeded before: leave it (and anything added to it since) alone
    project = project_service.create_project(db, org_id, actor_id=lead, name=spec.name, key=spec.key, description=spec.description)
    comps = {name: project_service.create_component(db, org_id, project.id, name=name, description="").id for name in spec.components}
    releases = {r.name: _seed_release(db, people, project, r, now) for r in spec.releases}
    bugs = [_seed_bug(db, people, project, comps, labels, bug, i, now) for i, bug in enumerate(spec.bugs)]
    suites = {s.name: _seed_suite(db, people, project, comps, s) for s in spec.suites}
    for run in spec.runs:
        _seed_run(db, people, project, suites, releases, run, now)
    for release in spec.releases:
        if release.bug_rows:
            release_service.link_bugs(db, org_id, lead, releases[release.name].id, [bugs[i].id for i in release.bug_rows])


def seed_domain(db: Session, scenario: str, org: SeedOrg, now: datetime | None = None) -> None:
    """Add the scenario's projects, bugs, suites, cases, runs and releases to one seeded organization."""
    data: OrgData | None = DATA[scenario].get(org.key)
    if data is None:
        return
    from app import main as _routes  # noqa: F401  (importing the routes registers the cross module hooks the services use)

    now = now or utcnow()
    people = _People(org)
    existing = {name.lower(): lid for lid, name in db.execute(select(Label.id, Label.name).where(Label.org_id == org.id))}
    labels: dict[str, uuid.UUID] = {}
    for name, color in data.labels:
        labels[name] = existing.get(name.lower()) or project_service.create_label(
            db, org.id, actor_id=people.id(people.lead), name=name, color=color).id
    for spec in data.projects:
        _seed_project(db, people, spec, labels, now)


def counts(db: Session, scenario: str, orgs: list[SeedOrg]) -> Totals:
    """What is in the database for the scenario's projects (found by organization and key)."""
    total = Totals()
    for org in orgs:
        data = DATA[scenario].get(org.key)
        if data is None:
            continue
        ids = list(db.scalars(select(Project.id).where(Project.org_id == org.id, Project.key.in_([p.key for p in data.projects]))))
        suites = list(db.scalars(select(TestSuite.id).where(TestSuite.project_id.in_(ids))))

        def n(model: type, *where: object) -> int:
            return int(db.scalar(select(func.count()).select_from(model).where(*where)) or 0)  # type: ignore[arg-type]

        total = total + Totals(
            len(ids), n(Bug, Bug.project_id.in_(ids), Bug.deleted_at.is_(None)), len(suites), n(TestCase, TestCase.suite_id.in_(suites)),
            n(TestRun, TestRun.project_id.in_(ids)), n(Release, Release.project_id.in_(ids)))
    return total
