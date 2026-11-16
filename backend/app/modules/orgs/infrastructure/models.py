import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

ROLE_CHECK = "role in ('org_admin','qa_lead','qa_engineer','developer','viewer')"


class Organization(IdMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    ai_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    ai_daily_limit: Mapped[int] = mapped_column(Integer, default=500)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Membership(IdMixin, TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_memberships_org_user"),
        Index("ix_memberships_user_status", "user_id", "status"),
        CheckConstraint(ROLE_CHECK, name="role_valid"),
        CheckConstraint("status in ('active','removed')", name="status_valid"),
    )

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10), default="active")  # active | removed


class Invitation(IdMixin, TimestampMixin, Base):
    __tablename__ = "invitations"
    __table_args__ = (Index("ix_invitations_org_email", "org_id", "email"), CheckConstraint(ROLE_CHECK, name="role_valid"))

    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(254))
    role: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
