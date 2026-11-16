"""Org persistence. Every query on tenant data takes org_id (NFR-TEN-02)."""

import uuid
from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.readviews import users_view as u
from app.modules.orgs.infrastructure.models import Invitation, Membership, Organization


def get_org(db: Session, org_id: uuid.UUID) -> Organization | None:
    return db.get(Organization, org_id)


def get_org_by_slug(db: Session, slug: str) -> Organization | None:
    return db.scalar(select(Organization).where(Organization.slug == slug))


def get_active_membership(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> Membership | None:
    return db.scalar(select(Membership).where(Membership.org_id == org_id, Membership.user_id == user_id,
                                              Membership.status == "active"))


def get_membership_any_status(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> Membership | None:
    return db.scalar(select(Membership).where(Membership.org_id == org_id, Membership.user_id == user_id))


def get_membership_by_id(db: Session, org_id: uuid.UUID, membership_id: uuid.UUID, *, lock: bool = False) -> Membership | None:
    stmt = select(Membership).where(Membership.org_id == org_id, Membership.id == membership_id,
                                    Membership.status == "active")
    return db.scalar(stmt.with_for_update() if lock else stmt)


def memberships_for_user(db: Session, user_id: uuid.UUID) -> list[tuple[Organization, Membership]]:
    stmt = (select(Organization, Membership).join(Membership, Membership.org_id == Organization.id)
            .where(Membership.user_id == user_id, Membership.status == "active").order_by(Organization.name))
    return [(o, m) for o, m in db.execute(stmt).all()]


def count_active_admins(db: Session, org_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.count()).select_from(Membership).where(
        Membership.org_id == org_id, Membership.status == "active", Membership.role == "org_admin")) or 0)


def members_query(org_id: uuid.UUID, *, q: str | None, role: str | None) -> Select[Any]:
    """Memberships with user name and email, for search and sort by name."""
    stmt = (select(Membership, u.c.full_name, u.c.email).join(u, u.c.id == Membership.user_id)
            .where(Membership.org_id == org_id, Membership.status == "active"))
    if role:
        stmt = stmt.where(Membership.role == role)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(u.c.full_name).like(like) | func.lower(u.c.email).like(like))
    return stmt.order_by(u.c.full_name, Membership.id)


def get_invitation(db: Session, org_id: uuid.UUID, invitation_id: uuid.UUID) -> Invitation | None:
    return db.scalar(select(Invitation).where(Invitation.org_id == org_id, Invitation.id == invitation_id))


def get_invitation_by_hash(db: Session, token_hash: str, *, lock: bool = False) -> Invitation | None:
    stmt = select(Invitation).where(Invitation.token_hash == token_hash)
    return db.scalar(stmt.with_for_update() if lock else stmt)


def pending_invitations(db: Session, org_id: uuid.UUID, email: str | None = None) -> list[Invitation]:
    stmt = select(Invitation).where(Invitation.org_id == org_id, Invitation.accepted_at.is_(None),
                                    Invitation.revoked_at.is_(None))
    if email:
        stmt = stmt.where(Invitation.email == email)
    return list(db.scalars(stmt))


def list_invitations(db: Session, org_id: uuid.UUID) -> list[Invitation]:
    return list(db.scalars(select(Invitation).where(Invitation.org_id == org_id)
                           .order_by(Invitation.created_at.desc())))


def pending_invitations_for_email(db: Session, email: str) -> list[tuple[Invitation, Organization]]:
    stmt = (select(Invitation, Organization).join(Organization, Organization.id == Invitation.org_id)
            .where(Invitation.email == email, Invitation.accepted_at.is_(None), Invitation.revoked_at.is_(None)))
    return [(i, o) for i, o in db.execute(stmt).all()]
