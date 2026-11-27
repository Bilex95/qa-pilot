"""The access log never carries a token (BL-014, D-055)."""

import logging

import pytest

from app.core.logging import JsonFormatter
from app.core.middleware import redact_path


@pytest.mark.parametrize(("path", "logged"), [
    ("/api/v1/invitations/SECRET-token_value-123456", "/api/v1/invitations/{token}"),
    ("/api/v1/invitations/SECRET-token_value-123456/accept", "/api/v1/invitations/{token}/accept"),
    ("/api/v1/invitations/preview", "/api/v1/invitations/preview"),
    ("/api/v1/invitations/accept", "/api/v1/invitations/accept"),
    ("/api/v1/auth/password-reset/preview", "/api/v1/auth/password-reset/preview"),
    ("/api/v1/orgs/123/invitations/456", "/api/v1/orgs/123/invitations/456"),  # an invitation id is not a secret
    ("/api/v1/health", "/api/v1/health"),
])
def test_redact_path(path: str, logged: str) -> None:
    assert redact_path(path) == logged


def test_a_request_with_a_token_in_its_path_is_logged_without_it(client) -> None:
    lines: list[str] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(JsonFormatter().format(record))

    logger = logging.getLogger("app.access")
    handler, old = Capture(), logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        client.get("/api/v1/invitations/SECRET-token_value-123456")
        client.post("/api/v1/invitations/preview", json={"token": "SECRET-token_value-654321"})
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old)
    joined = "\n".join(lines)
    assert "/api/v1/invitations/{token}" in joined and "/api/v1/invitations/preview" in joined
    assert "SECRET-token_value" not in joined  # neither the path token nor the body token is in the log
