"""Org, membership and invitation use cases (REQ-004 to REQ-006, REQ-009, REQ-053).

Public contract for other modules: get_active_membership, memberships_for_user,
pending_invitations_for_email, member_user_ids.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import Conflict, Forbidden, Gone, NotFound, Unprocessable
from app.core.pagination import PageParams, paginate_rows
from app.core.permissions import Role
from app.core.security import new_opaque_token, token_hash
from app.modules.audit.application import service as audit
from app.modules.auth.application import service as auth
from app.modules.orgs.domain.rules import mask_email, slug_problem
from app.modules.orgs.infrastructure import repository as repo
from app.modules.orgs.infrastructure.models import Invitation, Membership, Organization


@dataclass(frozen=True)
class MemberRow:
    membership: Membership
    full_name: str
    email: str


# Public contract ----------------------------------------------------------

def get_active_membership(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> Membership | None:
    return repo.get_active_membership(db, org_id, user_id)


def get_org(db: Session, org_id: uuid.UUID) -> Organization | None:
    return repo.get_org(db, org_id)


def memberships_for_user(db: Session, user_id: uuid.UUID) -> list[tuple[Organization, Membership]]:
    return repo.memberships_for_user(db, user_id)


def pending_invitations_for_email(db: Session, email: str) -> list[tuple[Invitation, Organization]]:
    now = utcnow()
    return [(i, o) for i, o in repo.pending_invitations_for_email(db, email) if i.expires_at > now]


# Orgs ---------------------------------------------------------------------

def create_org(db: Session, *, user_id: uuid.UUID, name: str, slug: str) -> tuple[Organization, Membership]:
    slug = slug.strip().lower()
    problem = slug_problem(slug)
    if problem:
        raise Unprocessable("Workspace address is not valid.", details=[{"loc": ["body", "slug"], "msg": problem}])
    if repo.get_org_by_slug(db, slug):
        raise Conflict("This address is taken.", code="slug_taken")
    org = Organization(name=name.strip(), slug=slug, created_by_id=user_id,
                       ai_daily_limit=get_settings().ai_org_daily_limit_default)
    db.add(org)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict("This address is taken.", code="slug_taken") from exc
    membership = Membership(org_id=org.id, user_id=user_id, role=Role.ORG_ADMIN, status="active")
    db.add(membership)
    audit.record(db, "org.created", actor_id=user_id, org_id=org.id, entity_type="org", entity_id=org.id,
                 data={"slug": slug})
    db.commit()
    return org, membership


def update_org(db: Session, org: Organization, *, actor_id: uuid.UUID, changes: dict[str, Any]) -> Organization:
    before = {k: getattr(org, k) for k in changes}
    for key, value in changes.items():
        setattr(org, key, value.strip() if isinstance(value, str) else value)
    diff = {k: {"from": before[k], "to": getattr(org, k)} for k in changes if before[k] != getattr(org, k)}
    if diff:
        audit.record(db, "org.settings_updated", actor_id=actor_id, org_id=org.id, entity_type="org",
                     entity_id=org.id, data=diff)
        if "ai_enabled" in diff:
            audit.record(db, "ai.enabled" if org.ai_enabled else "ai.disabled", actor_id=actor_id, org_id=org.id,
                         entity_type="org", entity_id=org.id)
        if "ai_daily_limit" in diff:
            audit.record(db, "ai.limit_changed", actor_id=actor_id, org_id=org.id, entity_type="org",
                         entity_id=org.id, data=diff["ai_daily_limit"])
    db.commit()
    return org


# Members ------------------------------------------------------------------

def list_members(db: Session, org_id: uuid.UUID, params: PageParams, *, q: str | None,
                 role: str | None) -> tuple[list[MemberRow], int]:
    rows, total = paginate_rows(db, repo.members_query(org_id, q=q, role=role), params)
    return [MemberRow(m, name, email) for m, name, email in rows], total


def _member_or_404(db: Session, org_id: uuid.UUID, membership_id: uuid.UUID) -> Membership:
    m = repo.get_membership_by_id(db, org_id, membership_id, lock=True)
    if m is None:
        raise NotFound("Member not found.")
    return m


def change_role(db: Session, org_id: uuid.UUID, membership_id: uuid.UUID, *, role: Role,
                actor_id: uuid.UUID) -> Membership:
    m = _member_or_404(db, org_id, membership_id)
    if m.role == Role.ORG_ADMIN and role != Role.ORG_ADMIN and repo.count_active_admins(db, org_id) <= 1:
        raise Conflict("The last Org Admin cannot be demoted. Make someone else an Org Admin first.",
                       code="last_admin")
    old = m.role
    m.role = role
    if old != role:
        audit.record(db, "member.role_changed", actor_id=actor_id, org_id=org_id, entity_type="membership",
                     entity_id=m.id, data={"user_id": str(m.user_id), "from": old, "to": role})
    db.commit()
    return m


def create_password_reset_link(db: Session, org: Organization, membership_id: uuid.UUID, *,
                               actor_id: uuid.UUID) -> tuple[str, datetime]:
    """An Org Admin issues a single use, one hour reset link for a member (D-045). Two refusals protect accounts (D-055):
    your own (change it in your profile) and a person who belongs to more than one workspace, because the password is
    global and an admin of one workspace must not be able to take over access to the others."""
    m = _member_or_404(db, org.id, membership_id)
    if m.user_id == actor_id:
        raise Conflict("You cannot create a reset link for your own account. Change your password in your profile.",
                       code="own_account")
    if len(repo.memberships_for_user(db, m.user_id)) > 1:
        raise Conflict("This person belongs to more than one workspace, so a workspace admin cannot reset their password.",
                       code="shared_account")
    raw, expires = auth.issue_password_reset(db, user_id=m.user_id, org_id=org.id, actor_id=actor_id)
    return f"{get_settings().frontend_origin}/reset-password#{raw}", expires


def remove_member(db: Session, org_id: uuid.UUID, membership_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    m = _member_or_404(db, org_id, membership_id)
    if m.role == Role.ORG_ADMIN and repo.count_active_admins(db, org_id) <= 1:
        raise Conflict("The last Org Admin cannot be removed.", code="last_admin")
    m.status = "removed"
    db.flush()
    auth.end_access_after_removal(db, user_id=m.user_id, in_other_workspace=bool(repo.memberships_for_user(db, m.user_id)))
    audit.record(db, "member.removed", actor_id=actor_id, org_id=org_id, entity_type="membership",
                 entity_id=m.id, data={"user_id": str(m.user_id)})
    db.commit()


# Invitations --------------------------------------------------------------

def invitation_status(inv: Invitation) -> str:
    if inv.accepted_at:
        return "accepted"
    if inv.revoked_at:
        return "revoked"
    if inv.expires_at <= utcnow():
        return "expired"
    return "pending"


def create_invitation(db: Session, org: Organization, *, email: str, role: Role,
                      actor_id: uuid.UUID) -> tuple[Invitation, str]:
    email = auth.normalise_email(email)
    existing_user = auth.get_user_by_email(db, email)
    if existing_user and repo.get_active_membership(db, org.id, existing_user.id):
        raise Conflict("This person is already a member.", code="already_member")
    now = utcnow()
    for old in repo.pending_invitations(db, org.id, email):  # one live invitation per email
        old.revoked_at = now
    raw = new_opaque_token()
    inv = Invitation(org_id=org.id, email=email, role=role, token_hash=token_hash(raw), invited_by_id=actor_id,
                     expires_at=now + timedelta(days=get_settings().invitation_days))
    db.add(inv)
    db.flush()
    audit.record(db, "invitation.created", actor_id=actor_id, org_id=org.id, entity_type="invitation",
                 entity_id=inv.id, data={"email": email, "role": role})
    db.commit()
    # The token is in the fragment: browsers never send it to a server and it is not in the Referer header (BL-014, D-055)
    return inv, f"{get_settings().frontend_origin}/invite#{raw}"


def list_invitations(db: Session, org_id: uuid.UUID, *, status: str | None) -> list[Invitation]:
    items = repo.list_invitations(db, org_id)
    return [i for i in items if status is None or invitation_status(i) == status]


def revoke_invitation(db: Session, org_id: uuid.UUID, invitation_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    inv = repo.get_invitation(db, org_id, invitation_id)
    if inv is None:
        raise NotFound("Invitation not found.")
    if invitation_status(inv) == "pending":
        inv.revoked_at = utcnow()
        audit.record(db, "invitation.revoked", actor_id=actor_id, org_id=org_id, entity_type="invitation",
                     entity_id=inv.id)
        db.commit()


_GONE = "This invite link no longer works. Ask your workspace admin for a new link."


def preview_invitation(db: Session, token: str) -> tuple[Invitation, Organization, str]:
    inv = repo.get_invitation_by_hash(db, token_hash(token))
    if inv is None or invitation_status(inv) != "pending":
        raise Gone(_GONE, code="invitation_invalid")
    org = repo.get_org(db, inv.org_id)
    if org is None:  # foreign key makes this impossible; fail closed
        raise Gone(_GONE, code="invitation_invalid")
    return inv, org, mask_email(inv.email)


def accept_invitation(db: Session, token: str, *, user_id: uuid.UUID, user_email: str) -> tuple[Organization, Membership]:
    inv = repo.get_invitation_by_hash(db, token_hash(token), lock=True)
    if inv is None or invitation_status(inv) != "pending":
        raise Gone(_GONE, code="invitation_invalid")
    if auth.normalise_email(user_email) != inv.email:
        raise Forbidden("This invitation was sent to a different email address.", code="email_mismatch")
    org = repo.get_org(db, inv.org_id)
    if org is None:
        raise Gone(_GONE, code="invitation_invalid")
    m = repo.get_membership_any_status(db, org.id, user_id)
    if m and m.status == "active":
        raise Conflict("You are already a member of this workspace.", code="already_member")
    if m:
        m.status, m.role = "active", inv.role
    else:
        m = Membership(org_id=org.id, user_id=user_id, role=inv.role, status="active")
        db.add(m)
    inv.accepted_at, inv.accepted_by_id = utcnow(), user_id
    db.flush()
    audit.record(db, "invitation.accepted", actor_id=user_id, org_id=org.id, entity_type="invitation",
                 entity_id=inv.id, data={"role": inv.role})
    db.commit()
    return org, m
