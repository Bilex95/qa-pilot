"""Imports every module's SQLAlchemy models so Alembic and the seed see the full metadata."""

from app.modules.ai.infrastructure.models import AIUsage
from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.auth.infrastructure.models import PasswordReset, RefreshToken, User
from app.modules.bugs.infrastructure.models import Attachment, Bug, BugActivity, BugLabel, Comment, SavedView
from app.modules.orgs.infrastructure.models import Invitation, Membership, Organization
from app.modules.projects.infrastructure.models import Component, Environment, Label, Project
from app.modules.releases.infrastructure.models import Release
from app.modules.testing.infrastructure.models import (
    TestCase,
    TestCaseCounter,
    TestRun,
    TestRunCounter,
    TestRunResult,
    TestSuite,
)

__all__ = ["AIUsage", "Attachment", "AuditEvent", "Bug", "BugActivity", "BugLabel", "Comment", "Component", "Environment", "Invitation",
           "Label", "Membership", "Organization", "PasswordReset", "Project", "RefreshToken", "Release", "SavedView", "TestCase",
           "TestCaseCounter", "TestRun", "TestRunCounter", "TestRunResult", "TestSuite", "User"]
