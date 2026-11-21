"""Cross cutting API contract tests: auth on every route, tenant isolation on every org route,
error envelope, request id, security headers (REQ-007, REQ-008, REQ-054, NFR-SEC-01, NFR-SEC-04)."""

import re
import uuid

import pytest

from app.core.permissions import PERMISSIONS, Role, can
from app.main import app

PUBLIC = {("GET", "/api/v1/health"), ("POST", "/api/v1/auth/register"), ("POST", "/api/v1/auth/login"),
          ("POST", "/api/v1/auth/refresh"), ("POST", "/api/v1/invitations/preview"),
          ("POST", "/api/v1/auth/password-reset/preview"), ("POST", "/api/v1/auth/password-reset/confirm")}


def _routes() -> list[tuple[str, str]]:
    spec = app.openapi()
    return [(m.upper(), p) for p, ops in spec["paths"].items() for m in ops]


def _fill(path: str, org_id: uuid.UUID | None = None) -> str:
    def sub(m: re.Match[str]) -> str:
        name = m.group(1)
        if name == "org_id" and org_id:
            return str(org_id)
        return "x" * 20 if name == "token" else str(uuid.uuid4())
    return re.sub(r"\{(\w+)\}", sub, path)


def _body(method: str) -> dict[str, object] | None:
    return {} if method in {"POST", "PATCH", "PUT"} else None


def test_openapi_lists_every_inventory_endpoint_built_so_far() -> None:
    routes = set(_routes())
    expected = {
        ("GET", "/api/v1/health"),
        ("POST", "/api/v1/auth/register"), ("POST", "/api/v1/auth/login"), ("POST", "/api/v1/auth/refresh"),
        ("POST", "/api/v1/auth/logout"), ("GET", "/api/v1/auth/me"), ("PATCH", "/api/v1/auth/me"),
        ("POST", "/api/v1/auth/me/password"),
        ("POST", "/api/v1/orgs"), ("GET", "/api/v1/orgs"), ("GET", "/api/v1/orgs/{org_id}"),
        ("PATCH", "/api/v1/orgs/{org_id}"), ("GET", "/api/v1/orgs/{org_id}/members"),
        ("PATCH", "/api/v1/orgs/{org_id}/members/{membership_id}"),
        ("DELETE", "/api/v1/orgs/{org_id}/members/{membership_id}"),
        ("POST", "/api/v1/orgs/{org_id}/invitations"), ("GET", "/api/v1/orgs/{org_id}/invitations"),
        ("DELETE", "/api/v1/orgs/{org_id}/invitations/{invitation_id}"),
        ("POST", "/api/v1/invitations/preview"), ("POST", "/api/v1/invitations/accept"),
        ("POST", "/api/v1/orgs/{org_id}/members/{membership_id}/password-reset"),
        ("POST", "/api/v1/auth/password-reset/preview"), ("POST", "/api/v1/auth/password-reset/confirm"),
        ("GET", "/api/v1/orgs/{org_id}/audit-events"),
        ("GET", "/api/v1/orgs/{org_id}/bugs"), ("POST", "/api/v1/orgs/{org_id}/bugs"),
        ("GET", "/api/v1/orgs/{org_id}/bugs/{bug_ref}"), ("PATCH", "/api/v1/orgs/{org_id}/bugs/{bug_id}"),
        ("DELETE", "/api/v1/orgs/{org_id}/bugs/{bug_id}"),
        ("GET", "/api/v1/orgs/{org_id}/saved-views"), ("POST", "/api/v1/orgs/{org_id}/saved-views"),
        ("DELETE", "/api/v1/orgs/{org_id}/saved-views/{view_id}"),
        ("GET", "/api/v1/orgs/{org_id}/test-suites"), ("POST", "/api/v1/orgs/{org_id}/test-suites"),
        ("GET", "/api/v1/orgs/{org_id}/test-suites/{suite_id}"), ("PATCH", "/api/v1/orgs/{org_id}/test-suites/{suite_id}"),
        ("DELETE", "/api/v1/orgs/{org_id}/test-suites/{suite_id}"),
        ("GET", "/api/v1/orgs/{org_id}/test-suites/{suite_id}/cases"), ("POST", "/api/v1/orgs/{org_id}/test-suites/{suite_id}/cases"),
        ("POST", "/api/v1/orgs/{org_id}/test-suites/{suite_id}/cases/bulk"),
        ("GET", "/api/v1/orgs/{org_id}/test-cases/{case_ref}"), ("PATCH", "/api/v1/orgs/{org_id}/test-cases/{case_id}"),
        ("DELETE", "/api/v1/orgs/{org_id}/test-cases/{case_id}"),
        ("GET", "/api/v1/orgs/{org_id}/bugs/{bug_id}/comments"), ("POST", "/api/v1/orgs/{org_id}/bugs/{bug_id}/comments"),
        ("PATCH", "/api/v1/orgs/{org_id}/comments/{comment_id}"), ("DELETE", "/api/v1/orgs/{org_id}/comments/{comment_id}"),
        ("GET", "/api/v1/orgs/{org_id}/bugs/{bug_id}/attachments"), ("POST", "/api/v1/orgs/{org_id}/bugs/{bug_id}/attachments"),
        ("GET", "/api/v1/orgs/{org_id}/attachments/{attachment_id}/download"),
        ("DELETE", "/api/v1/orgs/{org_id}/attachments/{attachment_id}"),
        ("GET", "/api/v1/orgs/{org_id}/bugs/{bug_id}/activity"),
        ("GET", "/api/v1/orgs/{org_id}/test-runs"), ("POST", "/api/v1/orgs/{org_id}/test-runs"),
        ("GET", "/api/v1/orgs/{org_id}/test-runs/{run_ref}"), ("PATCH", "/api/v1/orgs/{org_id}/test-runs/{run_id}"),
        ("PATCH", "/api/v1/orgs/{org_id}/test-runs/{run_id}/results/{result_id}"),
        ("GET", "/api/v1/orgs/{org_id}/test-runs/{run_id}/results/{result_id}/bug-draft"),
        ("GET", "/api/v1/orgs/{org_id}/releases"), ("POST", "/api/v1/orgs/{org_id}/releases"),
        ("GET", "/api/v1/orgs/{org_id}/releases/{release_id}"), ("PATCH", "/api/v1/orgs/{org_id}/releases/{release_id}"),
        ("DELETE", "/api/v1/orgs/{org_id}/releases/{release_id}"), ("GET", "/api/v1/orgs/{org_id}/releases/{release_id}/readiness"),
        ("POST", "/api/v1/orgs/{org_id}/releases/{release_id}/bugs"),
        ("DELETE", "/api/v1/orgs/{org_id}/releases/{release_id}/bugs/{bug_id}"),
        ("POST", "/api/v1/orgs/{org_id}/releases/{release_id}/runs"),
        ("DELETE", "/api/v1/orgs/{org_id}/releases/{release_id}/runs/{run_id}"),
    }
    assert expected <= routes, sorted(expected - routes)


@pytest.mark.parametrize(("method", "path"), [r for r in _routes() if r not in PUBLIC])
def test_every_protected_route_requires_a_token(client, method: str, path: str) -> None:
    r = client.request(method, _fill(path), json=_body(method))
    assert r.status_code == 401, (method, path, r.status_code, r.text)
    assert r.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize(("method", "path"), [r for r in _routes() if "{org_id}" in r[1]])
def test_every_org_route_hides_other_tenants(client, world, method: str, path: str) -> None:
    """An Org Admin of org A gets 404 org_not_found for anything under org B (D-003)."""
    r = client.request(method, _fill(path, world.b.org.id), json=_body(method), headers=world.a.h("org_admin"))
    assert r.status_code == 404, (method, path, r.status_code, r.text)
    assert r.json()["error"]["code"] == "org_not_found"


def test_unknown_org_and_foreign_org_look_the_same(client, world) -> None:
    h = world.a.h("org_admin")
    foreign = client.get(f"/api/v1/orgs/{world.b.org.id}", headers=h).json()
    unknown = client.get(f"/api/v1/orgs/{uuid.uuid4()}", headers=h).json()
    assert foreign == unknown


def test_error_envelope_and_request_id(client) -> None:
    r = client.post("/api/v1/auth/login", json={"email": "nope"}, headers={"X-Request-ID": "test-req-1"})
    assert r.status_code == 422
    body = r.json()
    assert set(body) == {"error"} and set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == "validation_error"
    assert any(d["loc"][-1] == "password" for d in body["error"]["details"])
    assert r.headers["X-Request-ID"] == "test-req-1"


def test_unknown_route_uses_envelope(client) -> None:
    r = client.get("/api/v1/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_security_headers(client) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200 and r.json()["db"] == "ok"
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


def test_cors_allows_only_the_frontend_origin(client) -> None:
    ok = client.options("/api/v1/auth/login", headers={"Origin": "http://localhost:3000",
                                                        "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options("/api/v1/auth/login", headers={"Origin": "https://evil.example",
                                                         "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


# Permission matrix copied from PERSONAS_AND_ROLES.md section 3 (Y = allowed at all; record rules are separate)
A, L, Q, D, V = "org_admin", "qa_lead", "qa_engineer", "developer", "viewer"
MATRIX = {
    "org.update_settings": {A}, "member.list": {A, L}, "member.list_basic": {A, L, Q, D, V},
    "member.update_role": {A}, "member.remove": {A}, "invitation.create": {A}, "invitation.list": {A, L},
    "audit.read": {A}, "member.reset_password": {A}, "label.manage": {A, L}, "project.create": {A, L}, "bug.create": {A, L, Q, D},
    "bug.set_severity_priority": {A, L, Q}, "bug.delete": {A, L}, "comment.create": {A, L, Q, D, V},
    "attachment.upload": {A, L, Q, D}, "suite.manage": {A, L, Q}, "run.execute": {A, L, Q},
    "release.manage": {A, L}, "report.export": {A, L, Q, D, V}, "ai.bug_writer": {A, L, Q, D},
    "ai.triage": {A, L, Q}, "ai.test_cases": {A, L, Q}, "ai.release_summary": {A, L}, "ai.usage_read": {A, L},
    "ai.configure": {A},
}


@pytest.mark.parametrize("action", sorted(MATRIX))
def test_permission_matrix_matches_requirements(action: str) -> None:
    assert {r.value for r in Role if can(r, action)} == MATRIX[action]


def test_unknown_action_is_an_error() -> None:
    with pytest.raises(KeyError):
        can(Role.ORG_ADMIN, "bug.teleport")
    assert len(PERMISSIONS) >= 50


def test_access_log_carries_user_and_org(client, world) -> None:
    """Sync dependencies run in a thread; the user and org they resolve must still reach the access log."""
    import logging

    from app.core.logging import JsonFormatter

    lines: list[str] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(JsonFormatter().format(record))  # formatted at emit time, like the real handler

    logger = logging.getLogger("app.access")
    handler, old_level = Capture(), logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        client.get(f"/api/v1/orgs/{world.a.org.id}", headers=world.a.h("viewer"))
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old_level)
    viewer = world.a.users[Role.VIEWER].id
    assert any(f'"user_id": "{viewer}"' in ln and f'"org_id": "{world.a.org.id}"' in ln for ln in lines), lines
