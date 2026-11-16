# Non Functional Requirements and Risks

## 1. Security

| ID | Requirement | Verification |
|---|---|---|
| NFR-SEC-01 | Every route except health, register, login, refresh and invitation preview requires a valid access token. A route test enumerates the OpenAPI paths and asserts 401 without a token. | API test |
| NFR-SEC-02 | Passwords hashed with argon2id; login throttled (D-020); generic error on bad credentials. | API, unit |
| NFR-SEC-03 | JWT signed with HS256 and a secret of at least 32 bytes from env; access 15 min; refresh tokens opaque, hashed, rotated, reuse detected (D-010). | API |
| NFR-SEC-04 | Security headers on API and frontend: `Content-Security-Policy` (frontend), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security` in production. | API, manual |
| NFR-SEC-05 | CORS allows only `FRONTEND_ORIGIN`. Credentials allowed only for that origin. | API |
| NFR-SEC-06 | Uploads: size and type limits, content sniffing, random storage names, `Content-Disposition: attachment` on download, no execution from the upload folder (D-009). | API |
| NFR-SEC-07 | Inputs validated by Pydantic; output escaped by React; no raw HTML rendering of user content (comments are plain text). | Review |
| NFR-SEC-08 | No secrets in git: `.env` ignored, `.env.example` empty values, CI secret scan step. | CI |
| NFR-SEC-09 | Dependency audit with `npm audit` and `pip-audit` in Stage 6; no known critical vulnerabilities at release. | Stage 6 report |
| NFR-SEC-10 | Production images run as a non root user; seed CLI refuses `APP_ENV=production`. | Manual, unit |
| NFR-SEC-11 | AI guardrails in `AI_SPEC.md` section 2. | Unit |

## 2. Tenancy

| ID | Requirement |
|---|---|
| NFR-TEN-01 | Every tenant table has `org_id NOT NULL` with a foreign key and an index. |
| NFR-TEN-02 | A single dependency `get_org_context(org_id, user)` resolves the membership and role; every tenant route uses it. Repositories require an `org_id` argument; there is no repository method that reads tenant data without it. |
| NFR-TEN-03 | Foreign references in requests (assignee, component, environment, release, label, suite, case) are checked to belong to the same org and project; otherwise 422. |
| NFR-TEN-04 | Every endpoint has a cross tenant test using the `multi-tenant` fixture (two orgs, one user per role in each). |
| NFR-TEN-05 | File downloads check the attachment's org against the path org. |

## 3. Performance targets (local, seeded baseline)

| ID | Target |
|---|---|
| NFR-PERF-01 | `GET /bugs` p95 under 300 ms with 60 bugs, and under 500 ms with 5,000 bugs (synthetic load check in Stage 6). |
| NFR-PERF-02 | Dashboard endpoint p95 under 500 ms. |
| NFR-PERF-03 | Bug list page interactive under 1 s on a warm local stack (REQ-062). |
| NFR-PERF-04 | Indexes: `(org_id, project_id, status)`, `(org_id, assignee_id)`, `(org_id, updated_at desc)` on bugs; `(org_id, run_id)` on results; `(org_id, created_at)` on AI usage and audit. |
| NFR-PERF-05 | No N plus 1 queries on list endpoints (eager loading for assignee and labels). |
| NFR-PERF-06 | AI calls time out at 30 s; the UI shows a progress state and can be cancelled. |

## 4. Accessibility (WCAG 2.1 AA, REQ-057)

* Text contrast at least 4.5:1 (3:1 for large text and UI component boundaries). Severity and status are never shown by colour alone; badges always carry text.
* All interactive elements reachable and operable by keyboard with a visible focus ring. Dialogs trap focus and return it on close. `Esc` closes dialogs.
* Kanban drag has a keyboard alternative: a "Move to" menu on each card.
* Forms: every input has a visible label, errors are linked with `aria-describedby` and announced.
* Landmarks (`header`, `nav`, `main`), one `h1` per page, skip to content link.
* Respect `prefers-reduced-motion`.
* Verified with axe in Playwright (no serious or critical issues) plus a manual keyboard pass.

## 5. Responsiveness (REQ-056)

Breakpoints 390, 768, 1440. Sidebar becomes a drawer below 1024 px. Tables become stacked cards below 768 px. Kanban scrolls horizontally within its container.

## 6. Reliability and operations

* Healthchecks on db, backend, frontend. Backend waits for db health before starting; migrations run on container start in dev.
* Structured JSON logs with request id, org id, user id, route, status, latency. No secrets or bug content in logs.
* Graceful AI degradation: any AI failure leaves the manual flow fully usable.

## 7. Data retention and privacy

| Data | Retention in v1 |
|---|---|
| Bugs, comments, test data, releases | Until deleted by the org (soft delete, kept for audit) |
| Attachments | Until the bug or attachment is deleted; file removed from disk on attachment delete |
| AI usage log (metadata only) | 90 days (D-018); cleanup command provided, scheduling is backlog |
| Audit events | 1 year |
| Refresh tokens | Deleted 30 days after expiry or revocation |
| Prompt and response text | Not stored |

Data sent to the model provider when AI is on: only the fields listed per feature in `AI_SPEC.md`. Org Admins can switch AI off (D-027). Seed data is synthetic only.

## 8. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RISK-01 | Docker runs inside WSL, not Docker Desktop; bind mounted hot reload from `/mnt/c` may be slow or miss file events | Medium | Medium | Use polling watchers (`WATCHFILES_FORCE_POLLING`, `WATCHPACK_POLLING`); document; D-001 |
| RISK-02 | Tenant leak through a missed `org_id` filter | Low | High | Repository signature requires org id; cross tenant test per endpoint; Stage 6 query review |
| RISK-03 | AI output malformed or off topic | Medium | Medium | Pydantic validation, one retry, fallback, mapping to allowed values |
| RISK-04 | Prompt injection through bug text | Medium | Medium | Content as data, no tools with side effects, suggestions only, test |
| RISK-05 | AI cost spikes when a real key is used | Low | Medium | Rate limits, token caps, org daily limit, usage screen |
| RISK-06 | Scope too large for 3 days | High | High | MoSCoW priorities; Could items cut first (REQ-040, REQ-044); backlog |
| RISK-07 | Design drift between prototype and app | Medium | Medium | Tokens shared via `design/TOKENS.md`; Playwright parity screenshots per screen |
| RISK-08 | Context resets during long stages | Medium | Low | `PROGRESS.md` after every task; review files per stage |
| RISK-09 | Next.js or dependency version churn breaks the build | Medium | Medium | Pin exact versions in lockfiles; record versions in the Stage 3 review |
| RISK-10 | Kanban drag and drop is hard to make accessible | Medium | Low | "Move to" menu as keyboard alternative |
| RISK-11 | Edge cases of the SLA clock (reopen, Won't fix, severity change) read differently by users | Low | Low | Rules written in D-019 and shown in the UI tooltip; thresholds kept in one constant |
