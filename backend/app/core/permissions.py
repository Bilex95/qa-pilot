"""Role based permission matrix (docs/requirements/PERSONAS_AND_ROLES.md section 3).

Each action key maps to the roles allowed to perform it at all. Record level rules
(own records only, assignee only, developer self assign) are enforced in the module
services on top of this table.
"""

from enum import StrEnum


class Role(StrEnum):
    ORG_ADMIN = "org_admin"
    QA_LEAD = "qa_lead"
    QA_ENGINEER = "qa_engineer"
    DEVELOPER = "developer"
    VIEWER = "viewer"


ADMIN, LEAD, QA, DEV, VIEW = Role.ORG_ADMIN, Role.QA_LEAD, Role.QA_ENGINEER, Role.DEVELOPER, Role.VIEWER
ALL = frozenset(Role)
NOT_VIEWER = frozenset({ADMIN, LEAD, QA, DEV})
QA_ROLES = frozenset({ADMIN, LEAD, QA})
LEADS = frozenset({ADMIN, LEAD})
ADMIN_ONLY = frozenset({ADMIN})

PERMISSIONS: dict[str, frozenset[Role]] = {
    # 3.1 Org, members, settings
    "org.read": ALL,
    "org.update_settings": ADMIN_ONLY,
    "member.list": LEADS,
    "member.list_basic": ALL,
    "member.update_role": ADMIN_ONLY,
    "member.remove": ADMIN_ONLY,
    "member.reset_password": ADMIN_ONLY,  # issue a password reset link for a member (D-045, D-055)
    "invitation.create": ADMIN_ONLY,
    "invitation.revoke": ADMIN_ONLY,
    "invitation.list": LEADS,
    "audit.read": ADMIN_ONLY,
    "label.manage": LEADS,
    # 3.2 Projects
    "project.read": ALL,
    "project.create": LEADS,
    "project.update": LEADS,
    "project.archive": LEADS,
    "component.manage": LEADS,
    "environment.manage": LEADS,
    # 3.3 Bugs (record level rules in the bugs service)
    "bug.read": ALL,
    "bug.create": NOT_VIEWER,
    "bug.update_fields": NOT_VIEWER,  # developer: reported by me
    "bug.set_severity_priority": QA_ROLES,
    "bug.assign": NOT_VIEWER,  # developer: self, only when unassigned (D-006)
    "bug.transition": NOT_VIEWER,  # per workflow table and assignee rule
    "bug.delete": LEADS,
    "comment.create": ALL,  # viewers may comment (D-007)
    "comment.update": ALL,  # own comments
    "comment.delete": ALL,  # own comments; admin any
    "attachment.upload": NOT_VIEWER,
    "attachment.delete": NOT_VIEWER,  # QA engineer and developer: own uploads
    "attachment.download": ALL,
    "saved_view.manage": ALL,
    # 3.4 Test management
    "test.read": ALL,
    "suite.manage": QA_ROLES,
    "case.manage": QA_ROLES,
    "run.create": QA_ROLES,
    "run.execute": QA_ROLES,
    "run.complete": QA_ROLES,
    "run.bug_from_failure": QA_ROLES,
    # 3.5 Releases, dashboard, reports
    "release.read": ALL,
    "release.manage": LEADS,
    "dashboard.read": ALL,
    "report.read": ALL,
    "report.export": ALL,
    # 3.6 AI (D-028)
    "ai.bug_writer": NOT_VIEWER,
    "ai.explain_log": NOT_VIEWER,
    "ai.duplicates": NOT_VIEWER,
    "ai.triage": QA_ROLES,
    "ai.test_cases": QA_ROLES,
    "ai.release_summary": LEADS,
    "ai.usage_read": LEADS,
    "ai.configure": ADMIN_ONLY,
}


def can(role: Role | str, action: str) -> bool:
    if action not in PERMISSIONS:
        raise KeyError(f"Unknown action {action!r}")
    return Role(role) in PERMISSIONS[action]
