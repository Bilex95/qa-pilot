"""The AI features of I-15 (AI_SPEC 3.1, 3.2, 3.4). Each one builds its tagged blocks from what the caller sent and what the project owns,
asks `service.run`, and maps the answer to ids the project really has: the model can never invent an id (AI_SPEC 2.7). Nothing is saved."""

import uuid

from sqlalchemy.orm import Session

from app.core.errors import NotFound, Unprocessable
from app.modules.ai.application import service
from app.modules.ai.domain import heuristics, similarity
from app.modules.ai.domain.prompt import block
from app.modules.ai.infrastructure import mock_features  # noqa: F401  (registers the mock answers)
from app.modules.ai.schemas.features import (
    BugDraftSuggestion,
    BugWriterIn,
    BugWriterOut,
    DuplicateCandidateOut,
    DuplicatesIn,
    DuplicatesOut,
    ExplainLogIn,
    LogExplanationAnswer,
    LogExplanationOut,
    TriageAnswer,
    TriageIn,
    TriageOut,
)
from app.modules.bugs.application import service as bugs
from app.modules.projects.application import service as projects
from app.modules.projects.infrastructure.models import Project

BUG_WRITER_TASK = (
    "You are a senior QA engineer. Turn the notes into a clear, reproducible bug report. Be factual and do not invent details that are not "
    "implied; if something is unknown, say so in the field or list it as missing information. Pick the environment and the component only "
    "from the lists given, or leave them empty."
)
EXPLAIN_LOG_TASK = "Explain what this log shows for a QA engineer. Identify the error, the likely cause and the most relevant lines."


def _bad_project(message: str) -> Unprocessable:
    return Unprocessable("Some fields are not valid.", details=[{"loc": ["body", "project_id"], "msg": message}])


def _project(db: Session, org_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    """The project must exist in this workspace and take new work; the error names the field like the bug form does."""
    try:
        project = projects.get_project(db, org_id, project_id)
    except NotFound:
        project = None
    if project is None:
        raise _bad_project("This project does not exist in this workspace.")
    if project.archived_at is not None:
        raise _bad_project("This project is archived.")
    return project


def _named(name: str | None, items: dict[str, uuid.UUID]) -> tuple[str | None, uuid.UUID | None]:
    """The project's own item the name points at (same name, any case), as (its name, its id); (None, None) when there is no match."""
    if not name:
        return None, None
    for own, item_id in items.items():
        if own.lower() == name.strip().lower():
            return own, item_id
    return None, None


def bug_writer(db: Session, org: service.Organization, user_id: uuid.UUID, body: BugWriterIn) -> BugWriterOut:
    project = _project(db, org.id, body.project_id)
    components = {c.name: c.id for c in projects.list_components(db, org.id, project.id)}
    environments = {e.name: e.id for e in projects.list_environments(db, org.id, project.id)}
    blocks = [block("bug_notes", body.notes)]
    if body.log and body.log.strip():
        blocks.append(block("log", body.log, log=True))
    blocks += [block("project_components", "\n".join(components)), block("project_environments", "\n".join(environments))]
    line = heuristics.first_sentence(body.notes, 120) or body.notes.strip()[:120]
    fallback = BugDraftSuggestion.model_construct(
        title=line if len(line) >= 5 else "Untitled bug report", description=body.notes[:4000], steps_to_reproduce=[], expected_result="",
        actual_result="", environment=None, component=None, suggested_severity="medium", missing_information=[])
    got = service.run(db, org, user_id, feature="bug_writer", task=BUG_WRITER_TASK, blocks=blocks, output_model=BugDraftSuggestion,
                      fallback=fallback, max_tokens=1200)
    v = got.value
    environment, environment_id = _named(v.environment, environments)
    component, component_id = _named(v.component, components)
    return BugWriterOut(
        title=v.title, description=v.description, steps_to_reproduce=list(v.steps_to_reproduce), expected_result=v.expected_result,
        actual_result=v.actual_result, environment=environment, environment_id=environment_id, component=component,
        component_id=component_id, suggested_severity=v.suggested_severity, missing_information=list(v.missing_information),
        fallback=got.fallback, usage_id=got.usage_id)


TRIAGE_TASK = (
    "Suggest severity, priority and component for this bug. Severity is user impact: critical means data loss, a crash, a security or "
    "payment problem or no workaround; high means a main function is broken; medium means a function is impaired with a workaround; low "
    "means cosmetic. Priority is fixing urgency: p1 urgent, p2 high, p3 normal, p4 low. Pick the component only from the list given, or "
    "leave it empty. Give a short reason a person can check."
)


def triage(db: Session, org: service.Organization, user_id: uuid.UUID, body: TriageIn) -> TriageOut:
    """Severity, priority and component for a bug that exists (`bug_id`, another workspace's is a 404) or for the fields of one that does
    not yet. Nothing is changed: the screen applies an accepted suggestion with the normal bug update (so its permission checks and its
    activity entries apply)."""
    if body.bug_id is not None:
        bug = bugs.get_bug(db, org.id, body.bug_id)
        project = projects.get_project(db, org.id, bug.project_id)
        title, description, steps, actual = bug.title, bug.description, list(bug.steps_to_reproduce or []), bug.actual_result
        environment_id = bug.environment_id
    else:
        project = _project(db, org.id, body.project_id)  # type: ignore[arg-type]  # the schema guarantees project_id and title
        title, description, steps, actual = body.title or "", body.description or "", body.steps or [], body.actual_result or ""
        environment_id = body.environment_id
    components = {c.name: c.id for c in projects.list_components(db, org.id, project.id)}
    notes = {c.name: c.description for c in projects.list_components(db, org.id, project.id) if c.description}
    environments = {e.id: e.name for e in projects.list_environments(db, org.id, project.id)}
    if environment_id is not None and environment_id not in environments:
        if body.bug_id is None:
            raise Unprocessable("Some fields are not valid.", details=[{"loc": ["body", "environment_id"],
                                                                         "msg": "This environment does not exist in this project."}])
        environment_id = None
    blocks = [block("bug_title", title), block("bug_description", description), block("bug_steps", "\n".join(steps)),
              block("bug_actual_result", actual), block("bug_environment", environments.get(environment_id, "") if environment_id else ""),
              block("project_components", "\n".join(components)),
              block("component_descriptions", "\n".join(f"{n}: {d}" for n, d in notes.items()))]
    fallback = TriageAnswer.model_construct(severity="medium", priority="p3", component=None,
                                            reason="No suggestion is available right now.", confidence="low")
    got = service.run(db, org, user_id, feature="triage", task=TRIAGE_TASK, blocks=blocks, output_model=TriageAnswer, fallback=fallback,
                      max_tokens=400)
    if got.fallback:
        reason = "The assistant could not suggest a triage. Set severity, priority and component yourself."
        return TriageOut(severity=None, priority=None, component=None, component_id=None, reason=reason, confidence=None, fallback=True,
                         usage_id=got.usage_id)
    v = got.value
    component, component_id = _named(v.component, components)
    return TriageOut(severity=v.severity, priority=v.priority, component=component, component_id=component_id, reason=v.reason,
                     confidence=v.confidence, fallback=False, usage_id=got.usage_id)


def explain_log(db: Session, org: service.Organization, user_id: uuid.UUID, body: ExplainLogIn) -> LogExplanationOut:
    data = block("log", body.log, log=True)
    fallback = LogExplanationAnswer(summary="Could not analyse the log", likely_cause="", key_lines=heuristics.error_lines(data.text),
                                    error_type=None)
    got = service.run(db, org, user_id, feature="explain_log", task=EXPLAIN_LOG_TASK, blocks=[data], output_model=LogExplanationAnswer,
                      fallback=fallback, max_tokens=600)
    v = got.value
    return LogExplanationOut(summary=v.summary, likely_cause=v.likely_cause, key_lines=list(v.key_lines), error_type=v.error_type,
                             fallback=got.fallback, usage_id=got.usage_id)


def duplicates(db: Session, org: service.Organization, user_id: uuid.UUID, body: DuplicatesIn) -> DuplicatesOut:
    """Similar open bugs of the project (D-013): TF-IDF over the title (twice), the actual result and the steps. No model, no tokens."""
    project = _project(db, org.id, body.project_id)
    pool = [b for b in bugs.open_bugs_of_project(db, org.id, project.id, similarity.MAX_CANDIDATES) if b.id != body.exclude_bug_id]
    query = similarity.document(body.title, body.actual_result or "", body.steps or [])
    found = similarity.find_duplicates(query, [(b.id, similarity.document(b.title, b.actual_result, b.steps_to_reproduce)) for b in pool])
    by_id = {b.id: b for b in pool}
    summaries = bugs.summaries(db, org.id, [by_id[c.bug_id] for c in found])
    usage_id = service.log_local(db, org, user_id, "duplicates")
    return DuplicatesOut(candidates=[DuplicateCandidateOut(bug=s, score=c.score) for s, c in zip(summaries, found, strict=True)],
                         usage_id=usage_id)

