"""Seed CLI (REQ-060). Local and test only.

    python -m app.seed --scenario baseline            add or update the scenario (idempotent)
    python -m app.seed --scenario empty --reset --yes  remove every seeded record first, then seed
    python -m app.seed --manifest                     print docs/SEED_MANIFEST.md (no database needed)

Rules: refuses when APP_ENV=production; needs SEED_USER_PASSWORD (D-041); only ever deletes records whose
ids belong to the seed namespace, never real data.
"""

import argparse
import hashlib
import hmac
import sys
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.db import get_sessionmaker, utcnow
from app.core.security import hash_password, password_problem, token_hash, verify_password
from app.modules.auth.infrastructure.models import User
from app.modules.orgs.infrastructure.models import Invitation, Membership, Organization
from app.seed.domain import counts as domain_counts
from app.seed.domain import seed_domain
from app.seed.scenarios import (
    ALL_ORGS,
    SCENARIO_NOTES,
    SCENARIOS,
    USERS,
    SeedOrg,
    expected_counts,
    sid,
    users_for,
)


class SeedError(Exception):
    pass


def _guard(settings: Settings) -> str:
    if settings.app_env == "production":
        raise SeedError("Refusing to seed: APP_ENV=production. The seed is for local and test use only.")
    pw = settings.seed_user_password
    if not pw:
        raise SeedError("SEED_USER_PASSWORD is empty. Set it in .env (D-041).")
    if password_problem(pw):
        raise SeedError("SEED_USER_PASSWORD must have at least 10 characters with a letter and a number.")
    return pw


def _invite_token(password: str, key: str) -> str:
    """Deterministic, unguessable without the seed password, never written to the manifest."""
    return hmac.new(password.encode(), f"invite:{key}".encode(), hashlib.sha256).hexdigest()


def reset(db: Session) -> None:
    org_ids = [o.id for o in ALL_ORGS]
    user_ids = [u.id for u in USERS.values()]
    db.execute(delete(Organization).where(Organization.id.in_(org_ids)))  # cascades memberships, invitations, audit
    db.execute(delete(User).where(User.id.in_(user_ids)))  # cascades refresh tokens
    db.commit()


def seed(db: Session, scenario: str, password: str, *, domain: bool = True) -> None:
    """People, workspaces and (unless `domain` is false, which tests that only need people use) the scenario's projects and bugs."""
    orgs: list[SeedOrg] = SCENARIOS[scenario]
    pw_hash: str | None = None
    for su in users_for(orgs):
        user = db.get(User, su.id)
        clash = db.scalar(select(User).where(User.email == su.email, User.id != su.id))
        if clash:
            raise SeedError(f"{su.email} already belongs to a user the seed does not own. Not touching it.")
        if user is None:
            pw_hash = pw_hash or hash_password(password)
            db.add(User(id=su.id, email=su.email, full_name=su.full_name, password_hash=pw_hash, is_active=True))
        else:
            user.full_name, user.is_active = su.full_name, True
            if not verify_password(user.password_hash, password):
                pw_hash = pw_hash or hash_password(password)
                user.password_hash = pw_hash
    db.flush()
    for so in orgs:
        org = db.get(Organization, so.id)
        slug_clash = db.scalar(select(Organization).where(Organization.slug == so.slug, Organization.id != so.id))
        if slug_clash:
            raise SeedError(f"Slug {so.slug!r} belongs to an organization the seed does not own. Not touching it.")
        if org is None:
            org = Organization(id=so.id, slug=so.slug, name=so.name, created_by_id=USERS[so.members[0][0]].id)
            db.add(org)
        org.name, org.ai_enabled, org.ai_daily_limit = so.name, True, 500
        db.flush()
        for user_key, role in so.members:
            mid = sid("membership", f"{so.key}:{user_key}")
            m = db.get(Membership, mid)
            if m is None:
                db.add(Membership(id=mid, org_id=so.id, user_id=USERS[user_key].id, role=role, status="active"))
            else:
                m.role, m.status = role, "active"
        for inv in so.invitations:
            iid = sid("invitation", f"{so.key}:{inv.key}")
            row = db.get(Invitation, iid)
            if row is None:
                row = Invitation(id=iid, org_id=so.id, email=inv.email,
                                 token_hash=token_hash(_invite_token(password, f"{so.key}:{inv.key}")),
                                 invited_by_id=USERS[so.members[0][0]].id, role=inv.role,
                                 expires_at=utcnow() + timedelta(days=7))
                db.add(row)
            row.role, row.revoked_at, row.accepted_at, row.accepted_by_id = inv.role, None, None, None
            if row.expires_at <= utcnow() + timedelta(days=1):
                row.expires_at = utcnow() + timedelta(days=7)
    db.commit()
    for so in orgs if domain else []:  # projects, bugs, tests and releases go through the services (I-12, D-066)
        seed_domain(db, scenario, so)


def counts(db: Session, scenario: str) -> dict[str, int]:
    """Counts of the scenario's seeded rows actually present in the database."""
    orgs = SCENARIOS[scenario]
    org_ids = [o.id for o in orgs]
    user_ids = [u.id for u in users_for(orgs)]
    membership_ids = [sid("membership", f"{o.key}:{k}") for o in orgs for k, _ in o.members]
    invitation_ids = [sid("invitation", f"{o.key}:{i.key}") for o in orgs for i in o.invitations]

    def n(model: type, *where: object) -> int:
        return int(db.scalar(select(func.count()).select_from(model).where(*where)) or 0)  # type: ignore[arg-type]

    return {
        "organizations": n(Organization, Organization.id.in_(org_ids)),
        "users": n(User, User.id.in_(user_ids)),
        "memberships": n(Membership, Membership.id.in_(membership_ids), Membership.status == "active"),
        "invitations": n(Invitation, Invitation.id.in_(invitation_ids), Invitation.accepted_at.is_(None),
                         Invitation.revoked_at.is_(None)),
        **domain_counts(db, scenario, orgs).as_dict(),
    }


def manifest() -> str:
    lines = [
        "# Seed manifest",
        "",
        "Generated by `python -m app.seed --manifest`. Do not edit by hand.",
        "",
        "Local and test data only. Every seeded person signs in with the password in `SEED_USER_PASSWORD` from `.env`;",
        "it is never written here (D-041). The seed refuses to run when `APP_ENV=production`.",
        "",
        "```",
        "docker compose exec backend python -m app.seed --scenario baseline",
        "docker compose exec backend python -m app.seed --scenario multi-tenant --reset --yes",
        "```",
        "",
        "`--reset --yes` removes the seeded organizations and people, and with them everything inside those organizations",
        "(projects, bugs, tests, releases, including what you added there); other organizations and people are kept.",
        "Projects, bugs, suites, cases, runs and releases are written through the services (so every bug has its timeline and",
        "audit trail) and their dates are moved back from the moment of seeding by whole days, so the Past SLA, trend, pass rate",
        "and readiness figures are the same on any day. A project that already exists (same key) is left alone, so seeding twice",
        "changes nothing; switch scenarios with `--reset --yes`.",
        "",
        "## Expected counts per scenario",
        "",
        "| Scenario | Orgs | Users | Memberships | Pending invitations | Projects | Bugs | Suites | Cases | Runs | Releases "
        "| What it is for |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for name in SCENARIOS:
        c = expected_counts(name)
        lines.append(f"| `{name}` | {c['organizations']} | {c['users']} | {c['memberships']} | {c['invitations']} | {c['projects']} | "
                     f"{c['bugs']} | {c['suites']} | {c['cases']} | {c['runs']} | {c['releases']} | {SCENARIO_NOTES[name]} |")
    for name, orgs in SCENARIOS.items():
        if name in {"sla-breach", "release-blocked"}:
            continue
        lines += ["", f"## Logins: `{name}`", "", "| Organization | Name | Email | Role |", "|---|---|---|---|"]
        for so in orgs:
            for user_key, role in so.members:
                u = USERS[user_key]
                lines.append(f"| {so.name} (`{so.slug}`) | {u.full_name} | {u.email} | {role} |")
            for inv in so.invitations:
                lines.append(f"| {so.name} (`{so.slug}`) | pending invitation | {inv.email} | {inv.role} |")
    lines += ["", "`sla-breach` and `release-blocked` use the same people as `baseline`.", ""]
    return "\n".join(lines)



def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="python -m app.seed", description="Seed local or test data (never production).")
    p.add_argument("--scenario", choices=sorted(SCENARIOS))
    p.add_argument("--reset", action="store_true", help="remove every seeded record before seeding")
    p.add_argument("--yes", action="store_true", help="confirm --reset")
    p.add_argument("--manifest", action="store_true", help="print docs/SEED_MANIFEST.md and exit")
    args = p.parse_args(argv)
    if args.manifest:
        print(manifest())
        return 0
    if not args.scenario:
        p.error("--scenario is required")
    try:
        password = _guard(Settings())
        if args.reset and not args.yes:
            raise SeedError("--reset deletes every seeded record. Add --yes to confirm.")
        with get_sessionmaker()() as db:
            if args.reset:
                reset(db)
            seed(db, args.scenario, password)
            got, want = counts(db, args.scenario), expected_counts(args.scenario)
    except SeedError as exc:
        print(f"SEED REFUSED: {exc}", file=sys.stderr)
        return 2
    print(f"Seeded scenario {args.scenario!r}: " + ", ".join(f"{k} {v}" for k, v in got.items()))
    if got != want:
        print(f"MISMATCH: expected {want}", file=sys.stderr)
        return 1
    print("Counts match the manifest.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
