"""Application settings read from the environment (.env in development)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_DATABASE_URL = "postgresql+psycopg://qapilot:qapilot@localhost:5433/qapilot"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    version: str = "0.3.0"

    # Local development default only (the throwaway compose database). get_settings() refuses it in production.
    database_url: str = DEV_DATABASE_URL
    test_database_url: str = ""

    jwt_secret: str = Field(default="", repr=False)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    invitation_days: int = 7

    frontend_origin: str = "http://localhost:3000"

    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 10

    ai_provider: Literal["mock", "anthropic", "gemini", "openai_compatible"] = "mock"
    ai_fallback_provider: Literal["", "anthropic", "gemini", "openai_compatible"] = ""  # empty means no fallback (D-085)
    anthropic_api_key: str = Field(default="", repr=False)
    anthropic_model: str = "claude-sonnet-5-5"
    gemini_api_key: str = Field(default="", repr=False)
    gemini_model: str = ""  # empty means the provider default (gemini-2.5-flash)
    gemini_base_url: str = ""
    openai_compat_api_key: str = Field(default="", repr=False)
    openai_compat_base_url: str = ""
    openai_compat_model: str = ""
    ai_user_rate_per_minute: int = 20
    ai_org_daily_limit_default: int = 500

    seed_user_password: str = Field(default="", repr=False)

    # Login throttle (D-020)
    login_max_failures: int = 10
    login_window_minutes: int = 15

    # Password reset links issued by an Org Admin (D-045, D-055)
    password_reset_minutes: int = 60
    reset_max_failures: int = 10  # failed preview or confirm attempts per client address ...
    reset_window_minutes: int = 15  # ... in this window

    @field_validator("jwt_secret")
    @classmethod
    def _secret_long_enough(cls, v: str) -> str:
        if v and len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.jwt_secret:
        raise RuntimeError("JWT_SECRET is not set. Copy .env.example to .env and fill it in.")
    if settings.is_production and settings.database_url == DEV_DATABASE_URL:
        raise RuntimeError("DATABASE_URL is the development default. Set your own database credentials in production.")
    return settings
