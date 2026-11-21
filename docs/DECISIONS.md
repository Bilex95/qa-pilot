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
* **Reuse interval (revised at the Stage 3 gate):** a page reload or navigation can abort the response that carries the rotated cookie, and two tabs can refresh at once, so the browser may present a token that was rotated a moment ago. Within 30 seconds of a rotation, if that token's successor has never been used, the refresh succeeds: the successor is revoked and a new pair is issued, so the session continues. Outside the 30 seconds, reuse is treated as theft and every session of the user ends (D-010). Reuse after the successor was used, or of a token ended by logout, is refused without ending other sessions. The first version answered 401 inside the window, which signed users out when a reload interrupted a refresh; the CI responsive job found it.

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

## D-044 Standing responsive rule (Stage 3 gate, product owner)
* **Rule:** every page, component, icon and popup fits every screen size. Nothing goes outside the screen or past its container and there is no horizontal page scrolling; text stays readable (12 px minimum) and tap targets are at least 44 px on touch screens; menus, popovers, tooltips and modals stay fully inside the viewport; long names, emails and workspace names truncate or wrap cleanly; tested at 360, 390, 768, 1024, 1280, 1440, 1920 and 2560 px plus 200% browser zoom (2560 added in Stage 4 setup).
* **How it is enforced:** `e2e/scripts/check-app-layout.mjs` runs in CI (job "Responsive and popup checks") against the running stack and fails on any overflow, popup cut off or touching the edge (4 px margin; the navigation drawer may sit flush), clipped text that is not a deliberate ellipsis, text under 12 px, or a tap target under 44 px at 1024 px and below. 200% zoom is emulated as half the CSS width at device scale 2. A long names fixture (user, email and workspace) is part of every run. Typed text that disappears is a failure: every retry the checker needs to keep a value in a form field is reported as a problem. `e2e/scripts/check-signout.mjs` (also in CI) signs out from every signed in page at 1440 and 390 px and requires exactly one navigation to a plain `/login`, no further navigation, typed text kept and the session ended. Every new screen is added to the script's page list in the issue that builds it, and each stage review shows before and after screenshots at each width.
* **Popups:** Radix positioned with `collisionPadding` 8 px and edge alignment; menus are at most 320 px wide, and never wider than the screen less 16 px; long text wraps inside them.
* **Reason:** product owner instruction after two layout bugs found by hand.

## D-045 Password reset without email delivery
* **Question:** how can a user reset a forgotten password when v1 sends no email (BUILD_PLAN out of scope)?
* **Options:** (a) self service with emailed link (needs email, BL-005); (b) admin issued single use reset link, copied by hand like invitations (D-011); (c) no reset.
* **Decision:** (b) for v1. "Forgot password?" on the sign in page explains how to get a link from a workspace admin. An Org Admin creates a reset link for a member (single use, expires in 1 hour, token stored hashed); opening it lets the person set a new password and revokes all their sessions. Every step is audited. When email delivery arrives (BL-005) the same token flow becomes self service. Planned as issue I-23.
* **Reason:** secure without email, consistent with invitations, small enough for Stage 4.

## D-046 Content width at very wide screens
* **Finding:** the locked prototype caps the content area at 1280 px (`--content-max`, design/TOKENS.md) and aligns it left, so at 1920 px the empty state spans 1232 of 1688 px (73%). The built app matches the prototype exactly (comparison: `e2e/parity/stage3-fix/compare/`).
* **Decision (product owner, Stage 3 gate):** raise the cap to **1600 px**. `--content-max` changed in the prototype, CSS regenerated, locked screenshots recaptured. At 1920 px the panel now spans 1552 of 1688 px (the 1600 px content area less 24 px padding on each side); at 1440 px and below nothing changes. Measured values per width are in the Stage 3 review and in `e2e/parity/stage3-fix/compare/`. Content stays left aligned.
* **Options offered:** keep 1280, fill the full width, raise to 1600, center a 1280 column.


## D-047 Label colour, label names and the settings shell (I-02)
* **Question:** the API requires a colour token for labels, but the approved prototype draws every label chip neutral and its "New label" button has no colour picker.
* **Decision (product owner):** the design stays locked. The colour is optional in the API, validated against a fixed set of token names (`neutral`, `primary`, `sev-critical`, `sev-high`, `sev-medium`, `sev-low`, `ok`, `warn`, `danger`, `info`) and defaults to `neutral`. Chips stay neutral in the UI; coloured chips are BL-010.
* **Names:** trimmed before the length check and before the uniqueness check, 1 to 40 characters, unique per org case insensitively. A duplicate that slips past the service check is caught from the unique index `uq_labels_org_name_ci` and returned as 409 `name_taken`, never 500.
* **Counts:** the list returns `bug_count`, 0 for now. Bugs (I-03) registers the real count through `hooks.label_bug_counts` and adds `bug_labels` with `ON DELETE CASCADE` to `labels`.
* **Not found:** deleting an id that does not exist in the org is 404, the same as another org's id (D-003).
* **Settings shell:** the Labels tab lives in `frontend/src/modules/settings` with a minimal shell (tab list, page head) that I-11 extends with the Organization, Audit log and My profile tabs. The prototype's New label button only shows a toast, so the dialog (name field only) follows the prototype's dialog styling.
* **Reason:** keeps the approved design intact while storing what a later colour pass needs.


## D-048 Docker start safety and WSL idle handling (I-24)
* **Findings (measured, 2026-11-19):** (1) With a taken host port, a plain `docker compose up` fails and leaves the container in the `created` state with no network; the restart policy did not start it within 20 seconds (`scripts/repro-i24.sh`). (2) With no WSL session open, systemd stopped `docker.service` 15 seconds after the last `wsl` call and the stack came back only with the next `wsl` call. While it was down Newman got 503s, 500s and then no response at all. With a WSL session held, the same 45 second wait saw no stop. Node is not installed in WSL (the `npx` visible there is the Windows one).
* **Port refusal:** `up` through `scripts/dc.ps1` or `scripts/dc.sh` runs `scripts/dc-preflight.sh` first. A port owned by this Compose project (qa-pilot) is a no-op and continues. A port owned by anything else, including another clone under a different project name, is refused with the owner named, exit 1, nothing started. `dc.ps1` also refuses a Windows program that is not part of WSL or Docker listening on a stack port. `QAP_SKIP_PREFLIGHT=1` skips the check.
* **Restart policy:** unchanged, `restart: unless-stopped`. `on-failure` would not bring the containers back after a clean Docker stop, which is exactly what a WSL idle stop is, so it would make the idle problem worse. The preflight removes the trigger of the detached start instead.
* **Backend fail fast:** `python -m app.core.db_preflight` runs before migrations and retries resolving `db` for about 30 seconds before exiting with a clear message, so `restart: unless-stopped` does not turn into a crash loop. `depends_on` db with `condition: service_healthy` was already in place.
* **WSL idle (rule 3 amended):** a WSL hold is allowed only inside `scripts/with-wsl.ps1`, scoped to one task, always closed in `finally`, capped at one hour by `timeout`. Free running keepalives stay forbidden. Newman runs inside Docker (`scripts/newman.sh`, `scripts/newman.ps1`, `newman@6.2.3` pinned) as one `wsl` call, so it needs no hold. Windows side tools (the layout check, Playwright) run through `with-wsl.ps1`.
* **Machine settings:** `instanceIdleTimeout=-1` under `[general]` in `.wslconfig` is documented in `docs/ENVIRONMENT.md` as optional and unverified against the Microsoft documentation. The build never changes the product owner's `.wslconfig`.
* **Reason:** removes the cause of the Stage 3 incident, makes a missing network obvious, and keeps long checks from losing the stack halfway.


## D-049 Members screen: confirm before Remove, locked own row, no pager yet (I-10)
* **Remove asks first (deliberate deviation from the prototype):** the locked prototype removes a member immediately. The app shows a confirm dialog ("Remove <name>?", "<name> loses access to <org> right away. You can invite them again later.") built on the shared Dialog, because removal cuts off access at once. Role changes stay immediate (the select shows the new role while the request runs, and returns to the real role with an error toast if it fails, including `last_admin`).
* **Own row is locked:** your own role select is disabled and your own row has no Remove button. The explanation is "You are the only Org Admin. Make someone else an Org Admin first." when you are the only Org Admin and "You cannot change your own role." otherwise; it is a hover title and a screen reader description (the prototype has a title only). Only an Org Admin has controls, so a sole Org Admin is always the signed in person. The server still refuses demoting or removing the last Org Admin (409 `last_admin`) and the screen handles it. "Leave workspace" and self demotion are BL-013.
* **Pagination:** the list asks for `page_size=100` (the API maximum) and shows "Showing the first N of M members" when there are more. No pager yet (BL-012).
* **Invite link is a secret:** it lives only in the invite dialog's state, is never logged, put in a URL (by this screen) or kept in a cache that survives the dialog (the mutation has `gcTime: 0` and is reset on close), and is cleared when the dialog closes. If copying to the clipboard fails, the text is selected and the toast says so. Screenshots mask the field.
* **Error states show the request id:** `ApiError` now carries the `X-Request-ID` response header, which the API already exposes to the browser, so the error state shows "Request id ..." as in the locked screenshot.
* **QA Lead (read only):** sees the members list with emails (`member.list`) and the pending invitations with their emails (`invitation.list`), and no controls (PERSONAS_AND_ROLES.md sections 3.1 and 4).
* **Reason:** safer removal and no self lockout without changing the locked layout; an API sized screen without inventing a pager.


## D-050 Bugs: status as text, one open definition, SLA in the query, all or nothing edits (I-03)
* **Status storage (product owner):** `bugs.status` is text with a check constraint (`ck_bugs_status`), not a native Postgres enum, and all nine statuses exist now (`new`, `triaged`, `in_progress`, `fixed`, `ready_for_retest`, `verified`, `closed`, `reopened`, `wont_fix`) so I-04 needs no schema change. Default `new`. Severity and priority are text with check constraints too.
* **Open (product owner):** open means status not in (`verified`, `closed`, `wont_fix`) and not soft deleted. Fixed and Ready for retest still count as open. One function holds it: `open_clause()` in `bugs/infrastructure/repository.py` (exposed as `service.open_clause`). The project and component counters, the list filter (`open=true` or `open=false`) and the later dashboard take it from there. The SLA clock rules (D-019) are a separate function, `sla_breached_clause`, because a bug can be open and past its SLA, or finished and past it.
* **SLA:** computed in the query, nothing stored. A bug whose status is Fixed, Ready for retest, Verified, Closed or Won't fix and that has `resolved_at` is measured from creation to `resolved_at`; every other bug, a reopened one included, is measured from creation to now. The threshold comes from the current severity. A Python copy of the rule (`domain/rules.py`) fills the `sla_breached` flag on each item, and a test checks that the filter and the flag agree for every severity and status.
* **Edits are all or nothing (product owner):** in `PATCH` every changed field is checked against the role first; one forbidden field gives 403 (with the field names in `details.fields`) and nothing is applied. Developers edit fields only on bugs they reported, never set severity or priority, and assign only an unassigned bug to themselves (D-006, D-032). On create a Developer who sends severity or priority, even `medium`, gets 403; the bug is then forced to Medium and P3 when they send neither.
* **Soft delete:** `deleted_at`. Deleted bugs are hidden from lists, counts, search, filters, `GET` by id or key, and label counts. Their keys are never reused: numbers come from the project counter (`UPDATE projects SET next_bug_number = next_bug_number + 1 ... RETURNING`, one statement that holds the row lock until commit), the counter never goes back, and `(project_id, number)` and `(org_id, key)` are unique including deleted rows. A test creates 20 bugs from 10 threads on separate connections and checks the numbers are 1 to 20.
* **Key stored:** `bugs.key` (`WEB-42`) is stored next to `number`, because project keys cannot be edited. It makes search by key and `GET /bugs/WEB-42` a plain indexed lookup. Keys match case insensitively and are stored upper case.
* **Saved views (product owner):** private per user within an org (another person's view is a 404, even for an Org Admin). The stored `filters` object has a `version` number (1 today) and the same keys as the list endpoint; unknown keys, unknown statuses and other versions are 422. Names are unique per person ignoring case (409 `name_taken`).
* **References:** component, environment, labels, assignee, release and source run result must exist in the org (and, for component, environment and release, in the bug's project), otherwise 422 with the field in `details`. `release_id` and `source_run_result_id` have no foreign key yet (the tables arrive with I-08 and I-07); `bugs/application/hooks.py` lets those modules register their check, and until they do any such id is refused. Component and environment foreign keys are `ON DELETE SET NULL`, so deleting one leaves its bugs with none and the I-01 delete hook is not needed. `bug_labels.label_id` is `ON DELETE CASCADE`.
* **Contract details:** list filters that take several values are repeated query parameters (`status=new&status=triaged`), not `status[]`. `open` is an addition to the list parameters in API-060 (the "All open" saved view needs it). `sort` accepts `updated_at`, `created_at`, `severity` (Critical first when ascending) and `priority`, with `-` for descending, default `-updated_at`.
* **Audit:** `bug.created`, `bug.updated` (field changes; long text fields record only `changed`), `bug.assigned` and `bug.deleted`. Activity entries are I-05.
* **Reason:** no schema change for the workflow, one meaning of open everywhere, no stale SLA column, and no half applied edits.


## D-051 Bug list, New bug form and saved views in the app (I-03 frontend)
* **Unassigned filter (backend addition, product owner):** `unassigned=true` on `GET /bugs` returns bugs nobody is assigned to, `unassigned=false` the assigned ones. It is a separate boolean, not a value of `assignee_id`, which stays a UUID. Sending `assignee_id` together with `unassigned=true` is a 422 (`details[0].loc` is `["query", "unassigned"]`). Saved view filters accept `unassigned` too and reject the same combination. Tests, Postman requests and OpenAPI types are updated; the filters `version` stays 1 because the new key is optional.
* **Status filter:** the Status select has "All open" as its default (the shared open definition of D-050, the same words as the first view tab; approved by the product owner), "Any status" and the nine statuses. The prototype shows "Any status" while its "All open" tab filters, which would misreport what the list shows. The environment on the New bug form starts at None (approved). The search box hides the browser's own clear button (`.filters .search-f::-webkit-search-cancel-button` in the prototype CSS, `type="search"` kept). The filter state lives in the URL query string (`status`, `severity`, `assignee`, `q`, `sort`, `page` and so on, only values that differ from the default), so a refresh or a shared link keeps it.
* **Views:** the built in tabs are All open, Assigned to me, Ready for retest and Past SLA; the prototype's "Critical in prod" is dropped for now (BL-016: an `is_production` flag on environments). A tab is pressed when the current filters select the same bugs (sort order and page are ignored). Saved views follow after the built in tabs, with their own delete button that asks first. Save view stores the current search, filters and sort (`version` 1). No rename (BL-017).
* **More filters:** the prototype's five controls (search, project, status, severity, assignee) stay the visible row. Priority, component, environment and label sit behind a "More filters" button that shows how many of them are set. Component and environment need a project, so they are disabled until one is chosen.
* **New bug form:** Viewers get the "Viewers cannot report bugs" state. Developers see Severity and Priority disabled (Medium, P3) with the prototype's hint, and the request leaves both keys out (D-032: the API answers 403 even for the default values); `buildCreateBody` in `frontend/src/modules/bugs/schemas.ts` is the one place that builds the body and the flow script checks the real request. A Developer's assignee choices are Unassigned and "Me". `release_id` and `source_run_result_id` are never sent (those modules arrive with I-08 and I-07). Labels are a pick list of the labels that exist (on the spot creation is BL-015). The project defaults to the first project, as in the prototype.
* **Left out until their issues:** AI Bug Writer, explain log and duplicate warning (I-15), file drop zone (I-05), Export CSV (API-133, I-09).
* **Bug key links:** `/o/<org>/bugs/<KEY>` shows the existing "on its way" placeholder until the detail screen of I-05.
* **Label delete confirm:** deleting a label asks first and says how many bugs lose it ("It will be removed from 3 bugs."), using the real `bug_count`. Undo stays out (BL-011).
* **Reason:** the screens match the locked layout, nothing in the UI promises what the API refuses, and every filter can be shared as a link.


## D-052 Test suites and test cases (I-06)
* **Case ids (product owner):** a case shows as `TC-<number>`. The number comes from a per org counter (`test_case_counters`), reserved with one `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` that holds the row lock until commit, so cases created at once never share a number. Numbers are never reused, soft deleted cases included. `GET /test-cases/{case_ref}` accepts a UUID or a key like `TC-103` (case insensitive), the same way bugs accept a UUID or key; the other case endpoints take the UUID. A test creates 20 cases from 10 threads on separate connections.
* **Migration number (product owner):** `0005_testing` (head was 0004). I-05's `0005_bug_detail` is now `0006_bug_detail` in the plan. An applied migration is never renumbered.
* **Suite names (product owner):** unique per project, case insensitive, 409 `name_taken`, by a partial unique index `uq_test_suites_project_name_ci` on `(project_id, lower(name)) WHERE deleted_at IS NULL`, written with `text("lower(name)")` (not `func.lower("name")`, the I-01 mistake). A deleted suite frees its name.
* **Deleting a suite (product owner):** soft delete (`deleted_at`) of the suite and its cases together; the audit event `suite.deleted` records how many cases went with it; the UI confirm shows the count. A case of a deleted suite is a 404.
* **Moving a case (product owner):** `PATCH` with `suite_id` moves a case to another suite of the same project; another project's suite, another org's suite and an unknown suite are 422 on `suite_id`.
* **Case types (product owner):** three, `positive`, `negative` and `edge`, in the API, the database check constraint (`ck_test_cases_case_type`), DOMAIN_MODEL 1.4, API_INVENTORY (API-095 and API-096) and the UI, matching REQ-047 and the prototype. `other` was in the first version of the data model and is gone; a value outside the three is a 422 on create, edit, bulk and the list filter. The migration `0005_testing` was edited in place for this: it was committed but never pushed, and its tables were dropped and rebuilt in the dev database (downgrade to 0004 and upgrade), so no applied or shared migration changed.
* **Case title (product owner):** 5 to 200 characters after trimming, the same as bugs (REQ-017). Tests cover 4, 5, 200 and 201 characters on create, edit and bulk, and a title that is 3 characters once its spaces are trimmed.
* **`ai_usage_id` (product owner):** `POST .../cases/bulk` refuses a non null `ai_usage_id` with 422 (`details[0].loc` is `["body", "ai_usage_id"]`) until the AI usage log (I-14) registers its check in `testing/application/hooks.py` (`ai_usage_exists`), the same pattern as `release_id` for bugs. The check runs before any number is reserved, so a refused request uses no number. `ai_generated` may still be set per case.
* **Steps:** a JSON list of `{id, action, expected}`. At least 1 and at most 50; `action` and `expected` are required, 1 to 1000 characters each. `PATCH` replaces the whole list; a step that is sent with its `id` keeps it (so reordering keeps ids), a step without one gets a new id, repeated ids are a 422.
* **Tags:** at most 20 per case, 1 to 30 characters each, stored trimmed and lower case without repeats; the tag filter is case insensitive. Case titles are 5 to 200 characters (see above).
* **Bulk:** `POST .../cases/bulk` takes 1 to 50 cases, all or nothing (the whole request is validated first and the cases are written in one transaction). Response `{created: [case]}`.
* **Suite list output:** `case_count` counts cases that are not deleted; `last_run_pass_rate` is `null` until test runs exist (I-07 registers it in `hooks.last_run_pass_rates`). Suites are listed by name; the screen groups them by project.
* **Audit:** `suite.created`, `suite.updated`, `suite.deleted`, `case.created` (one per case, also for bulk), `case.updated`, `case.deleted`. Long text is not copied into audit data.
* **Reason:** stable human ids without a schema change later, no half created bulk batches, and the same soft delete and counter patterns as bugs.


## D-053 Approved edit to the locked prototype: no native clear button in the filter search box
* **What changed:** one CSS rule was added to `design/reference/approved.html`, directly after `.filters .search-f` (commit `b632541`):
  ```
  .filters .search-f::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
  ```
  Nothing else in the file changed. `frontend/src/app/globals.css` is regenerated from it (`python scripts/build_globals_css.py`, drift check passes).
* **Why:** the search boxes use `type="search"`, which draws the browser's own clear (×) button in Chromium. The locked screenshots show none, so the app differed from the locked design. The product owner asked for the button to be hidden with CSS while keeping `type="search"`. Affects the search inputs inside `.filters` (bug list, members); the header search box is a different element and is unchanged.
* **Approval:** requested and approved by the product owner on 2026-11-20 (before and after at 1440 px in `e2e/parity/stage4/i03/compare/`). `scripts/validate-design.ps1` passes after the edit: traceability, 39 prototype screens and states at 320 to 1440 px, 1000 route x role x state combinations, axe, and 100 screenshot files.
* **Rule:** the locked design changes only with the product owner's approval and is recorded here (D-044 rule: prototype first, then regenerate the CSS).


## D-054 Test suites screen and case editor in the app (I-06 frontend)
* **Suites screen (SCR-12):** the suite list on the left is grouped by project (suites of an archived project share an "Archived projects" group) with each suite's case count; the selected suite and the page of its cases live in the URL (`?suite=<id>&page=<n>`) and default to the first suite. The panel shows the suite's description, component and, once runs exist (I-07), the last run pass rate. The case table shows ID (`TC-n`), Title (a link to the editor), Type, Priority, Steps and Tags. Everyone reads; Org Admin, QA Lead and QA Engineer see New suite, New test case, Edit suite and Delete suite.
* **Pager (product owner):** 25 cases per page with Previous and Next, as on the bug list. The prototype shows all cases of a suite without a pager.
* **Dialogs:** New suite and Edit suite share one dialog (name, project on create only, component, description); a name that is taken in the project is shown on the name field (409 `name_taken`). The project of a suite cannot change. Delete suite asks first and names how many cases go with it ("Its 3 cases are deleted with it.", product owner).
* **Case editor (SCR-13):** title, suite, type, priority, preconditions, steps (action and expected result side by side, move up, move down, remove, add, 1 to 50 rows) and tags (comma separated, 20 at most, 30 characters each). A saved case can move only to a suite of its own project (D-052); a new case can go into any suite, chosen from the `?suite=` link or the first suite. Rows left completely empty are ignored; a row with only one of the two texts is an error. Saved steps are sent back with their `id`, so moving a step keeps its id. Title 5 to 200 characters, checked on the screen and by the API. Three case types (D-052).
* **Delete case (product owner):** a confirm dialog names the case; the prototype has no delete. Past test runs keep their own copy of a case (REQ-032), which the dialog says.
* **Read only:** Developer and Viewer see the same screen with every field disabled, no Save, Add step, move or Delete, and the prototype's note "Only QA roles can edit test cases." in the side column.
* **Left out until their issues:** the AI Test Case Generator panel and the "Generate cases" button (I-17); the case editor is a single column of 980 px for editors. The prototype's "View as" switcher is not part of the app.
* **Test data:** the flow script names its suites `flow-i06-<timestamp>` and deletes every suite with that prefix in `finally` (their cases go with them), also after a failed step; a negative hook (`QA_FLOW_INJECT_FAILURE=1`) fails on purpose to prove it. Case numbers used by test data stay used.
* **Priority copy (product owner):** in tables and chips a priority is shown as "P1" to "P4", as in the prototype (the `PriorityTag` on the bug list and the case table). The longer labels "P1 urgent", "P2 high", "P3 normal" and "P4 low" appear only as the options inside a priority dropdown (the New bug form, the case editor and the More filters select). Checked in the code: no table cell or chip uses the long labels.
* **Reason:** the locked layout with the same states, no control the API refuses, and a link for every selected suite or case.


## D-055 Secrets out of URLs, password reset links and session end on password change (I-23, BL-014)
* **Tokens leave the URL (product owner):** an invitation token or a reset token is never in a path or a query string. Links carry it in the **fragment** (`/invite#<token>`, `/reset-password#<token>`), which a browser never sends to a server and never puts in a Referer header. The page reads the fragment, removes it from the address bar at once with `history.replaceState` so it is not left in history, and sends the token in a **POST body**: `POST /invitations/preview` (API-030) and `POST /invitations/accept` (API-031) for invitations, `POST /auth/password-reset/preview` (API-152) and `/auth/password-reset/confirm` (API-153) for resets. `invite_url` in the create response now has the fragment form.
* **Between pages:** while a person signs in or registers to accept an invitation, the token waits in `sessionStorage` of that tab only, for 30 minutes at most, and is cleared on accept, on any error and on sign out. The login and register links carry no token and no `?next=` of the invite page.
* **Old routes removed now (product owner):** `GET /invitations/{token}`, `POST /invitations/{token}/accept` and the `/invite/[token]` page are deleted, not deprecated. The app is not deployed, so only dev seed invitations exist and none of them needs the old form. BL-018 (remove them later) is closed as not needed. The access log still redacts a path of the form `/api/v1/invitations/<token>` (`redact_path` in `core/middleware.py`) in case anything ever sends one; before this change the log wrote every invitation token it was asked for.
* **Headers:** `Referrer-Policy: no-referrer` and `Cache-Control: no-store` on `/invite`, `/reset-password` and `/forgot-password` (`next.config.ts`, a block after the general one so its value wins for these paths; checked by `e2e/scripts/check-secret-page-headers.mjs`).
* **Reading the fragment (frontend):** `lib/secret-link.ts` reads the fragment once, validates its shape, removes it with `history.replaceState` and keeps the token in memory. A link opened in a tab that is already on the same page only changes the hash (no reload), so the helper listens to `hashchange` and reads the new fragment again. Each fragment read gets a generation number, and the preview query key holds that number, never the token: without it the second link kept showing the preview of the first (found by the layout check, fixed, and covered by the flow scripts for `/reset-password` and `/invite`). A reset token is never stored anywhere; an invitation token waits in `sessionStorage` as described above.
* **Reset password action (frontend):** a Reset password button on every Members row except your own, for an Org Admin only (`member.reset_password`). It asks first (the person is signed out everywhere once the link is used), then shows the link once in a dialog with the same secret handling as the invite dialog: component state only, `gcTime: 0`, dropped when the dialog closes, a Copy button with a select fallback. `shared_account`, `own_account` and `not_found` get plain messages. The forgot and reset pages reuse the auth card; there is no locked design for them (the screenshots are in `e2e/parity/stage4/i23/`, approved by the product owner).
* **Test data hygiene (product owner):** the Newman collection removes the member it registers for the reset tests and checks that no "Newman Reset" member is left. Test scripts that create a reset link end it afterwards: `e2e/scripts/revoke-reset-links.mjs` sets `revoked_at` on the person's unused links through the database container (the API has no revoke endpoint, and a newer link would itself be live), the same field the backend sets when a link is replaced, and fails the run if a link is still live. Removing a membership does not end the person's reset links, so the scripts revoke them explicitly.
* **Password reset (D-045):** an Org Admin creates a link for a member (`POST {O}/members/{membership_id}/password-reset`, API-151, action `member.reset_password`). The token is `token_urlsafe(48)`, stored as a SHA-256 hash (`password_resets`), shown once, valid 1 hour, single use, and a newer link for the same person replaces the older one. Confirming checks the link first (every problem is the same 410 `reset_invalid` whatever the password), then the password policy (422, the link stays usable), then claims the link with one `UPDATE ... WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now RETURNING`, so two requests cannot both win (tested with real concurrent sessions). Failed previews and confirms are counted per client address (10 in 15 minutes, then 429 with `Retry-After`); the audit event `auth.reset_failed` never holds the token. Audit: `auth.reset_link_created` and `auth.password_reset` carry the org, so the workspace's admins see them.
* **No enumeration (product owner):** the Forgot password page has no email field and sends no request: it explains how to get a link from a workspace admin. Nothing can be probed. Unknown, used, expired and replaced links get byte for byte the same answer.
* **Own account (product owner):** an admin cannot create a link for their own account (409 `own_account`, "change your password in your profile").
* **Shared accounts (product owner):** the password is global, so a link is refused with 409 `shared_account` for a person who has an active membership in more than one workspace; otherwise an admin of one workspace could take over a person's access to the others. Self service reset by email (BL-019) is the way out for those people.
* **Sessions end at once (product owner):** `users.password_changed_at` is set by a reset and by a normal password change (API-016). Refresh tokens are revoked, and an access token issued before that moment is refused with 401. `iat` carries whole seconds only, so access tokens also carry `iat_us` (microseconds, exact integer arithmetic); the order inside a shared second is decided by it: issued before the change (also in the same second) or at the same microsecond is refused; one microsecond after, or later in the same second, is accepted. A token from before this rule (no `iat_us`) is refused when issued in the second of the change or earlier. A user who never changed their password keeps every token. Tests cover each case.
* **A normal password change keeps this device signed in (product owner):** `POST /auth/me/password` (API-016) answers 200 with a fresh `{access_token, refresh_token, expires_in}` instead of 204. The pair is issued after `password_changed_at` (the access token is stamped at least one microsecond later), so the person stays signed in on the device they used, while every other session ends: all earlier refresh tokens are revoked and every access token issued before the change, on this device too, is refused. The caller must replace its stored tokens with the returned pair (the profile screen of I-11 does). A reset through a link has no such device and signs everyone out. A refused change (wrong current password, weak new password) changes nothing. Tests: the old token is refused, the returned token is accepted at once and is stamped after the change, the old and other refresh tokens are revoked, the returned refresh token rotates.
* **Migration number:** `0010_password_resets` (the number the I-23 issue file already had; `0006` to `0009` stay reserved for I-05, I-07, I-08 and I-14). Revision numbers name the issue; the chain follows the order they are built in, so the next migration (for example I-05's `0006_bug_detail`) sets `down_revision = "0010"`. An applied migration is never renumbered.
* **Reason:** a secret in a URL ends up in history, logs and Referer headers; a reset link must not give an admin more than one workspace's worth of control; and a stolen session must not survive a password change.

## D-056 Removing a person ends their reset links (BL-020, found after I-23)
* **Gap:** `remove_member` only sets the membership to `removed`. A reset link issued for that person stays valid until it expires (D-055), so they could still set a new password with it. Access to the workspace is already gone at once, because every org route checks for an active membership (D-003).
* **Decision:** removing a membership revokes every live reset link of that person (`revoked_at`, the same field a newer link uses). The orgs module calls a public function of the auth service, not the auth repository.
* **Sessions:** the workspace session needs no change. When the person has no active membership left in any workspace, their refresh tokens are also revoked and `password_changed_at` is set, so every access token issued before is refused (the same call a reset uses). A person who still belongs to another workspace keeps their sessions, because the account is shared.
* **Done (product owner approved fixing it at once):** `auth.end_access_after_removal(db, user_id, in_other_workspace)` is called from `remove_member` in the same transaction. Three tests (link and sessions end, a person in another workspace keeps their sessions, other people's links are untouched) and six Postman requests. See BL-020.

## D-057 Settings: organization, AI switch, audit log and profile (I-11)
* **Tabs and roles (product owner):** Org Admin sees Organization, Labels, Audit log and My profile; QA Lead sees Labels and My profile; everyone else sees My profile only. The tab is in the address (`?tab=audit`) so the account menu can open My profile. A tab the role may not use falls back to My profile. The API refuses the same actions with 403 whatever the screen shows (tested directly as QA Lead, Developer and Viewer).
* **AI switch (product owner):** when AI is off the daily limit field is disabled, not hidden, and its stored value is kept; turning AI off sends only `ai_enabled`, so the limit is never overwritten. `useAiEnabled()` (org context) is the one hook every AI control must read (D-027); it follows `/auth/me`, which a Settings save reloads.
* **Audit events (product owner):** workspace name, AI switch and daily limit changes were already audited. A password change and a name change are now audited too, once per workspace the person belongs to (they had no `org_id`, so no admin could see them). Events carry `actor_name` and, for role changes, removals and reset links, `target_name`, both resolved from the user record, so a person removed from the workspace is still named. New `GET {O}/audit-events/actors` (API-154) lists the people with events in the workspace for the Who filter, removed people included. Passwords and tokens never reach an event.
* **Date range (product owner):** the From and To days are local calendar days; the screen sends the start of the From day and the last millisecond of the To day as UTC instants. Proven at UTC+1 (Paris): an event at 23:30 local belongs to its own day and one at 00:30 to the next.
* **Password change keeps this device signed in (D-055):** the screen calls the new session route `POST /api/session/password`, which forwards to API-016 and replaces the httpOnly refresh cookie with the new pair; the new access token replaces the one in memory. Every other session ends.
* **Confirm new password (product owner):** the profile form has a "Confirm new password" field. The locked prototype and its Settings screenshots were updated first (the prototype first rule); the reset password page already had one.
* **Save buttons stay enabled:** as in the prototype. Saving with nothing changed shows "Nothing to change." and sends no request.
* **Provider banner:** the prototype names the AI provider; no API exposes it before I-14, so the banner says the model is chosen in the server environment. BL-021 puts the provider name back when an endpoint offers it.
* **Layout check lighter (product owner):** the browser is closed and started again after every batch of 3 widths (`--batch`), one page at a time, and half created fixtures are removed when the run stops on an error. The full layout run for I-11 was killed for low memory three times (the machine had 3.5 GB free of 15.7 GB), so I-11 has no full layout run; the changed screens were checked by the parity capture at 1440 and 390 and by the design validation.

## D-058 Bug workflow, transitions and Board (I-04)
* **Fixed table, no configuration (D-005):** 9 statuses and 16 moves live in `bugs/domain/workflow.py`; `GET /bug-workflow` (API-067) publishes the table so the screen never keeps its own copy. The screen adds only the role and assignee rule (`allowedTargets`), and the server remains the judge.
* **Two refusals:** a move not in the table is 409 `invalid_transition` with `details.allowed`; a move in the table that the role or the bug does not permit is 403. A stale board therefore shows the real reason.
* **Developer rule:** a Developer may move a bug only when it is assigned to them or unassigned; moving an unassigned bug to In progress assigns it to them (D-006). QA Engineer: triage, verify, reopen, close. Viewer: none. Org Admin and QA Lead: every move.
* **Comment on a move:** up to 2,000 characters, kept in the `bug.status_changed` audit event. There is no comments table until I-05, so the move comment does not appear on the bug yet; I-05 will show it as an activity line. `BugActivity` is left to I-05.
* **Board window:** each column returns its first 50 cards and a `total`; a column over 50 says "Showing N of M" and links to the filtered list. The status filter is ignored on the board because the columns are the statuses.
* **Optimistic moves (D-025):** the card moves at once, a server refusal rolls it back with a toast, and the board and bug list queries are refreshed after every move.
* **Keyboard path:** each card has a "Move KEY to" menu listing the 8 other statuses, with not allowed ones disabled and labelled, so drag is never the only way.
* **Transition buttons on the bug detail page** arrive with I-05 using API-065 and API-066 and the same `allowedTargets`.
* **No new CSS:** the board reuses rules already generated from the prototype.
* **Layout check:** the I-04 full run did not pass (killed for memory, then the stack stopped answering on the lighter retry); logged in PROGRESS and the stage review, per Part 3.

## D-059 Bug detail: comments, files and the timeline (I-05)
* **Migration number:** `0011_bug_detail` (the plan said 0006; 0010 was taken by the password reset migration, so 0011 follows it). Tables `comments`, `attachments`, `bug_activity`. Bugs that already existed get one `created` entry in the migration, so every timeline starts the same way. Seed data (I-12) must write its history through the services, not around them.
* **Timeline values:** `bug_activity` is append only. Status, severity and priority keep their raw key; assignee, component, environment and labels keep the name they had at that moment (a rename or a delete later does not rewrite history); long text fields (description, steps, expected and actual result) record that they changed and keep no words; the release keeps its id until I-08 can name it (BL-026). An assignment is its own kind (`assigned`), a release change is `linked_release`, everything else `field_changed`.
* **Comments:** plain text, 1 to 5,000 characters after trimming, newlines kept as written and never rewritten or rendered as markup. Newest first. Everyone comments, Viewers included (D-007). Nobody edits another person's comment, an Org Admin included; an Org Admin deletes any, everyone else their own. A deleted comment keeps its row (`deleted_at`) and writes the audit event `comment.deleted`, which names the comment and its author but never copies the words.
* **The reason given for a move is now a real comment** (replaces the D-058 line about keeping it only in the audit event): a status move with a comment writes a `Comment` by the person who moved the bug plus a `commented` entry; a blank reason writes nothing. The audit event keeps it too.
* **A "commented" entry is the comment itself:** the screen merges the two lists by time and does not repeat the `commented` entries. The API still lists them, so REQ-025 holds for API users.
* **Attachments (D-009):** at most 10 files of 10 MB per bug; the type must be on the list by extension and the first bytes must agree (PNG, JPEG, GIF, WEBP, PDF, ZIP, MP4 and WEBM by their signatures; txt, log, json and csv must be UTF-8 with no NUL byte). The content type served comes from the extension, never from what the browser sent. The stored name is a random key in a folder per workspace on the upload volume; the original name is a cleaned label (no folders, no control characters, at most 255 characters). 413 `file_too_large`, 415 `unsupported_type`, 409 `too_many_files`; an empty file or a missing file is 422. The bug row is locked during an upload so two uploads cannot both pass the count of 10; the file is written before the row and removed again if the row fails.
* **Download:** `GET attachments/{id}/download` is authenticated and checked against the workspace of the path, sends `Content-Disposition: attachment`, `nosniff` and `Cache-Control: private, no-store`, and 404s for a file of another workspace, a file of a deleted bug and a file missing from the disk. The browser fetches it with the bearer token and saves the blob, so the token is never in a URL.
* **Who removes files:** Org Admin and QA Lead remove any file; QA Engineer and Developer their own; Viewers none (PERSONAS 3.3). Removing deletes the row and the file.
* **Bug detail counts:** the detail output carries `comment_count` and `attachment_count` (REQ-018). Commenting, attaching and removing a file move the bug's `updated_at`, so the list sorts by the last activity.
* **Bug detail screen (SCR-10):** status buttons from the workflow definition (D-058), delete with a confirm dialog (QA Lead and Org Admin), Details selects that save on change (severity and priority for QA roles; assignee for QA roles, a Developer only takes an unassigned bug with "Assign to me"; component and environment for anyone who may edit, a Developer only on a bug they reported). Differences by decision: the attachment chip has a Remove button for people who may remove it; the Release row reads "None" or "Linked" until I-08; the AI triage panel waits for I-16; title, description and label editing is not in the locked prototype (BL-023).
* **Upload limit at the edge:** the API refuses a request that declares a body over 11 MB at once, but a form without a length is read to a temporary file before the 413 (BL-024). A reverse proxy limit belongs in the deployment.
* **Files of a deleted bug** stay on the volume with their rows (BL-025). Test scripts delete the files they upload before they delete the bug.
* **Postman uploads** use small text fixtures in `postman/fixtures/` and Newman runs with `--working-dir postman`. The 10 MB and the eleventh file cases are covered by pytest only (a 10 MB fixture does not belong in the repository).
* **Layout check:** the bug detail has its states in `check-app-layout.mjs` (default with long text, 32 comments and 10 files with long names, the three dialogs, a comment being edited, older entries, comments only, the comment error, loading, error, not found, and the Developer and Viewer variants). The step that opens Settings in the long names workspace had been stale since I-11 (Organization became the first tab); it now opens the Labels tab.
