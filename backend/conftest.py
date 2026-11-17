"""Test harness (D-040): real PostgreSQL test database, schema from Alembic, one rolled back transaction per test."""

import os
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, field

import pytest

# Point the app at the test database before anything imports settings
if os.environ.get("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ["APP_ENV"] = "test"
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-0123456789")

from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from alembic import command
from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import Role
from app.core.security import create_access_token, hash_password
from app.main import app
from app.modules.auth.infrastructure.models import User
from app.modules.orgs.infrastructure.models import Membership, Organization

PASSWORD = "Correct-horse-42"
_HASH = hash_password(PASSWORD)  # computed once; argon2 is slow on purpose


@pytest.fixture(scope="session")
def engine():  # type: ignore[no-untyped-def]
    url = get_settings().database_url
    assert "test" in url, f"Refusing to run tests against a non test database: {url}"
    eng = create_engine(url, future=True)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
    cfg.attributes["url"] = url
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine) -> Iterator[Session]:  # type: ignore[no-untyped-def]
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture()
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# Factories ------------------------------------------------------------------

def make_user(db: Session, email: str | None = None, name: str = "Test User") -> User:
    user = User(email=email or f"user-{uuid.uuid4().hex[:10]}@example.test", full_name=name, password_hash=_HASH)
    db.add(user)
    db.flush()
    return user


def make_org(db: Session, owner: User | None = None, slug: str | None = None, name: str = "Test Org") -> Organization:
    org = Organization(name=name, slug=slug or f"org-{uuid.uuid4().hex[:10]}", ai_daily_limit=500)
    db.add(org)
    db.flush()
    if owner:
        add_member(db, org, owner, Role.ORG_ADMIN)
    return org


def add_member(db: Session, org: Organization, user: User, role: Role) -> Membership:
    m = Membership(org_id=org.id, user_id=user.id, role=role, status="active")
    db.add(m)
    db.flush()
    return m


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)[0]}"}


@dataclass
class Tenant:
    org: Organization
    users: dict[Role, User] = field(default_factory=dict)
    memberships: dict[Role, Membership] = field(default_factory=dict)

    def h(self, role: Role | str) -> dict[str, str]:
        return auth(self.users[Role(role)])


@dataclass
class World:
    a: Tenant
    b: Tenant


def _tenant(db: Session, label: str) -> Tenant:
    org = make_org(db, slug=f"{label}-{uuid.uuid4().hex[:6]}", name=f"Org {label.upper()}")
    t = Tenant(org=org)
    for role in Role:
        u = make_user(db, f"{role.value}.{label}.{uuid.uuid4().hex[:6]}@example.test", f"{role.value} {label}")
        t.users[role] = u
        t.memberships[role] = add_member(db, org, u, role)
    return t


@pytest.fixture()
def world(db: Session) -> World:
    """Two orgs, each with one user per role, nobody shared (for role and cross tenant tests)."""
    return World(a=_tenant(db, "a"), b=_tenant(db, "b"))
