"""API-001 health check: process up and database reachable."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.errors import envelope

router = APIRouter(tags=["health"])


@router.get("/health", summary="Health check", responses={503: {"description": "Database unavailable"}})
def health() -> JSONResponse:
    try:
        with get_sessionmaker()() as s:
            s.execute(text("select 1"))
    except Exception:
        return JSONResponse(envelope("db_unavailable", "Database is not reachable."), status_code=503)
    return JSONResponse({"status": "ok", "db": "ok", "version": get_settings().version})
