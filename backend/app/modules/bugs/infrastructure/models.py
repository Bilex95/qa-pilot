import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin, utcnow
from app.modules.bugs.domain.rules import (
    DEFAULT_PRIORITY,
    DEFAULT_SEVERITY,
    DEFAULT_STATUS,
    PRIORITIES,
    SEVERITIES,
    STATUSES,
)


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Bug(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.3. `key` is `{project.key}-{number}` (D-008), stored because project keys never change; the number
    comes from the project counter and is never reused, soft deleted bugs included (D-016)."""

    __tablename__ = "bugs"
    __table_args__ = (
        UniqueConstraint("project_id", "number", name="uq_bugs_project_number"),
        UniqueConstraint("org_id", "key", name="uq_bugs_org_key"),
        CheckConstraint(_in("status", STATUSES), name="status"),
        CheckConstraint(_in("severity", SEVERITIES), name="severity"),
        CheckConstraint(_in("priority", PRIORITIES), name="priority"),
        # NFR-PERF-04
        Index("ix_bugs_org_project_status", "org_id", "project_id", "status"),
        Index("ix_bugs_org_assignee", "org_id", "assignee_id"),
        Index("ix_bugs_org_updated", "org_id", text("updated_at DESC")),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    key: Mapped[str] = mapped_column(String(12))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    steps_to_reproduce: Mapped[list[str]] = mapped_column(JSONB, default=list)
    expected_result: Mapped[str] = mapped_column(Text, default="")
    actual_result: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(10), default=DEFAULT_SEVERITY)
    priority: Mapped[str] = mapped_column(String(2), default=DEFAULT_PRIORITY)
    status: Mapped[str] = mapped_column(String(20), default=DEFAULT_STATUS)
    # A component or environment that is deleted leaves the bug with none
    component_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("components.id", ondelete="SET NULL"))
    environment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("environments.id", ondelete="SET NULL"))
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # A release that is deleted leaves the bug with none (D-015, I-08). The source result has no foreign key: it is only a link back
    release_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("releases.id", ondelete="SET NULL"))
    source_run_result_id: Mapped[uuid.UUID | None] = mapped_column()
    ai_assisted: Mapped[bool] = mapped_column(Boolean, default=False)
    status_changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BugLabel(Base):
    """Join table. Deleting a label deletes its rows here (foreign key ON DELETE CASCADE, I-02 and I-03)."""

    __tablename__ = "bug_labels"
    __table_args__ = (
        PrimaryKeyConstraint("bug_id", "label_id", name="pk_bug_labels"),
        Index("ix_bug_labels_label", "label_id"),
        Index("ix_bug_labels_org", "org_id"),
    )

    bug_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"))
    label_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("labels.id", ondelete="CASCADE"))
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))


ACTIVITY_KINDS = ("created", "field_changed", "status_changed", "assigned", "commented", "attachment_added",
                  "attachment_removed", "linked_release")


class Comment(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.3. Plain text, 1 to 5,000 characters (REQ-023). A deleted comment keeps its row (`deleted_at`)."""

    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_bug_created", "bug_id", text("created_at DESC")),)

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    bug_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"))
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Attachment(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.3, D-009. `storage_key` is a random name on the upload volume; the original `filename` is only a label.
    A deleted attachment loses its row and its file."""

    __tablename__ = "attachments"
    __table_args__ = (Index("ix_attachments_bug", "bug_id"),)

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    bug_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"))
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(64), unique=True)


class BugActivity(IdMixin, Base):
    """The timeline of a bug (REQ-025, D-059). Append only. Values are text: status, severity and priority keep their raw
    key; people, components, environments and labels keep the name they had at that moment, so the history survives a rename
    or a delete; long text fields keep no values (the row only says the field changed)."""

    __tablename__ = "bug_activity"
    __table_args__ = (
        CheckConstraint(_in("kind", ACTIVITY_KINDS), name="kind"),
        Index("ix_bug_activity_bug_created", "bug_id", text("created_at DESC")),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    bug_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"))
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(20))
    field: Mapped[str | None] = mapped_column(String(40))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class SavedView(IdMixin, TimestampMixin, Base):
    """A named filter set, private to its owner inside one org (D-017). `filters` carries a version number."""

    __tablename__ = "saved_views"
    __table_args__ = (
        Index("ix_saved_views_org_user", "org_id", "user_id"),
        Index("uq_saved_views_org_user_name_ci", "org_id", "user_id", text("lower(name)"), unique=True),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
