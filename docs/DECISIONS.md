# Decisions

Format: `D-###`, question, options considered, decision, reason. Each decision was made autonomously for a 3 day MVP and can be revisited at a review gate.

## D-001 How to run Docker on this machine
* **Question:** Docker is not on the Windows PATH and Docker Desktop is not installed. How do we run Compose?
* **Options:** (a) install Docker Desktop; (b) use the Docker Engine already running inside WSL 2 Ubuntu; (c) skip Docker.
* **Decision:** (b). Call `wsl -d Ubuntu --cd /mnt/c/Users/HP/qa-pilot -- docker compose ...`. Wrap this in `scripts/*.ps1`.
* **Reason:** It is installed, running and current (Engine 29.4, Compose v5.1). Nothing outside the project has to be installed. Plain `docker compose` commands stay valid on other machines.

## D-002 How the API knows which organization a request is for
* **Options:** (a) org in the path `/api/v1/orgs/{org_id}/...`; (b) `X-Org-Id` header; (c) org embedded in the JWT.
* **Decision:** (a) org id in the path for every tenant scoped route.
* **Reason:** Explicit, cacheable, easy to test for cross tenant access, and lets one token serve a user who belongs to several orgs. The server still checks membership on every call; the path is a claim, not a proof.

## D-003 Response to cross tenant access
* **Options:** 403 for everything; 404 for resources in another org; 404 for orgs the user is not in.
* **Decision:** Not a member of the org in the path: `404 org_not_found`. Resource id that belongs to another org: `404 not_found`. Member without the needed role: `403 forbidden`.
* **Reason:** 404 avoids revealing that another tenant's records exist. 403 is kept for "you are in, but your role cannot do this".

## D-004 Pagination style
* **Options:** cursor; page and page size.
* **Decision:** Page based: `?page=1&page_size=25` (max 100), response `{items, page, page_size, total}`.
* **Reason:** The bug list shows totals and page numbers. Data volumes in v1 are small. CLAUDE.md allows either.

## D-005 Bug status workflow and who may move a bug
* **Decision:** Nine statuses and the transition table in `docs/requirements/DOMAIN_MODEL.md` section 4. Org Admin and QA Lead may perform every allowed transition. QA Engineer verifies, reopens and closes. Developer starts, fixes and hands back for retest. Viewer performs none. Any transition not in the table is rejected with `409 invalid_transition`.
* **Reason:** Mirrors a common QA flow and keeps verification with QA.

## D-006 Developer edit scope (attribute based rule)
* **Options:** developers edit any bug; developers edit only bugs assigned to them or reported by them.
* **Decision:** Developers may comment on any bug. Status changes are limited to bugs assigned to them. They may assign an unassigned bug to themselves (self assign), and moving an unassigned bug to In progress self assigns it. They cannot assign bugs to other people or take a bug already assigned to someone else. They may edit descriptive fields only on bugs they reported. They cannot change severity or priority.
* **Reason:** Prevents accidental edits while keeping developers unblocked. Self assign confirmed by the product owner at the Stage 1 gate (D-033).

## D-007 Can Viewers comment?
* **Decision:** Yes. Viewers can add comments and edit or delete their own comments. Everything else stays read only: no bug fields, status, attachments, test data, releases or AI features.
* **Reason:** Changed by the product owner at the Stage 1 gate (D-033). Stakeholders often need to ask questions on a bug.

## D-008 Bug identifiers
* **Decision:** Each project has a short uppercase key (2 to 6 letters, for example `WEB`). Bugs get a per project sequence number, shown as `WEB-42`. UUIDs remain the internal primary keys.
* **Reason:** Human friendly ids are expected in any bug tracker.

## D-009 Attachment limits
* **Decision:** Max 10 MB per file, max 10 files per bug. Allowed types: PNG, JPEG, GIF, WEBP, PDF, TXT, LOG, JSON, CSV, ZIP, MP4, WEBM. Type checked by extension and by sniffing the first bytes. Stored on a local Docker volume under a random name; downloaded only through an authenticated endpoint.
* **Reason:** Covers screenshots, logs and screen recordings without inviting abuse.

## D-010 Token lifetimes and storage
* **Decision:** Access JWT 15 minutes. Refresh token 7 days, opaque, stored hashed in the database, rotated on every refresh, revoked on logout. Frontend keeps the access token in memory and the refresh token in an httpOnly cookie set by a Next.js route handler.
* **Reason:** Short access tokens limit damage; rotation detects reuse; httpOnly cookie keeps the refresh token away from scripts.

## D-011 Invitations
* **Decision:** An Org Admin creates an invitation for an email and role. The API returns a link with a single use random token that expires after 7 days. No email is sent (out of scope); the admin copies the link. Accepting requires being logged in with the invited email, or registering with it.
* **Reason:** BUILD_PLAN says invites are copyable links.

## D-012 AI rate limits and cost controls
* **Decision:** Per user: 20 AI requests per minute. Per org: 500 AI requests per day (configurable in settings). Input truncated to 12,000 characters per field. `max_tokens` capped per feature (see AI_SPEC). Over limit returns `429 rate_limited`.
* **Reason:** Simple, predictable and safe for a demo with a real key.

## D-013 Duplicate detection method
* **Options:** pgvector embeddings; Postgres full text; in application TF IDF cosine similarity.
* **Decision:** In application TF IDF cosine similarity over title, actual result and steps of open bugs in the same project. Top 5 with score at or above 0.25. Works with the mock and the real provider and with any SQL database.
* **Reason:** The prompt asks for a DB agnostic approach; no embedding API is needed.

## D-014 Release readiness rules
* **Decision:** Computed on the server from linked bugs and runs:
  * **Blocked:** any open linked bug with severity Critical, or the combined pass rate of linked runs is below 80%.
  * **At risk:** any open linked High bug, or pass rate below 95%, or any linked run still in progress, or no runs linked.
  * **Ready:** none of the above, and at least one completed linked run.
  * "Open" means status not in Verified, Closed, Won't Fix.
* **Reason:** Easy to explain to stakeholders and to test.

## D-015 How bugs and runs link to releases
* **Options:** many to many link tables; a single `release_id` on bugs and runs.
* **Decision:** A nullable `release_id` on bugs ("target release") and on test runs.
* **Reason:** One target release per bug matches how teams work and keeps queries simple.

## D-016 Deleting records
* **Decision:** Projects are archived, not deleted. Bugs are soft deleted (`deleted_at`) by QA Lead or Org Admin and disappear from lists. Test suites and cases are soft deleted. Comments may be deleted by their author or an admin. Every deletion writes an audit event.
* **Reason:** Keeps history and audit trails intact.

## D-017 Saved views
* **Decision:** Saved views store a filter set and are private to the user who made it, scoped to the org. Sharing views is backlog.
* **Reason:** Keeps scope small.

## D-018 What AI data we keep
* **Decision:** The AI usage log stores feature, user, status, token counts (or estimated units for mock), latency and model name. It does not store prompt or response text. Logs are kept 90 days.
* **Reason:** Bug content can be sensitive; metadata is enough for cost tracking.

## D-019 SLA definition for the sla-breach seed scenario and dashboard
* **Status:** **Confirmed** by the product owner at the Stage 2 gate.
* **Thresholds (time to fix):** Critical 24 hours, High 3 days (72 hours), Medium 14 days, Low 30 days. Calendar time: nights, weekends and holidays count.
* **Clock:** starts when the bug is created and stops when the bug reaches **Fixed**. A bug breaches SLA when the time from creation to Fixed is longer than the threshold for its severity.
* **Interpretation of cases the confirmation did not cover** (can be changed at any gate):
  * Bugs that move on past Fixed (Ready for retest, Verified, Closed) keep the clock stopped at the moment they reached Fixed.
  * **Won't fix** also stops the clock (the bug is resolved without a fix).
  * **Reopened** restarts the clock from the original creation time; time spent while Fixed counts, so a reopened bug is usually already past its SLA.
  * The bug's **current** severity sets the threshold; raising severity can make a bug breach immediately.
* **Where it shows:** "Past SLA" on the dashboard counts bugs not yet fixed whose age exceeds the threshold; the bug list filter `sla_breached=true` uses the same rule; bugs fixed late keep a "Fixed late" flag for reports. Not configurable in v1; thresholds live in one constant.
* **Implementation note:** computed from `created_at` and `resolved_at` (set on entering Fixed or Won't fix, cleared on Reopened, see DOMAIN_MODEL section 4).
* **History:** Stage 1 used "open and not updated" with assumed values; at the Stage 1 gate the format was set (Critical in hours) with placeholder numbers; confirmed values and the creation to Fixed clock arrived at the Stage 2 gate (D-036).

## D-020 Password policy and hashing
* **Decision:** Minimum 10 characters, at least one letter and one number. Hashed with argon2id (`argon2-cffi`). Login is throttled to 10 failed attempts per email per 15 minutes.
* **Reason:** Modern default; argon2id is the OWASP recommendation.

## D-021 Onboarding flow
* **Decision:** Register creates a user only. If the user has no membership and no pending invitation, they land on Org setup, which creates the org and makes them Org Admin. Invited users skip org setup.
* **Reason:** Separates identity from workspace and supports joining several orgs.

## D-022 One role per membership, last admin protection
* **Decision:** Each membership has exactly one role. The last Org Admin of an org cannot be removed, demoted or leave.
* **Reason:** Prevents orphaned workspaces.

## D-023 Search
* **Decision:** Case insensitive match (`ILIKE`) on bug key, title and description, combined with filters. Full text search is backlog.
* **Reason:** Enough for v1 data volumes; meets the under 1 second target.

## D-024 Language, time and locale
* **Decision:** English only UI. All timestamps stored in UTC and displayed in the browser's local time zone.
* **Reason:** Global audience, minimal scope.

## D-025 Live updates
* **Decision:** No websockets. TanStack Query refetches on window focus and after mutations. Kanban updates optimistically and rolls back on server rejection.
* **Reason:** Keeps the stack small.

## D-026 Notifications
* **Decision:** No in app or email notifications in v1. Backlog item.
* **Reason:** Out of scope for the 3 day plan.

## D-027 Org level AI switch
* **Decision:** Org Admin can turn AI features off for the org in Settings. When off, AI buttons are hidden and AI endpoints return `403 ai_disabled`.
* **Reason:** Some teams cannot send data to a third party model.

## D-028 Who can use which AI feature
* **Decision:** Bug Writer, Explain Log and Duplicate Detector: anyone who can create bugs (Org Admin, QA Lead, QA Engineer, Developer). Triage suggestions: roles that may set severity and priority (Org Admin, QA Lead, QA Engineer). Test Case Generator: Org Admin, QA Lead, QA Engineer. Release Readiness Summary: Org Admin, QA Lead generate; everyone can read an accepted summary.
* **Reason:** AI never grants more power than the user already has.

## D-029 Frontend routes include the org slug
* **Decision:** App routes are `/o/{orgSlug}/...` (for example `/o/acme/bugs/WEB-42`). The slug is resolved to the org id client side from `/auth/me`.
* **Reason:** Shareable links that survive the org switcher.

## D-030 Severity and priority scales
* **Decision:** Severity: Critical, High, Medium, Low. Priority: P1 (urgent), P2 (high), P3 (normal), P4 (low).
* **Reason:** Familiar to QA teams worldwide.

## D-031 Test step granularity
* **Decision:** A test case holds an ordered list of steps, each with an action and an expected result. A run result is recorded per case, with the index of the failing step and an actual result note when it fails.
* **Reason:** Enables "create bug from failed step" without per step result tables.

## D-032 Developers creating bugs
* **Decision:** Developers may create bugs (they often find them) but cannot set severity or priority; those default to Medium and P3 and wait for triage.
* **Reason:** Supports real teams while keeping triage with QA.

## D-033 Stage 1 gate feedback
* **Question:** How should the Stage 1 approval notes be applied?
* **Notes received:** (1) Developers can also self assign unassigned bugs; (2) Viewers can comment but cannot change anything else; (3) keep D-014; (4) use confirmed SLA thresholds with Critical in hours.
* **Decision:** (1) adopted, D-006 updated. (2) adopted, D-007 updated. (3) D-014 unchanged. (4) Format adopted and D-019 updated, but the numbers in the note were still placeholders ("X"), so D-019 is marked as waiting for values and uses working values meanwhile.
* **Reason:** Notes 1 and 2 still contained the template's "(or: keep as is)" alternatives; the stated option was taken as the choice. Either can be reversed at the Stage 2 gate.

## D-034 GitHub remote, pushes and pull requests
* **Question:** Where does the code live, and how do stages reach `main`? (Instruction from the product owner during Stage 2; replaces the earlier "never push to a remote" rule.)
* **Decision:**
  * Remote `origin` is the private repo `github.com/Bilex95/qa-pilot`, created with `gh repo create Bilex95/qa-pilot --private`. It must never be made public.
  * Before any push, `git config user.email` must match an email verified on the GitHub account; if not, stop and tell the product owner first. Check done on 2026-11-16: the local email matches the account's public profile email, and GitHub only allows a verified address as the profile email. The direct `user/emails` API needs the `user` scope, which the current token does not have (`gh auth refresh -h github.com -s user` would grant it).
  * End of every stage: push the stage branch and open a pull request into `main`. On APPROVED: merge the PR with a normal merge commit (`gh pr merge --merge`), never squash or rebase, so every commit lands on `main`; then tag `stage-<n>-approved`, push the tag, and branch the next stage from the updated `main`.
  * Every push goes through `scripts/safe-push.sh` (added at the Stage 2 gate after the product owner pointed out that an `a && echo found || echo clean` scan could not block a push). Each check exits non zero and the push is the last step, so it runs only when all checks pass: branch is not `main`, origin is the private repo, the git email matches the verified public profile email or, when the email is private, the verified list from `gh api user/emails`, no `.env` in any commit, no secret pattern in any commit. `--dry-run` runs the checks without pushing. Tags go through the same script with `--tag` (D-036).
  * Still forbidden: force push, pushing to `main` directly outside an approved merge, committing secrets. `.env` stays in `.gitignore`; history is scanned for secrets before each push.
* **Reason (D-034):** Product owner instruction. Stage 1 predates the rule, so `main` and `stage/1-requirements` were pushed as they were (Stage 1 had already been merged locally with `--no-ff`, which is the same result as a merge commit PR).

## D-035 Responsive coverage for all common phone and tablet sizes
* **Question:** Which screen sizes must the prototype (and later the app) support, and how is that proven? (Instruction from the product owner during Stage 2.)
* **Decision:**
  * Every screen is checked at 320, 360, 375, 390, 412, 430, 768 and 1024 px, plus 1440 px desktop.
  * At every one of those widths: no sideways page scrolling; no element wider than the screen unless it sits inside its own horizontal scroll container (tables in `.table-wrap`, the Kanban board, tab strips, saved view strips); no clipped or overlapping text; tables and the board scroll inside their own container.
  * Tap targets are at least 44 by 44 px at every width up to 1024 px. The 1440 px desktop layout keeps 36 px controls for density with a mouse. Exemption, following WCAG 2.5.8: links that sit inside a sentence of running text (`p`, `li`, hints, banners, error messages). The control's own box or its wrapping label is measured.
  * The off canvas navigation drawer is `visibility: hidden` while closed, so it is neither measured nor reachable by keyboard.
  * "The validator" is implemented in `e2e/scripts/check-prototype.mjs` (the playbook's `validate_design_assets.py` only reads PNG files and cannot inspect layout). `scripts/validate-design.ps1` runs both, and fails if any element is wider than the screen.
  * Overlap is checked automatically for the direct children of toolbars and rows (header, page heads, action groups, filters, readouts, card meta, tab strips); clipped text is checked for every element that hides overflow.
  * The screenshot set stays as planned: desktop 1440x900 and one mobile size, 390x844. Size specific fixes are listed in the Stage 2 review.
* **Reason:** Product owner instruction; 320 px is the hardest common case and catches most layout bugs.

## D-036 Stage 2 gate feedback
* **Notes received:** (1) SLA confirmed: timed from creation until Fixed, calendar time, Critical 24 hours, High 3 days, Medium 14 days, Low 30 days; (2) confirm no input or select sits on `--surface-sunk` with a 2.95:1 border; (3) route tag pushes through `safe-push.sh` before Stage 6; (4) merge PR #1 with a normal merge and continue.
* **Decision:**
  * (1) D-019 rewritten and marked confirmed, with the interpretation of uncovered cases (Won't fix stops the clock, Reopened restarts it from creation, current severity applies). Prototype rule and counts updated (7 seeded bugs past SLA instead of 4).
  * (2) Audit added to `e2e/scripts/check-prototype.mjs`: no control sits on `--surface-sunk`, but disabled controls use it as their fill, giving a 2.95:1 border. A white fill was proposed and rejected by the product owner, because the grey fill is the main disabled signal and touch screens have no not allowed cursor. Instead `--line-strong` became `#828B84` (3.51:1 on white, 3.27:1 on paper, 3.07:1 on the grey disabled fill). The checker now holds disabled controls to 3:1 too.
  * (3) Done now rather than before Stage 6: `safe-push.sh --tag <name>` runs the same gates and also requires the tag to point at a commit already on `origin/main` and not to exist on origin, so tags are never moved.
  * (4) PR #1 merged with a merge commit.
* **Reason:** Product owner instructions.

## D-037 SQLAlchemy sync or async
* **Options:** async SQLAlchemy with asyncpg; sync SQLAlchemy 2 with psycopg 3.
* **Decision:** Sync SQLAlchemy 2.1 with psycopg 3. FastAPI runs sync endpoints in its thread pool. One session per request through a dependency; tests wrap each test in a transaction that is rolled back.
* **Reason:** Simpler code, simpler tests and Alembic, no async pitfalls; load in v1 is small. AI calls, the only slow I/O, run in the thread pool too.

## D-038 Dependency versions
* **Decision:** Pin exact versions. Backend: FastAPI 0.163.1, Uvicorn 0.54.0, SQLAlchemy 2.1.8, Alembic 1.20.1, psycopg 3.3.9, Pydantic 2.14.3, pydantic-settings 2.16.3, argon2-cffi 25.1.0, PyJWT 2.15.1. Frontend: Next 16.4.6, React 19.3.1, Tailwind 4.3.5, TanStack Query 5.107.1, Zod 4.6.7, openapi-typescript 7.13.0, openapi-fetch 0.17.0. **TypeScript 5.9.3 and ESLint 9.39.5** instead of the newest TypeScript 7 and ESLint 10.
* **Reason:** Current releases where the ecosystem supports them. TypeScript 7 (new native compiler) and ESLint 10 are new major lines; Next 16 and its ESLint config declare support for ESLint 9 and do not name TypeScript 7, so the mature lines avoid toolchain breakage in a 3 day build.
* **Checked in Stage 3:** npm marks ESLint 9 as no longer supported. ESLint 10.15.0 was tried: rules still load, but `eslint-plugin-import`, `eslint-plugin-jsx-a11y` and `eslint-plugin-react` (bundled by `eslint-config-next` 16.4.6) declare peer support only up to ESLint 9, so npm reports an invalid tree and `npm ci` could fail in Docker and CI. ESLint 9.39.5 stays for now; it is a development tool and never ships to users. Revisit when those plugins declare ESLint 10 (logged in `docs/BACKLOG.md`).

## D-039 Where the refresh token lives
* **Decision:** The browser never talks to FastAPI for auth directly. Next.js route handlers under `/api/session/*` call the backend, put the refresh token in an httpOnly, SameSite=Lax cookie (Secure in production) and return only the access token, which the client keeps in memory. All other API calls go from the browser straight to FastAPI with the bearer token (CORS limited to the frontend origin).
* **Reason:** Implements D-010 without exposing the refresh token to scripts, and keeps FastAPI a pure bearer token API that Postman can call.
* **Concurrent refresh:** two tabs, or React's double mount in development, can refresh with the same cookie at the same moment. The client shares one refresh request per page, and the backend treats reuse of a token rotated less than 30 seconds ago as a race (401 without revoking every session); the client then retries once with the newer cookie. Reuse after 30 seconds is still treated as theft (D-010).

## D-040 Test database
* **Decision:** Tests run against a real PostgreSQL 16 database `qapilot_test` in the same `db` service (created by an init script). The schema is built with Alembic once per session; each test runs in a transaction rolled back afterwards. CI uses a Postgres service container.
* **Reason:** Tenancy and constraint behaviour must be tested on the real engine; SQLite would hide differences.

## D-041 Seed passwords
* **Decision:** All seeded personas share one password read from `SEED_USER_PASSWORD` in `.env`. The seed refuses to run when it is empty or when `APP_ENV=production`. `.env.example` leaves it empty; `docs/SEED_MANIFEST.md` lists logins but never the password.
* **Reason:** CLAUDE.md: passwords come from `.env`, never committed.

## D-042 Ports and Docker on WSL
* **Decision:** Host ports: frontend 3000, backend 8000, Postgres 5433 (5432 inside the network, 5433 on the host to avoid clashing with a local Postgres). Dev containers bind mount the source and use polling file watchers (`WATCHFILES_FORCE_POLLING`, `WATCHPACK_POLLING`) because file events from `/mnt/c` do not reach containers reliably (RISK-01). `node_modules` lives in a named volume, not on the bind mount.
* **Found in Stage 3:** Next 16 runs `next dev` on Turbopack, which ignores `WATCHPACK_POLLING` and missed edits on the bind mount, so the container served stale code. The container now runs `npm run dev:docker` (`next dev --webpack`), which polls. `npm run dev` outside Docker keeps Turbopack.
* **Reason:** Works with Docker Engine in WSL (D-001) and with Docker Desktop.

## D-043 How the frontend reproduces the locked design
* **Question:** Rebuild the prototype styles as Tailwind utilities, or reuse its CSS?
* **Decision:** The design tokens become CSS variables in `frontend/src/app/globals.css` and are exposed to Tailwind 4 through `@theme inline` (for example `bg-primary`, `text-ink-3`). The prototype's component classes (buttons, inputs, panels, badges, tables, shell, auth layout, states, AI proof mark) are copied unchanged into the same file as `@layer components`, so the app matches the locked screens exactly. shadcn/ui components are written in shadcn's pattern (`components/ui`, `class-variance-authority`, Radix primitives) and render those classes; `components.json` is present so the shadcn CLI can add more later. Fonts are self hosted with `next/font`.
* **Reason:** Design parity with the locked prototype is a hard requirement; copying the reviewed CSS is the lowest risk way to get it, and Tailwind utilities remain available for layout.
