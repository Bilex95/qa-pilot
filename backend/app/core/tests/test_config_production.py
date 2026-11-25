"""Production refuses the development database default (public repo hardening)."""

import pytest

from app.core.config import DEV_DATABASE_URL, get_settings


@pytest.fixture(autouse=True)
def _fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_production_refuses_the_development_database_url(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", DEV_DATABASE_URL)
    with pytest.raises(RuntimeError, match="development default"):
        get_settings()


def test_production_accepts_its_own_database_url(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://app:not-the-default@db:5432/app")
    assert get_settings().database_url.startswith("postgresql+psycopg://app:")
