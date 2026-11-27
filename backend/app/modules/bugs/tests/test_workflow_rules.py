"""The state machine as data (DOMAIN_MODEL section 4): every pair of statuses against every role, from an independent copy of
the table, so a change to the rules has to change this test too (I-04)."""

from datetime import UTC, datetime

import pytest

from app.core.permissions import Role
from app.modules.bugs.domain import workflow
from app.modules.bugs.domain.rules import STATUSES

# (from, to, roles besides Org Admin and QA Lead), copied from DOMAIN_MODEL.md section 4
SPEC = [
    ("new", "triaged", {"qa_engineer"}),
    ("new", "wont_fix", set()),
    ("triaged", "in_progress", {"developer"}),
    ("triaged", "wont_fix", set()),
    ("in_progress", "fixed", {"developer"}),
    ("in_progress", "triaged", {"developer"}),
    ("fixed", "ready_for_retest", {"developer"}),
    ("fixed", "reopened", {"qa_engineer"}),
    ("ready_for_retest", "verified", {"qa_engineer"}),
    ("ready_for_retest", "reopened", {"qa_engineer"}),
    ("verified", "closed", {"qa_engineer"}),
    ("verified", "reopened", {"qa_engineer"}),
    ("closed", "reopened", {"qa_engineer"}),
    ("wont_fix", "reopened", set()),
    ("reopened", "triaged", set()),
    ("reopened", "in_progress", {"developer"}),
]
ROLES = list(Role)


def test_the_table_has_exactly_the_documented_moves() -> None:
    assert [(t.from_status, t.to_status) for t in workflow.TRANSITIONS] == [(a, b) for a, b, _ in SPEC]
    assert len(SPEC) == 16


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("from_status", STATUSES)
@pytest.mark.parametrize("to_status", STATUSES)
def test_every_pair_and_role(role: Role, from_status: str, to_status: str) -> None:
    spec = {(a, b): extra for a, b, extra in SPEC}
    expected = (from_status, to_status) in spec and (role in (Role.ORG_ADMIN, Role.QA_LEAD) or role.value in spec[(from_status, to_status)])
    found = workflow.find(from_status, to_status)
    got = found is not None and role in found.roles
    assert got is expected
    # allowed_targets agrees with the table when the record rule is satisfied (assignee, or unassigned)
    listed = to_status in workflow.allowed_targets(from_status, role, assignee_is_me=True, unassigned=False)
    assert listed is expected


@pytest.mark.parametrize("role", ROLES)
def test_a_developer_needs_the_bug_to_be_theirs_or_unassigned_everyone_else_does_not(role: Role) -> None:
    for status in STATUSES:
        theirs = workflow.allowed_targets(status, role, assignee_is_me=True, unassigned=False)
        unassigned = workflow.allowed_targets(status, role, assignee_is_me=False, unassigned=True)
        someone_else = workflow.allowed_targets(status, role, assignee_is_me=False, unassigned=False)
        assert theirs == unassigned
        if role is Role.DEVELOPER or role is Role.VIEWER:
            assert someone_else == []
        else:
            assert someone_else == theirs


def test_a_viewer_never_moves_anything() -> None:
    assert all(workflow.allowed_targets(s, Role.VIEWER, assignee_is_me=True, unassigned=True) == [] for s in STATUSES)


def test_side_effects_of_the_moves() -> None:
    now = datetime(2026, 11, 21, 12, 0, tzinfo=UTC)
    assert workflow.effects_of("fixed", now) == {"resolved_at": now}
    assert workflow.effects_of("wont_fix", now) == {"resolved_at": now}
    assert workflow.effects_of("closed", now) == {"closed_at": now}
    assert workflow.effects_of("reopened", now) == {"resolved_at": None, "closed_at": None}
    for status in ("triaged", "in_progress", "ready_for_retest", "verified"):
        assert workflow.effects_of(status, now) == {}
