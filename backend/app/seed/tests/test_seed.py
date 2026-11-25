"""Seed CLI rules (REQ-060, D-041): production refusal, password required, idempotent, safe reset."""

import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.modules.auth.infrastructure.models import User
from app.seed.__main__ import SeedError, _guard, counts, main, manifest, reset, seed
from app.seed.scenarios import SCENARIOS, expected_counts
from conftest import make_user

PW = "Seed-password-2026"


def test_refuses_in_production() -> None:
    with pytest.raises(SeedError, match="production"):
        _guard(Settings(app_env="production", seed_user_password=PW, jwt_secret="x" * 40))


def test_refuses_without_or_with_weak_password() -> None:
    with pytest.raises(SeedError, match="empty"):
        _guard(Settings(app_env="development", seed_user_password="", jwt_secret="x" * 40))
    with pytest.raises(SeedError, match="10 characters"):
        _guard(Settings(app_env="development", seed_user_password="short", jwt_secret="x" * 40))


def test_cli_refuses_production_with_exit_code(monkeypatch, capsys) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SEED_USER_PASSWORD", PW)
    assert main(["--scenario", "baseline"]) == 2
    assert "production" in capsys.readouterr().err


def test_reset_needs_yes(monkeypatch, capsys) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("SEED_USER_PASSWORD", PW)
    assert main(["--scenario", "baseline", "--reset"]) == 2
    assert "--yes" in capsys.readouterr().err


@pytest.mark.parametrize("scenario", sorted(SCENARIOS))
def test_every_scenario_is_idempotent_and_matches_the_manifest(db, scenario) -> None:
    seed(db, scenario, PW)
    first = counts(db, scenario)
    total_users = db.scalar(select(func.count()).select_from(User))
    seed(db, scenario, PW)
    assert counts(db, scenario) == first == expected_counts(scenario)
    assert db.scalar(select(func.count()).select_from(User)) == total_users


def test_seeded_people_can_sign_in(client, db) -> None:
    seed(db, "baseline", PW, domain=False)
    r = client.post("/api/v1/auth/login", json={"email": "priya@lumenfreight.test", "password": PW})
    assert r.status_code == 200
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert sorted((m["org"]["slug"], m["role"]) for m in me["memberships"]) == [("harbor", "viewer"),
                                                                              ("lumen", "qa_engineer")]


def test_reset_only_removes_seeded_records(db) -> None:
    mine = make_user(db, "real.person@example.test")
    seed(db, "baseline", PW, domain=False)
    reset(db)
    assert counts(db, "baseline") == dict.fromkeys(expected_counts("baseline"), 0)
    assert db.get(User, mine.id) is not None


def test_never_overwrites_a_real_user_with_the_same_email(db) -> None:
    make_user(db, "amara@lumenfreight.test")
    with pytest.raises(SeedError, match="does not own"):
        seed(db, "baseline", PW)


def test_manifest_never_contains_the_password() -> None:
    text = manifest()
    assert "SEED_USER_PASSWORD" in text and PW not in text
    assert "| `baseline` | 2 | 15 | 16 | 2 | 4 | 68 | 5 | 44 | 6 | 4 |" in text
