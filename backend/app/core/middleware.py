"""Request id, access log and security headers (NFR-SEC-04)."""

import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.request_context import client_ip_var, org_id_var, request_id_var, user_id_var

log = logging.getLogger("app.access")
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, production: bool) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.production = production

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        incoming = request.headers.get("x-request-id", "")
        rid = incoming if _SAFE_ID.match(incoming) else uuid.uuid4().hex
        request_id_var.set(rid)
        user_id_var.set("-")
        org_id_var.set("-")
        client_ip_var.set(request.client.host if request.client else "-")
        start = time.perf_counter()
        response = await call_next(request)
        latency = round((time.perf_counter() - start) * 1000, 1)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers.setdefault("Cache-Control", "no-store")
        if self.production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path != "/api/v1/health":
            log.info("request", extra={"method": request.method, "path": request.url.path,
                                       "status": response.status_code, "latency_ms": latency})
        return response
