"""FastAPI application factory."""

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.core.health import router as health_router
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.modules.audit.api.routes import router as audit_router
from app.modules.auth.api.routes import router as auth_router
from app.modules.bugs.api.routes import router as bugs_router
from app.modules.orgs.api.routes import router as orgs_router
from app.modules.projects.api.routes import router as projects_router
from app.modules.testing.api.routes import router as testing_router

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="QA Pilot API",
        version=settings.version,
        description="AI powered bug tracking and QA management. All tenant routes live under /api/v1/orgs/{org_id}.",
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    install_error_handlers(app)
    # Order: CORS outermost so preflight and error responses carry CORS headers
    app.add_middleware(RequestContextMiddleware, production=settings.is_production)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID", "Retry-After"],
        max_age=600,
    )
    api = APIRouter(prefix=API_PREFIX)
    api.include_router(health_router)
    api.include_router(auth_router)
    api.include_router(orgs_router)
    api.include_router(projects_router)
    api.include_router(bugs_router)
    api.include_router(testing_router)
    api.include_router(audit_router)
    app.include_router(api)
    return app


app = create_app()
