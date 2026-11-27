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


def test_docs_and_schema_are_off_in_production_and_on_in_development(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://app:not-the-default@db:5432/app")
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    prod = TestClient(create_app())
    assert prod.get("/api/v1/docs").status_code == 404
    assert prod.get("/api/v1/openapi.json").status_code == 404

    monkeypatch.setenv("APP_ENV", "development")
    get_settings.cache_clear()
    dev = TestClient(create_app())
    assert dev.get("/api/v1/docs").status_code == 200
    assert dev.get("/api/v1/openapi.json").status_code == 200


def test_production_accepts_its_own_database_url(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://app:not-the-default@db:5432/app")
    assert get_settings().database_url.startswith("postgresql+psycopg://app:")
