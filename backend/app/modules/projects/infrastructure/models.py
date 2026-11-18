import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin


class Project(IdMixin, TimestampMixin, Base):
    """DOMAIN_MODEL 1.2. Bug keys are `{key}-{number}` (D-008); `next_bug_number` is the per project counter."""

    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("org_id", "key", name="uq_projects_org_key"),
        Index("ix_projects_org_archived", "org_id", "archived_at"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    key: Mapped[str] = mapped_column(String(6))
    description: Mapped[str] = mapped_column(String(1000), default="")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_bug_number: Mapped[int] = mapped_column(Integer, default=1)


class Component(IdMixin, TimestampMixin, Base):
    __tablename__ = "components"
    __table_args__ = (
        # Case insensitive unique name per project. text() so the index uses the column, not the string "name"
        Index("uq_components_project_name_ci", "project_id", text("lower(name)"), unique=True),
        Index("ix_components_org_project", "org_id", "project_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(500), default="")


class Environment(IdMixin, TimestampMixin, Base):
    __tablename__ = "environments"
    __table_args__ = (
        # Case insensitive unique name per project. text() so the index uses the column, not the string "name"
        Index("uq_environments_project_name_ci", "project_id", text("lower(name)"), unique=True),
        Index("ix_environments_org_project", "org_id", "project_id"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(40))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
