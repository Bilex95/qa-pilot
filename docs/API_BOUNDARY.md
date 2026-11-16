# API boundary

QA Pilot is one monorepo (BUILD_PLAN section 2) with a hard boundary between the frontend and the backend. The contract between them is the OpenAPI document served by the backend.

## Who owns what

| Side | Folder | Owns |
|---|---|---|
| Backend | `backend/` | All business rules, permissions, tenancy, persistence, AI calls, the OpenAPI contract at `/api/v1/openapi.json` |
| Frontend | `frontend/` | Presentation, routing, client state, the session cookie handlers in `src/app/api/session/*` (D-039) |
| Contract | `frontend/src/lib/api/schema.d.ts` | Types generated from the backend OpenAPI with `npm run api:types`; never edited by hand |

## Rules

1. **The frontend never decides permissions.** It hides or disables controls using the role returned by `/auth/me`, but the backend enforces every rule again. A hidden button is a convenience, not security.
2. **The browser talks to two origins only:** the Next.js app (pages and `/api/session/*`) and the FastAPI base URL in `NEXT_PUBLIC_API_URL` with a bearer token. No other service is called from the browser. AI providers are called only by the backend.
3. **The backend has no knowledge of the frontend** beyond the allowed CORS origin `FRONTEND_ORIGIN` and the session handlers' contract.
4. **All API paths start with `/api/v1`.** Breaking changes need a new version prefix.
5. **Errors** always use `{"error": {"code", "message", "details"}}`. The frontend maps `code` to messages; it never parses `message`.
6. **Pagination** is `?page&page_size` with `{items, page, page_size, total}` (D-004).
7. **Tenant scope** is the `org_id` path segment (D-002). The frontend resolves the org slug in its own URL to the org id from `/auth/me`.
8. **Contract changes** go backend first: change schemas, regenerate OpenAPI, run `npm run api:types`, then update the frontend. CI fails if the generated types are out of date.

## Session flow (D-010, D-039)

```
Browser            Next.js /api/session/*            FastAPI /api/v1/auth/*
  | POST login  ->   | POST /auth/login           ->   | verify, issue access + refresh
  |                  | set httpOnly cookie qp_rt  <-   |
  | <- access token  |                                  |
  | GET /api/v1/... with Bearer access token  ------------>  (direct, CORS)
  | POST refresh ->  | read qp_rt, POST /auth/refresh ->| rotate refresh token
  | <- new access    | set new cookie             <-   |
  | POST logout  ->  | POST /auth/logout, clear cookie->| revoke refresh token
```

## Module boundaries inside the backend

`backend/app/modules/<domain>/{api,application,domain,infrastructure,schemas,tests}`

* `api`: thin FastAPI routers. Parse input, call one application service, return a schema.
* `application`: use cases and services; transactions; calls other modules only through their public `application` services.
* `domain`: entities, enums, rules (for example the bug state machine). No database code.
* `infrastructure`: SQLAlchemy models and repositories. Every repository method that reads tenant data takes `org_id` (NFR-TEN-02).
* `schemas`: Pydantic request and response models (the OpenAPI contract).
* `tests`: module tests.

No module imports another module's `infrastructure` (CLAUDE.md). Shared code lives in `backend/app/core`.

One controlled exception: when a query must join another module's table to search or sort (for example the member list sorted by user name), the module uses a read only projection from `backend/app/core/readviews.py` (today `users_view`: id, email, full name, active). Writes always go through the owning module's `application` service. The request dependencies in `backend/app/core/deps.py` call the auth and orgs application services, never their repositories.
