"""Builds postman/qa-pilot.postman_collection.json (Postman v2.1) and the local environment.

Run from the repo root:  python postman/build_collection.py
Each endpoint gets happy, invalid, unauthorized, forbidden and cross tenant requests (CLAUDE.md).
Folders for later modules are staged empty until their endpoints exist.
Secrets are never stored: the password comes from --env-var password=... at run time.
"""

import json
from pathlib import Path

HERE = Path(__file__).parent


def test(*lines: str) -> list[dict]:
    return [{"listen": "test", "script": {"type": "text/javascript", "exec": list(lines)}}]


def status(code: int) -> str:
    return f'pm.test("status {code}", () => pm.response.to.have.status({code}));'


def err(code: str) -> str:
    return (f'pm.test("error envelope {code}", () => {{ const e = pm.response.json().error; '
            f'pm.expect(e.code).to.eql("{code}"); pm.expect(e).to.have.keys("code","message","details"); }});')


def req(name: str, method: str, path: str, *, token: str | None = None, body: dict | None = None,
        tests: list[str] | None = None, pre: list[str] | None = None, desc: str = "") -> dict:
    headers = [{"key": "Content-Type", "value": "application/json"}] if body is not None else []
    item: dict = {
        "name": name,
        "request": {
            "method": method,
            "header": headers,
            "url": {"raw": "{{baseUrl}}" + path, "host": ["{{baseUrl}}"], "path": [p for p in path.split("?")[0].split("/") if p],
                    **({"query": [{"key": k, "value": v} for k, v in (q.split("=") for q in path.split("?")[1].split("&"))]}
                       if "?" in path else {})},
            "description": desc,
        },
        "event": test(*(tests or [])),
    }
    if token:
        item["request"]["auth"] = {"type": "bearer", "bearer": [{"key": "token", "value": "{{" + token + "}}", "type": "string"}]}
    else:
        item["request"]["auth"] = {"type": "noauth"}
    if body is not None:
        item["request"]["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2), "options": {"raw": {"language": "json"}}}
    if pre:
        item["event"].append({"listen": "prerequest", "script": {"type": "text/javascript", "exec": pre}})
    return item


def login(name: str, email_var: str, token_var: str, extra: list[str] | None = None) -> dict:
    return req(name, "POST", "/api/v1/auth/login", body={"email": "{{" + email_var + "}}", "password": "{{password}}"},
               tests=[status(200), f'pm.environment.set("{token_var}", pm.response.json().access_token);', *(extra or [])])


O = "/api/v1/orgs/{{orgId}}"
F = "/api/v1/orgs/{{foreignOrgId}}"

folders = [
    {"name": "Health", "item": [
        req("Health (API-001)", "GET", "/api/v1/health",
            tests=[status(200), 'pm.test("db ok", () => pm.expect(pm.response.json().db).to.eql("ok"));',
                   'pm.test("request id header", () => pm.response.to.have.header("X-Request-ID"));']),
    ]},
    {"name": "Auth", "item": [
        login("Login as Org Admin (API-011)", "adminEmail", "adminToken",
              ['pm.environment.set("adminRefresh", pm.response.json().refresh_token);']),
        req("Login wrong password (API-011 invalid)", "POST", "/api/v1/auth/login",
            body={"email": "{{adminEmail}}", "password": "Wrong-password-1"}, tests=[status(401), err("invalid_credentials")]),
        req("Login missing password (API-011 invalid)", "POST", "/api/v1/auth/login", body={"email": "{{adminEmail}}"},
            tests=[status(422), err("validation_error")]),
        req("Me (API-014)", "GET", "/api/v1/auth/me", token="adminToken", tests=[
            status(200),
            'const m = pm.response.json().memberships.find(x => x.org.slug === pm.environment.get("orgSlug"));',
            'pm.test("member of the seeded org", () => pm.expect(m).to.be.ok);',
            'pm.environment.set("orgId", m.org.id);']),
        req("Me without token (API-014 unauthorized)", "GET", "/api/v1/auth/me", tests=[status(401), err("unauthorized")]),
        req("Refresh rotates (API-012)", "POST", "/api/v1/auth/refresh", body={"refresh_token": "{{adminRefresh}}"},
            tests=[status(200), 'pm.environment.set("oldRefresh", pm.environment.get("adminRefresh"));',
                   'pm.environment.set("adminRefresh", pm.response.json().refresh_token);',
                   'pm.test("new token differs", () => pm.expect(pm.response.json().refresh_token).to.not.eql(pm.environment.get("oldRefresh")));']),
        req("Refresh with garbage (API-012 invalid)", "POST", "/api/v1/auth/refresh", body={"refresh_token": "x" * 40},
            tests=[status(401), err("invalid_refresh_token")]),
        req("Register new user (API-010)", "POST", "/api/v1/auth/register",
            pre=['pm.environment.set("newEmail", `newman.${Date.now()}@example.test`);'],
            body={"full_name": "Newman Tester", "email": "{{newEmail}}", "password": "Newman-pass-2026"},
            tests=[status(201), 'pm.environment.set("newToken", pm.response.json().access_token);']),
        req("Register duplicate email (API-010 conflict)", "POST", "/api/v1/auth/register",
            body={"full_name": "Dup", "email": "{{adminEmail}}", "password": "Newman-pass-2026"}, tests=[status(409), err("email_taken")]),
        req("Register weak password (API-010 invalid)", "POST", "/api/v1/auth/register",
            body={"full_name": "Weak", "email": "weak@example.test", "password": "short"}, tests=[status(422), err("validation_error")]),
        req("Update my profile (API-015)", "PATCH", "/api/v1/auth/me", token="newToken", body={"full_name": "Newman Renamed"},
            tests=[status(200), 'pm.test("renamed", () => pm.expect(pm.response.json().full_name).to.eql("Newman Renamed"));']),
        req("Change password wrong current (API-016 invalid)", "POST", "/api/v1/auth/me/password", token="newToken",
            body={"current_password": "Not-the-one-1", "new_password": "Another-pass-2026"}, tests=[status(400), err("wrong_password")]),
        login("Login as QA Lead", "leadEmail", "leadToken"),
        login("Login as QA Engineer", "qaEmail", "qaToken"),
        login("Login as Developer", "devEmail", "devToken"),
        login("Login as Viewer", "viewerEmail", "viewerToken"),
        login("Login as admin of the other org", "foreignAdminEmail", "foreignToken"),
        req("Other org id (for cross tenant checks)", "GET", "/api/v1/orgs", token="foreignToken",
            tests=[status(200), 'pm.environment.set("foreignOrgId", pm.response.json()[0].org.id);',
                   'pm.test("different org", () => pm.expect(pm.environment.get("foreignOrgId")).to.not.eql(pm.environment.get("orgId")));']),
    ]},
    {"name": "Orgs", "item": [
        req("My orgs (API-021)", "GET", "/api/v1/orgs", token="adminToken",
            tests=[status(200), 'pm.test("lists the org", () => pm.expect(pm.response.json().map(o => o.org.id)).to.include(pm.environment.get("orgId")));']),
        req("Get org (API-022)", "GET", O, token="viewerToken",
            tests=[status(200), 'pm.test("viewer role", () => pm.expect(pm.response.json().my_role).to.eql("viewer"));']),
        req("Get other org (API-022 cross tenant)", "GET", F, token="adminToken", tests=[status(404), err("org_not_found")]),
        req("Get org without token (API-022 unauthorized)", "GET", O, tests=[status(401), err("unauthorized")]),
        req("Update settings (API-023)", "PATCH", O, token="adminToken", body={"ai_daily_limit": 500}, tests=[status(200)]),
        req("Update settings as viewer (API-023 forbidden)", "PATCH", O, token="viewerToken", body={"name": "Nope"},
            tests=[status(403), err("forbidden")]),
        req("Update settings empty (API-023 invalid)", "PATCH", O, token="adminToken", body={}, tests=[status(422), err("validation_error")]),
        req("Create org (API-020)", "POST", "/api/v1/orgs", token="newToken",
            pre=['pm.environment.set("newSlug", `newman-${Date.now()}`);'], body={"name": "Newman Org", "slug": "{{newSlug}}"},
            tests=[status(201), 'pm.test("creator is admin", () => pm.expect(pm.response.json().membership.role).to.eql("org_admin"));']),
        req("Create org with taken slug (API-020 conflict)", "POST", "/api/v1/orgs", token="newToken",
            body={"name": "Taken", "slug": "{{orgSlug}}"}, tests=[status(409), err("slug_taken")]),
    ]},
    {"name": "Members", "item": [
        req("List members as Developer (API-024, no emails)", "GET", f"{O}/members?page_size=100", token="devToken",
            tests=[status(200), 'pm.test("emails hidden", () => pm.expect(pm.response.json().items.every(m => m.user.email === null)).to.be.true);']),
        req("List members as Org Admin (API-024)", "GET", f"{O}/members?page_size=100", token="adminToken", tests=[
            status(200),
            'const items = pm.response.json().items;',
            'pm.environment.set("viewerMembershipId", items.find(m => m.user.email === pm.environment.get("viewerEmail")).membership_id);',
            'pm.environment.set("adminMembershipId", items.find(m => m.user.email === pm.environment.get("adminEmail")).membership_id);']),
        req("List members bad page size (API-024 invalid)", "GET", f"{O}/members?page_size=500", token="adminToken",
            tests=[status(422)]),
        req("List members of other org (API-024 cross tenant)", "GET", f"{F}/members", token="adminToken", tests=[status(404)]),
        req("Change role (API-025)", "PATCH", f"{O}/members/{{{{viewerMembershipId}}}}", token="adminToken", body={"role": "viewer"},
            tests=[status(200)]),
        req("Demote last admin (API-025 conflict)", "PATCH", f"{O}/members/{{{{adminMembershipId}}}}", token="adminToken",
            body={"role": "viewer"}, tests=[status(409), err("last_admin")]),
        req("Change role as QA Lead (API-025 forbidden)", "PATCH", f"{O}/members/{{{{viewerMembershipId}}}}", token="leadToken",
            body={"role": "qa_lead"}, tests=[status(403), err("forbidden")]),
        req("Change role invalid value (API-025 invalid)", "PATCH", f"{O}/members/{{{{viewerMembershipId}}}}", token="adminToken",
            body={"role": "owner"}, tests=[status(422)]),
        req("Remove member as Viewer (API-026 forbidden)", "DELETE", f"{O}/members/{{{{adminMembershipId}}}}", token="viewerToken",
            tests=[status(403)]),
        req("Remove last admin (API-026 conflict)", "DELETE", f"{O}/members/{{{{adminMembershipId}}}}", token="adminToken",
            tests=[status(409), err("last_admin")]),
    ]},
    {"name": "Invitations", "item": [
        req("Invite (API-027)", "POST", f"{O}/invitations", token="adminToken",
            pre=['pm.environment.set("inviteEmail", `invitee.${Date.now()}@example.test`);'],
            body={"email": "{{inviteEmail}}", "role": "qa_engineer"},
            tests=[status(201), 'const r = pm.response.json();', 'pm.environment.set("invitationId", r.id);',
                   'pm.environment.set("inviteToken", r.invite_url.split("/").pop());']),
        req("Invite invalid role (API-027 invalid)", "POST", f"{O}/invitations", token="adminToken",
            body={"email": "x@example.test", "role": "owner"}, tests=[status(422)]),
        req("Invite as QA Lead (API-027 forbidden)", "POST", f"{O}/invitations", token="leadToken",
            body={"email": "x@example.test", "role": "viewer"}, tests=[status(403)]),
        req("List invitations (API-028)", "GET", f"{O}/invitations?status=pending", token="leadToken", tests=[status(200)]),
        req("List invitations as Viewer (API-028 forbidden)", "GET", f"{O}/invitations", token="viewerToken", tests=[status(403)]),
        req("Preview invitation, public (API-030)", "GET", "/api/v1/invitations/{{inviteToken}}",
            tests=[status(200), 'pm.test("masked email", () => pm.expect(pm.response.json().email_masked).to.include("\\u2022"));']),
        req("Accept with another account (API-031 forbidden)", "POST", "/api/v1/invitations/{{inviteToken}}/accept", token="newToken",
            tests=[status(403), err("email_mismatch")]),
        req("Accept without sign in (API-031 unauthorized)", "POST", "/api/v1/invitations/{{inviteToken}}/accept", tests=[status(401)]),
        req("Revoke from other org path (API-029 cross tenant)", "DELETE", f"{F}/invitations/{{{{invitationId}}}}", token="adminToken",
            tests=[status(404)]),
        req("Revoke (API-029)", "DELETE", f"{O}/invitations/{{{{invitationId}}}}", token="adminToken", tests=[status(204)]),
        req("Preview revoked link (API-030 gone)", "GET", "/api/v1/invitations/{{inviteToken}}", tests=[status(410), err("invitation_invalid")]),
    ]},
    {"name": "Audit", "item": [
        req("Audit events (API-150)", "GET", f"{O}/audit-events?page_size=5", token="adminToken",
            tests=[status(200), 'pm.test("has events", () => pm.expect(pm.response.json().total).to.be.above(0));']),
        req("Audit events as QA Engineer (API-150 forbidden)", "GET", f"{O}/audit-events", token="qaToken", tests=[status(403)]),
        req("Audit events of other org (API-150 cross tenant)", "GET", f"{F}/audit-events", token="adminToken", tests=[status(404)]),
        req("Audit events bad date (API-150 invalid)", "GET", f"{O}/audit-events?from=yesterday", token="adminToken", tests=[status(422)]),
    ]},
    {"name": "Projects", "item": [
        req("Create project (API-041)", "POST", f"{O}/projects", token="leadToken",
            pre=['const d = String(Date.now()).slice(-5);',
                 'pm.environment.set("projKey", "N" + [...d].map(c => String.fromCharCode(65 + Number(c))).join(""));'],
            body={"name": "Newman project", "key": "{{projKey}}", "description": "Created by Newman"},
            tests=[status(201), 'const p = pm.response.json();', 'pm.environment.set("projectId", p.id);',
                   'pm.test("three default environments", () => pm.expect(p.environments.map(e => e.name)).to.eql(["dev", "staging", "prod"]));']),
        req("Create project with taken key (API-041 conflict)", "POST", f"{O}/projects", token="leadToken",
            body={"name": "Duplicate", "key": "{{projKey}}"}, tests=[status(409), err("key_taken")]),
        req("Create project bad key (API-041 invalid)", "POST", f"{O}/projects", token="leadToken",
            body={"name": "Bad key", "key": "W3B"}, tests=[status(422), err("validation_error")]),
        req("Create project as Developer (API-041 forbidden)", "POST", f"{O}/projects", token="devToken",
            body={"name": "Nope", "key": "NOPE"}, tests=[status(403), err("forbidden")]),
        req("Create project without token (API-041 unauthorized)", "POST", f"{O}/projects",
            body={"name": "Nope", "key": "NOPE"}, tests=[status(401)]),
        req("List projects (API-040)", "GET", f"{O}/projects?page_size=100", token="viewerToken",
            tests=[status(200), 'pm.test("lists the project", () => pm.expect(pm.response.json().items.map(p => p.id)).to.include(pm.environment.get("projectId")));']),
        req("List projects bad page size (API-040 invalid)", "GET", f"{O}/projects?page_size=0", token="viewerToken", tests=[status(422)]),
        req("List projects of other org (API-040 cross tenant)", "GET", f"{F}/projects", token="adminToken", tests=[status(404)]),
        req("Get project (API-042)", "GET", f"{O}/projects/{{{{projectId}}}}", token="devToken",
            tests=[status(200), 'pm.test("has environments", () => pm.expect(pm.response.json().environments.length).to.eql(3));']),
        req("Get project through other org path (API-042 cross tenant)", "GET", f"{F}/projects/{{{{projectId}}}}", token="foreignToken",
            tests=[status(404), err("not_found")]),
        req("Rename project (API-043)", "PATCH", f"{O}/projects/{{{{projectId}}}}", token="leadToken", body={"name": "Newman project renamed"},
            tests=[status(200), 'pm.test("renamed", () => pm.expect(pm.response.json().name).to.eql("Newman project renamed"));']),
        req("Archive project (API-043)", "PATCH", f"{O}/projects/{{{{projectId}}}}", token="adminToken", body={"archived": True},
            tests=[status(200), 'pm.test("archived", () => pm.expect(pm.response.json().archived_at).to.be.a("string"));']),
        req("Unarchive project (API-043)", "PATCH", f"{O}/projects/{{{{projectId}}}}", token="adminToken", body={"archived": False},
            tests=[status(200), 'pm.test("not archived", () => pm.expect(pm.response.json().archived_at).to.eql(null));']),
        req("Update project empty (API-043 invalid)", "PATCH", f"{O}/projects/{{{{projectId}}}}", token="adminToken", body={}, tests=[status(422)]),
        req("Update project as Viewer (API-043 forbidden)", "PATCH", f"{O}/projects/{{{{projectId}}}}", token="viewerToken",
            body={"name": "Nope"}, tests=[status(403)]),
        req("Add component (API-045)", "POST", f"{O}/projects/{{{{projectId}}}}/components", token="leadToken",
            body={"name": "Checkout", "description": "Cart and payment"},
            tests=[status(201), 'pm.environment.set("componentId", pm.response.json().id);']),
        req("Add second component (API-045)", "POST", f"{O}/projects/{{{{projectId}}}}/components", token="leadToken",
            body={"name": "Accounts"}, tests=[status(201)]),
        req("Add component with taken name (API-045 conflict)", "POST", f"{O}/projects/{{{{projectId}}}}/components", token="leadToken",
            body={"name": "CHECKOUT"}, tests=[status(409), err("name_taken")]),
        req("Add component as QA Engineer (API-045 forbidden)", "POST", f"{O}/projects/{{{{projectId}}}}/components", token="qaToken",
            body={"name": "Nope"}, tests=[status(403)]),
        req("List components (API-044)", "GET", f"{O}/projects/{{{{projectId}}}}/components", token="viewerToken",
            tests=[status(200), 'pm.test("two components", () => pm.expect(pm.response.json().length).to.eql(2));']),
        req("Rename component (API-046)", "PATCH", f"{O}/components/{{{{componentId}}}}", token="leadToken",
            body={"name": "Checkout and cart"}, tests=[status(200)]),
        req("Rename component empty (API-046 invalid)", "PATCH", f"{O}/components/{{{{componentId}}}}", token="leadToken",
            body={"name": ""}, tests=[status(422)]),
        req("Delete component through other org path (API-047 cross tenant)", "DELETE", f"{F}/components/{{{{componentId}}}}",
            token="foreignToken", tests=[status(404)]),
        req("Delete component (API-047)", "DELETE", f"{O}/components/{{{{componentId}}}}", token="leadToken", tests=[status(204)]),
        req("List environments (API-048)", "GET", f"{O}/projects/{{{{projectId}}}}/environments", token="devToken",
            tests=[status(200), 'pm.test("default order", () => pm.expect(pm.response.json().map(e => e.name)).to.eql(["dev", "staging", "prod"]));']),
        req("Add environment (API-049)", "POST", f"{O}/projects/{{{{projectId}}}}/environments", token="leadToken",
            body={"name": "uat"}, tests=[status(201), 'pm.environment.set("newEnvId", pm.response.json().id);']),
        req("Add environment with taken name (API-049 conflict)", "POST", f"{O}/projects/{{{{projectId}}}}/environments",
            token="leadToken", body={"name": "PROD"}, tests=[status(409), err("name_taken")]),
        req("Add environment as Viewer (API-049 forbidden)", "POST", f"{O}/projects/{{{{projectId}}}}/environments",
            token="viewerToken", body={"name": "nope"}, tests=[status(403)]),
        req("Reorder environment (API-050)", "PATCH", f"{O}/environments/{{{{newEnvId}}}}", token="leadToken",
            body={"sort_order": 0}, tests=[status(200)]),
        req("Reorder environment negative (API-050 invalid)", "PATCH", f"{O}/environments/{{{{newEnvId}}}}", token="leadToken",
            body={"sort_order": -1}, tests=[status(422)]),
        req("Delete environment as QA Engineer (API-051 forbidden)", "DELETE", f"{O}/environments/{{{{newEnvId}}}}", token="qaToken",
            tests=[status(403)]),
        req("Delete environment through other org path (API-051 cross tenant)", "DELETE", f"{F}/environments/{{{{newEnvId}}}}",
            token="foreignToken", tests=[status(404)]),
        req("Delete environment (API-051)", "DELETE", f"{O}/environments/{{{{newEnvId}}}}", token="leadToken", tests=[status(204)]),
    ]},
    {"name": "Sign out", "item": [
        req("Logout (API-013)", "POST", "/api/v1/auth/logout", token="adminToken", body={"refresh_token": "{{adminRefresh}}"},
            tests=[status(204)]),
        req("Refresh after logout (API-012)", "POST", "/api/v1/auth/refresh", body={"refresh_token": "{{adminRefresh}}"},
            tests=[status(401)]),
    ]},
]
staged = [("Bugs", "Stage 4"), ("Test management", "Stage 4"), ("Releases", "Stage 4"),
          ("Dashboard and reports", "Stage 4"), ("AI", "Stage 5")]
for name, stage in staged:
    folders.append({"name": name, "description": f"Staged folder. Requests are added with the endpoints in {stage} (API_INVENTORY.md).",
                    "item": []})

collection = {
    "info": {
        "name": "QA Pilot API",
        "_postman_id": "0b5e1f0e-4f7e-4d1a-9c3b-4a5d6e7f8a9b",
        "description": "QA Pilot /api/v1. Run with Newman: npx newman run postman/qa-pilot.postman_collection.json "
                       "-e postman/local.postman_environment.json --env-var password=<SEED_USER_PASSWORD>. "
                       "Needs the baseline seed. Generated by postman/build_collection.py; edit that file, not this one.",
        "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    "item": folders,
}
environment = {
    "id": "6a1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d",
    "name": "QA Pilot local",
    "values": [
        {"key": "baseUrl", "value": "http://localhost:8000", "type": "default", "enabled": True},
        {"key": "orgSlug", "value": "lumen", "type": "default", "enabled": True},
        {"key": "adminEmail", "value": "amara@lumenfreight.test", "type": "default", "enabled": True},
        {"key": "leadEmail", "value": "lukas@lumenfreight.test", "type": "default", "enabled": True},
        {"key": "qaEmail", "value": "priya@lumenfreight.test", "type": "default", "enabled": True},
        {"key": "devEmail", "value": "diego@lumenfreight.test", "type": "default", "enabled": True},
        {"key": "viewerEmail", "value": "hana@lumenfreight.test", "type": "default", "enabled": True},
        {"key": "foreignAdminEmail", "value": "grace@harborclinics.test", "type": "default", "enabled": True},
        {"key": "password", "value": "", "type": "secret", "enabled": True},
    ],
    "_postman_variable_scope": "environment",
}
(HERE / "qa-pilot.postman_collection.json").write_text(json.dumps(collection, indent=2) + "\n", encoding="utf-8")
(HERE / "local.postman_environment.json").write_text(json.dumps(environment, indent=2) + "\n", encoding="utf-8")
n = sum(len(f["item"]) for f in folders)
print(f"Wrote {n} requests in {len(folders)} folders ({len(staged)} staged)")
