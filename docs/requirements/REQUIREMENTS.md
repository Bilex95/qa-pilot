# QA Pilot: Requirements Register

Version 1.0, Stage 1, 2026-11-16. Status of every requirement: **Proposed** until the Stage 1 gate is approved.

## 1. Business goal

QA professionals lose time on repetitive work: rewriting rough notes into clear bug reports, deciding severity, hunting for duplicates, writing the same kinds of test cases again and again, and summarising release risk for stakeholders. QA Pilot is a multi tenant web app that combines a solid bug tracker and test manager with AI assistance for exactly those tasks. Every AI output is a suggestion the human accepts, edits or discards.

**Success for v1 (3 day MVP):**
1. A QA Engineer can go from rough notes to a filed, triaged bug in under 2 minutes with AI help.
2. A QA Lead can run a test cycle, turn a failed step into a bug in one click, and see whether a release is ready.
3. A stakeholder can read the dashboard and a plain English release summary without editing rights.
4. Data from one organization is never visible to another.

## 2. Non goals (v1)

Jira or GitHub sync, SSO, billing, native mobile apps, real email delivery (invites are copyable links), cloud file storage (local volume only), notifications (D-026), real time collaboration (D-025), shared saved views (D-017), full text search (D-023), configurable workflows or SLAs (D-005, D-019), translations (D-024). Ideas are tracked in `docs/BACKLOG.md`.

## 3. Stakeholders

| Stakeholder | Interest |
|---|---|
| Product owner (the human reviewer) | Approves each stage gate, owns scope |
| Org Admin, QA Lead, QA Engineer, Developer, Viewer | End users; see `PERSONAS_AND_ROLES.md` |
| Tech lead (Claude Code) | Builds and verifies; owns platform requirements |

## 4. How to read this register

* **Source:** `BP` = `docs/BUILD_PLAN.md` (section), `MP` = master prompt (stage), `CL` = `CLAUDE.md`, `D-###` = `docs/DECISIONS.md`.
* **Priority:** Must, Should, Could (MoSCoW).
* **Owner:** the role that cares most and would sign off the behaviour.
* **Verify:** `API` pytest API test, `UNIT` unit test, `E2E` Playwright, `NEW` Newman, `AXE` axe accessibility scan, `MAN` manual review at a gate.
* Screen ids (`SCR-##`) are in `SCREEN_INVENTORY.md`; endpoint ids (`API-###`) in `API_INVENTORY.md`; delivery artifacts (`ART-##`) in section 6.
* Every endpoint must also meet REQ-007, REQ-008 and REQ-054 (roles, tenancy, conventions). These are not repeated in each row.

## 5. Requirements

### 5.1 Auth and workspaces (BP 1.1)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-001 | A visitor can register with name, email and password. | BP 1.1 | Must | Org Admin | Valid input creates a user and returns tokens; duplicate email returns 409 `email_taken`; weak password returns 422 with field details. | API, E2E |
| REQ-002 | A user can log in with email and password and receives a JWT access token and a refresh token. | BP 1.1 | Must | QA Engineer | Correct credentials return 200 with tokens; wrong credentials return 401 `invalid_credentials` without saying which field was wrong; `/auth/me` returns the user and memberships. | API, E2E |
| REQ-003 | Sessions refresh silently and can be ended. | MP S3, D-010 | Must | QA Engineer | Refresh with a valid token returns a new pair and revokes the old refresh token; reusing a revoked token returns 401; logout revokes the refresh token. | API |
| REQ-004 | A user without a workspace creates an organization and becomes its Org Admin. | BP 1.1, D-021 | Must | Org Admin | Org setup with name and unique slug creates the org and an Org Admin membership; duplicate slug returns 409; the user lands on the dashboard. | API, E2E |
| REQ-005 | A user who belongs to several orgs can switch between them. | MP S3, D-029 | Should | QA Engineer | The header org switcher lists every membership; switching changes the URL slug and all data shown. | E2E |
| REQ-006 | An Org Admin invites people by email and role through a copyable link. | BP 1.1, D-011 | Must | Org Admin | Creating an invite returns a single use link valid 7 days; the invite preview shows org name and role; accepting with the matching email creates the membership; expired, used or revoked links return 410 `invitation_invalid`. | API, E2E |
| REQ-007 | Role based access control with five roles is enforced on the server for every action. | BP 1.1, CL | Must | Org Admin | The permission matrix in `PERSONAS_AND_ROLES.md` is implemented as policy helpers; every protected route returns 403 `forbidden` when the role lacks permission; the UI hides or disables the same actions. | API, E2E |
| REQ-008 | Every record belongs to one organization and is never visible across tenants. | BP 1.1, CL, D-002, D-003 | Must | Org Admin | Every query filters by `org_id`; each endpoint has a cross tenant test that returns 404; a user of org A cannot read, list, update or delete org B data. | API, E2E |
| REQ-009 | An Org Admin manages members: change role, remove member. | BP 1.1, D-022 | Must | Org Admin | Role change and removal take effect on the next request; the last Org Admin cannot be demoted or removed (409 `last_admin`). | API, E2E |
| REQ-010 | Passwords are stored safely and brute force is limited. | NFR, D-020 | Must | Org Admin | Passwords hashed with argon2id; policy enforced; after 10 failed logins in 15 minutes the email gets 429 `rate_limited`. | API, UNIT |
| REQ-011 | A user can edit their profile name and change their password. | MP S2 | Should | QA Engineer | Name updates appear in the header; password change requires the current password and revokes other refresh tokens. | API |
| REQ-012 | Security and data changes are written to an audit log that Org Admins can read. | MP S3 | Should | Org Admin | Events from `DOMAIN_MODEL.md` section 6 are recorded with actor, org, entity, action, time; Org Admin can list them with filters; other roles get 403. | API |

### 5.2 Projects (BP 1.2)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-013 | QA Leads and Org Admins create, edit and archive projects with a short key. | BP 1.2, D-008, D-016 | Must | QA Lead | Key is 2 to 6 uppercase letters and unique per org (409 if taken); archived projects are hidden from pickers but stay readable. | API, E2E |
| REQ-014 | Projects have components (modules) used to classify bugs and test suites. | BP 1.2 | Must | QA Lead | CRUD for components; names unique per project; deleting a component in use sets bugs to "No component" after confirmation. | API |
| REQ-015 | Projects have environments (defaults dev, staging, prod) used on bugs and runs. | BP 1.2 | Must | QA Lead | New projects get the three defaults; leads can add, rename and remove environments. | API |
| REQ-016 | A project overview shows its open bugs, latest runs, components and environments. | MP S2 | Should | QA Lead | Overview counts match the server dashboard filtered by project. | API, E2E |

### 5.3 Bug tracking (BP 1.3)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-017 | Users who may report bugs create a bug with title, description, steps to reproduce, expected result, actual result, severity, priority, component, environment, labels, assignee and target release. | BP 1.3 | Must | QA Engineer | Title (5 to 200 chars) and project are required; the bug gets the next key (for example `WEB-43`); status starts as New; Developers cannot set severity or priority (D-032). | API, E2E |
| REQ-018 | Users view a bug and edit its fields according to their role. | BP 1.3, D-006 | Must | QA Engineer | Detail returns all fields, labels, assignee and counts; edits obey the permission matrix; every change writes an activity entry. | API, E2E |
| REQ-019 | The bug status workflow is enforced on the server. | BP 1.3, D-005 | Must | QA Lead | Only transitions in `DOMAIN_MODEL.md` section 4 are accepted, and only by the allowed roles; others return 409 `invalid_transition` or 403; the API lists allowed next statuses for the current user. | API, UNIT |
| REQ-020 | Bugs can be assigned and reassigned to members of the org. | BP 1.3 | Must | QA Lead | Assignee must be an active member of the same org (422 otherwise); Developers can only assign an unassigned bug to themselves (403 otherwise, D-006); assignment change is logged. | API |
| REQ-021 | Bugs carry severity (Critical, High, Medium, Low) and priority (P1 to P4). | BP 1.3, D-030 | Must | QA Lead | Values validated; list and board show colour coded badges with text labels. | API |
| REQ-022 | Org wide labels can be created and attached to bugs. | BP 1.3 | Should | QA Engineer | Labels unique per org; a bug can have up to 10 labels; filter by label works. | API |
| REQ-023 | Users can comment on bugs. | BP 1.3, D-007 | Must | Developer | All roles, including Viewers, can add comments (1 to 5,000 chars, plain text with line breaks); authors edit or delete their own; admins delete any. | API, E2E |
| REQ-024 | Users can attach files to bugs. | BP 1.3, D-009 | Must | QA Engineer | Allowed types and limits from D-009 enforced (413 or 415 otherwise); files download only through an authenticated, tenant checked endpoint. | API |
| REQ-025 | Each bug shows an activity timeline of every change. | BP 1.3 | Must | Developer | Creation, field changes (old and new value), status moves, comments and attachments appear in time order with actor. | API, E2E |
| REQ-026 | The bug list supports filters, search, sort and pagination. | BP 1.3 | Must | QA Engineer | Filters: project, status, severity, priority, assignee, reporter, component, environment, label, release, SLA breach; search over key, title and description; sort by updated, created, severity, priority; page size up to 100. | API, E2E |
| REQ-027 | Users save a filter set as a named private view. | MP S2, D-017 | Should | QA Lead | Save, apply and delete views; views of other users are invisible. | API |
| REQ-028 | A Kanban board shows bugs by status and supports drag to change status. | BP 1.3 | Must | Developer | Columns follow the workflow; dropping on a column not allowed for that bug and user is refused with a message and the card returns; allowed drops persist. | API, E2E |
| REQ-029 | QA Leads and Org Admins can delete a bug (soft delete). | D-016 | Should | QA Lead | Deleted bugs disappear from lists and return 404; an audit event is written. | API |

### 5.4 Test management (BP 1.4)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-030 | QA roles organise test cases into suites per project. | BP 1.4 | Must | QA Lead | Suite CRUD with name, description, component; suite list shows case count and last run result. | API, E2E |
| REQ-031 | QA roles write test cases with title, preconditions, ordered steps (action and expected result), tags and priority. | BP 1.4, D-031 | Must | QA Engineer | At least one step required; steps can be reordered; cases can be added in bulk (used by the AI generator). | API, E2E |
| REQ-032 | QA roles create a test run from selected suites or cases, for an environment and optional release. | BP 1.4 | Must | QA Lead | A run snapshot copies case title and steps, so later edits to cases do not change past runs; all results start Untested. | API, E2E |
| REQ-033 | Testers record a result per case: Pass, Fail, Blocked or Skipped, with an optional note and the failing step. | BP 1.4 | Must | QA Engineer | Progress bar and counts update; a run can be completed, after which results are read only. | API, E2E |
| REQ-034 | From a failed result, one click opens a new bug prefilled with run context. | BP 1.4 | Must | QA Engineer | The draft includes title, steps up to the failing step, expected and actual result, environment, component, run name and link; saving links the bug to the result. | API, E2E |

### 5.5 Releases (BP 1.5)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-035 | QA Leads and Org Admins manage release versions with name, target date, description and status (Planned, In progress, Released). | BP 1.5 | Must | QA Lead | Version name unique per project; status changes are audited. | API, E2E |
| REQ-036 | Bugs and test runs can be linked to a release. | BP 1.5, D-015 | Must | QA Lead | Link and unlink from the release page; a bug or run belongs to at most one release. | API |
| REQ-037 | Each release shows a readiness status (Ready, At risk, Blocked) computed on the server with reasons. | BP 1.5, D-014 | Must | Viewer | Rules from D-014; each reason is listed (for example "2 open Critical bugs"); recalculated on every read. | UNIT, API |

### 5.6 Dashboard and reports (BP 1.6)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-038 | A dashboard shows open bugs by severity, bug trend (opened vs closed per day, last 30 days), test run pass rate, top components by open bugs, and release readiness. | BP 1.6 | Must | Viewer | All numbers come from one server endpoint filtered by org and optional project; numbers match seeded data in the manifest. | API, E2E |
| REQ-039 | A reports screen shows the same metrics with project and date range filters plus status distribution and per assignee workload. | BP 1.6 | Must | QA Lead | Changing filters updates every chart; empty ranges show an empty state. | API, E2E |
| REQ-040 | Reports can be exported to CSV. | MP S2 | Could | QA Lead | CSV of the filtered bug list with the visible columns. | API |
| REQ-041 | Bugs that breach the SLA are counted and filterable. | D-019 | Should | QA Lead | SLA is time from creation to Fixed in calendar time: Critical 24 hours, High 3 days, Medium 14 days, Low 30 days (confirmed); dashboard tile counts unfixed bugs past their SLA; bug list filter `sla_breached=true` matches the rule; bugs fixed late are flagged. | UNIT, API |

### 5.7 AI layer (BP 1.7)

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-042 | AI features run through a provider interface with an Anthropic provider and a deterministic mock provider; mock is the default when no key is set. | BP 1.7, CL | Must | Tech lead | `AI_PROVIDER=mock` works offline with fixed outputs; `AI_PROVIDER=anthropic` uses `ANTHROPIC_MODEL`; the active provider is shown on the AI usage screen. | UNIT |
| REQ-043 | AI Bug Writer turns rough notes or a pasted log into a structured report (title, steps, expected, actual, environment, suggested severity). | BP 1.7 | Must | QA Engineer | Output validated against the schema in `AI_SPEC.md`; result fills the new bug form as a suggestion. | API, E2E |
| REQ-044 | "Explain this log" summarises a pasted log or stack trace in plain English inside the Bug Writer. | MP S5 | Could | Developer | Returns summary, likely cause and key lines; shown as a suggestion that can be inserted into the description. | API |
| REQ-045 | AI Triage suggests severity, priority and component with a short reason. | BP 1.7 | Must | QA Lead | Suggestion only uses values that exist in the project; Apply changes fields only after the user clicks it. | API, E2E |
| REQ-046 | Duplicate Detector shows up to 5 similar open bugs in the same project with similarity scores before submit. | BP 1.7, D-013 | Must | QA Engineer | Runs as the user types title or actual result (debounced); score at or above 0.25; links open the existing bug; works the same with mock or real provider. | UNIT, API, E2E |
| REQ-047 | Test Case Generator turns a user story or acceptance criteria into positive, negative and edge test cases. | BP 1.7 | Must | QA Engineer | Each case tagged by type with steps and expected results; the user picks which cases to add to a suite. | API, E2E |
| REQ-048 | Release Readiness Summary writes a plain English risk summary for a release from its linked data. | BP 1.7 | Must | Viewer | Summary references counts that match the readiness endpoint; accepted text is saved on the release and visible to all roles. | API, E2E |
| REQ-049 | Every AI result is an editable suggestion with Accept, Edit and Discard; nothing is saved until accepted; the outcome is logged. | BP 1.7, CL | Must | QA Engineer | No AI endpoint writes domain data; Accept, Edit or Discard posts the outcome to the usage log. | API, E2E |
| REQ-050 | User content sent to the model is treated as data, never instructions, and model output is validated. | CL, MP S5 | Must | Tech lead | User text is wrapped in labelled delimiters; system prompt forbids following embedded instructions; invalid output gets one retry then a graceful fallback; a prompt injection test passes. | UNIT |
| REQ-051 | Each org has an AI usage log and screen (feature, user, tokens or units, latency, status, outcome). | BP 1.7, D-018 | Must | Org Admin | Every AI call writes one row; the screen shows totals per feature and a paged list; no prompt text is stored. | API, E2E |
| REQ-052 | AI use is rate limited per user and per org, and can be turned off per org. | MP S5, D-012, D-027 | Must | Org Admin | Over limit returns 429; with AI off, AI controls are hidden and endpoints return 403 `ai_disabled`. | API |

### 5.8 Settings, platform and quality

| ID | Requirement | Source | Pri | Owner | Acceptance criteria | Verify |
|---|---|---|---|---|---|---|
| REQ-053 | Org Admins edit org settings: name, AI on or off and AI daily limit. Org Admins and QA Leads manage labels. | MP S2 | Must | Org Admin | Changes are audited; other roles see only the tabs the matrix allows. | API, E2E |
| REQ-054 | The API follows one convention: `/api/v1` prefix, one error envelope `{error:{code,message,details}}`, page pagination, request ids, current OpenAPI. | CL, D-004 | Must | Tech lead | Every error response matches the envelope; `/api/v1/openapi.json` lists every endpoint in `API_INVENTORY.md`. | API, NEW |
| REQ-055 | Every screen has default, empty, loading and error states. | MP S2, MP S4 | Must | QA Engineer | States match the locked prototype; errors show a retry action. | E2E, MAN |
| REQ-056 | Every screen works at 390, 768 and 1440 pixel widths. | MP S4, MP S6 | Must | QA Engineer | No horizontal page scroll; navigation collapses into a menu on mobile; Kanban scrolls horizontally inside its frame. | E2E |
| REQ-057 | The app meets WCAG 2.1 AA on key screens. | MP S1, MP S6 | Must | Viewer | No serious or critical axe violations; forms and dialogs fully usable by keyboard; contrast at least 4.5:1 for text. | AXE, MAN |
| REQ-058 | Unknown routes show a friendly 404 page with a way back. | MP S2 | Must | Viewer | Any unknown route renders the 404 screen with a link to the dashboard. | E2E |
| REQ-059 | `docker compose up -d` starts db, backend and frontend healthy from a clean clone. | BP 5, CL | Must | Tech lead | All three services report healthy; health endpoint returns 200 with db status. | MAN, NEW |
| REQ-060 | A local and test only seed CLI creates deterministic, idempotent scenarios and refuses to run in production. | BP 4, CL | Must | Tech lead | Scenarios `baseline`, `empty`, `sla-breach`, `release-blocked`, `multi-tenant`; running twice gives identical counts; `APP_ENV=production` exits with an error; manifest lists expected counts and logins. | UNIT, MAN |
| REQ-061 | API tests ship as a Postman collection run by Newman in CI, together with lint, types and unit tests. | CL, MP S3 | Must | Tech lead | CI runs ruff, mypy, pytest, ESLint, tsc, build and a Newman smoke on a seeded stack. | NEW, MAN |
| REQ-062 | The bug list with seeded data loads in under 1 second locally. | MP S6 | Should | QA Engineer | p95 of `GET /bugs` under 300 ms and the page interactive under 1 s on the seeded baseline. | MAN |
| REQ-063 | The app ships secure defaults: security headers, strict CORS, no secrets in git, non root production images. | CL, MP S3, MP S6 | Must | Tech lead | Headers present on responses; CORS allows only the frontend origin; secret scan finds nothing; prod images run as non root. | MAN, API |

## 6. Delivery artifacts referenced by platform requirements

| ID | Artifact |
|---|---|
| ART-01 | `docker-compose.yml` with healthchecks |
| ART-02 | Seed CLI `python -m app.seed` and `docs/SEED_MANIFEST.md` |
| ART-03 | `postman/` collection and environment |
| ART-04 | `.github/workflows/ci.yml` |
| ART-05 | `e2e/` Playwright suite including axe and responsive checks |

## 7. Traceability

Rule: every screen maps to at least one REQ; every Must REQ maps to a screen, an endpoint or a delivery artifact; every id referenced exists. "All" means the requirement applies to every screen or endpoint. Checked by `scripts/check_traceability.py`.

| REQ | Pri | Screens | Endpoints | Artifacts |
|---|---|---|---|---|
| REQ-001 | Must | SCR-02 | API-010 | |
| REQ-002 | Must | SCR-01 | API-011, API-014 | |
| REQ-003 | Must | SCR-01 | API-012, API-013 | |
| REQ-004 | Must | SCR-03 | API-020 | |
| REQ-005 | Should | SCR-05 | API-021, API-022 | |
| REQ-006 | Must | SCR-04, SCR-19 | API-027, API-028, API-029, API-030, API-031 | |
| REQ-007 | Must | All | All | |
| REQ-008 | Must | All | All | |
| REQ-009 | Must | SCR-19 | API-024, API-025, API-026 | |
| REQ-010 | Must | SCR-01, SCR-02, SCR-19 | API-010, API-011, API-151, API-152, API-153 | |
| REQ-011 | Should | SCR-20 | API-015, API-016 | |
| REQ-012 | Should | SCR-20 | API-150, API-154 | |
| REQ-013 | Must | SCR-06, SCR-07 | API-040, API-041, API-042, API-043 | |
| REQ-014 | Must | SCR-07 | API-044, API-045, API-046, API-047 | |
| REQ-015 | Must | SCR-07 | API-048, API-049, API-050, API-051 | |
| REQ-016 | Should | SCR-07 | API-130 | |
| REQ-017 | Must | SCR-11 | API-061 | |
| REQ-018 | Must | SCR-10 | API-062, API-063 | |
| REQ-019 | Must | SCR-09, SCR-10 | API-065, API-066, API-067 | |
| REQ-020 | Must | SCR-08, SCR-10 | API-063 | |
| REQ-021 | Must | SCR-10, SCR-11 | API-061, API-063 | |
| REQ-022 | Should | SCR-10, SCR-11, SCR-20 | API-052, API-053, API-054 | |
| REQ-023 | Must | SCR-10 | API-069, API-070, API-071, API-072 | |
| REQ-024 | Must | SCR-10, SCR-11 | API-073, API-074, API-075, API-076 | |
| REQ-025 | Must | SCR-10 | API-077 | |
| REQ-026 | Must | SCR-08 | API-060 | |
| REQ-027 | Should | SCR-08 | API-078, API-079, API-080 | |
| REQ-028 | Must | SCR-09 | API-068, API-066 | |
| REQ-029 | Should | SCR-10 | API-064 | |
| REQ-030 | Must | SCR-12 | API-090, API-091, API-092, API-093, API-094 | |
| REQ-031 | Must | SCR-13 | API-095, API-096, API-097, API-098, API-099, API-100 | |
| REQ-032 | Must | SCR-14 | API-101, API-102, API-103, API-104 | |
| REQ-033 | Must | SCR-15 | API-105 | |
| REQ-034 | Must | SCR-15, SCR-11 | API-106, API-061 | |
| REQ-035 | Must | SCR-16, SCR-17 | API-110, API-111, API-112, API-113, API-114 | |
| REQ-036 | Must | SCR-17 | API-116, API-117, API-118, API-119 | |
| REQ-037 | Must | SCR-16, SCR-17 | API-115 | |
| REQ-038 | Must | SCR-05 | API-130 | |
| REQ-039 | Must | SCR-18 | API-131, API-132 | |
| REQ-040 | Could | SCR-18 | API-133 | |
| REQ-041 | Should | SCR-05, SCR-08 | API-130, API-060 | |
| REQ-042 | Must | SCR-21 | API-140, API-141, API-142, API-143, API-144, API-145 | |
| REQ-043 | Must | SCR-11 | API-140 | |
| REQ-044 | Could | SCR-11 | API-141 | |
| REQ-045 | Must | SCR-10 | API-142 | |
| REQ-046 | Must | SCR-11 | API-143 | |
| REQ-047 | Must | SCR-13 | API-144, API-100 | |
| REQ-048 | Must | SCR-17 | API-145, API-113 | |
| REQ-049 | Must | SCR-10, SCR-11, SCR-13, SCR-17 | API-148 | |
| REQ-050 | Must | | API-140, API-141, API-142, API-143, API-144, API-145 | |
| REQ-051 | Must | SCR-21 | API-146, API-147 | |
| REQ-052 | Must | SCR-20, SCR-21 | API-023, API-140 | |
| REQ-053 | Must | SCR-20 | API-023 | |
| REQ-054 | Must | | API-001, All | |
| REQ-055 | Must | All | | |
| REQ-056 | Must | All | | ART-05 |
| REQ-057 | Must | All | | ART-05 |
| REQ-058 | Must | SCR-22 | | |
| REQ-059 | Must | | API-001 | ART-01 |
| REQ-060 | Must | | | ART-02 |
| REQ-061 | Must | | | ART-03, ART-04 |
| REQ-062 | Should | SCR-08 | API-060 | |
| REQ-063 | Must | | All | ART-01 |

### Coverage summary

From `python scripts/check_traceability.py` (full run in `docs/reviews/STAGE_1_REVIEW.md`):

* 63 requirements: 52 Must, 9 Should, 2 Could.
* 22 screens, each mapped to at least one specific requirement.
* 97 endpoints, each referenced by at least one requirement.
* 5 delivery artifacts, 32 decisions.
* Every Must requirement maps to a screen, an endpoint or an artifact. No orphan ids.
