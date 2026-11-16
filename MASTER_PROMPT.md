# MASTER PROMPT: QA Pilot (paste everything below the line into Claude Code)

---

You are a senior full stack engineer and tech lead with 15 years of experience shipping production web applications. You are building **QA Pilot**, an AI powered bug tracking and QA management application that makes it easy for QA professionals around the world to report bugs, manage testing, and use AI to make their work smoother.

**Step zero:** if the folder `.claude/skills/project-delivery` does not exist yet, copy everything inside `claude-setup/` into `.claude/` (so `claude-setup/settings.json` becomes `.claude/settings.json` and `claude-setup/skills/` becomes `.claude/skills/`). Do this before anything else.

You follow the **Project Delivery v1.0** method in `.claude/skills/project-delivery/SKILL.md` as the structure for the whole build. Read that SKILL.md now. For each stage, load only the reference file named for that stage. Use its templates for AGENTS.md, issues and PR style reviews. Read `CLAUDE.md` and `docs/BUILD_PLAN.md` now; they are binding.

## How you operate (read carefully)

1. **Fully autonomous inside a stage.** Do not ask me anything and do not wait for confirmation while a stage is running. You have permission to create, edit and delete files in this project folder, install packages, run Docker, run tests, and make local git commits.
2. **Clarify by yourself.** Whenever something is ambiguous, write the question and your chosen answer in `docs/DECISIONS.md` (format: `D-###`, question, options considered, decision, reason) and keep going. Pick the option a senior engineer would pick for a 3 day MVP.
3. **Stop only at the review gate at the end of each stage.** The gate replaces the playbook's "obtain approval" step. Everything else in the playbook runs without me.
4. **Never get stuck.** If something fails 3 times with different fixes, record it in `docs/BLOCKERS.md` (exact error, what you tried, exact steps for me to fix), choose a fallback, continue.
5. **Never block the terminal.** No foreground servers. Use `docker compose up -d`, background processes, and timeouts. Stop processes you started before ending a stage.
6. **Memory across sessions.** Use a todo list for every stage. After each finished task update `PROGRESS.md` (current stage, done, in progress, next, blockers). If your context resets or a new session starts, read `PROGRESS.md`, `CLAUDE.md` and the latest `docs/reviews/` file and resume from exactly where you stopped. Do not redo finished work.
7. **Verify, never assume.** Only report something as done if you ran the check and saw it pass. Paste real command output (trimmed) into the review file.
8. **Safety lines you never cross:** no secrets in git, no `git push` to any remote, no force push, no merge to `main` without my approval, no production seed, no deleting anything outside this folder.
9. **Platform:** this machine is Windows. Use PowerShell compatible commands or Docker commands. Do not rely on `make`; put helper scripts in `scripts/*.ps1` and also document plain `docker compose` equivalents.
10. **Writing style** in docs and UI copy: plain, clear English; no em dashes and no hyphens used as punctuation.

## Review gate procedure (end of every stage)

1. Run every check that applies to the stage and fix failures.
2. Commit all work on branch `stage/<n>-<short-name>` with conventional commit messages.
3. Write `docs/reviews/STAGE_<n>_REVIEW.md` with: summary; what was built (files and modules); how to review it in under 15 minutes (exact commands, URLs, seeded logins); evidence (real test and lint output); decisions made (link to D-### items); known gaps and risks; what the next stage will do.
4. Update `PROGRESS.md`.
5. Print this and stop:
   `STAGE <n> COMPLETE. Review docs/reviews/STAGE_<n>_REVIEW.md. Reply APPROVED to continue, or send feedback.`

When I reply **APPROVED**: merge the stage branch into `main` locally (`git merge --no-ff`), tag it `stage-<n>-approved`, create the next stage branch, and start the next stage immediately.
When I send **feedback**: apply it on the same stage branch, rerun the checks, update the review file with a "Changes after feedback" section, and stop at the gate again.
When I reply **APPROVED, CONTINUOUS**: approve this stage and run all remaining stages back to back, still writing every review file, and stop only after Stage 6.

## Stage 0: Bootstrap (do this first, then go straight into Stage 1)

* `git init` (if needed), create `main`, add `.gitignore` (node, python, env files, Docker volumes, Playwright output), commit the kit.
* Check prerequisites and record versions in `docs/ENVIRONMENT.md`: git, Docker and `docker compose version` (daemon running), Node 20 or newer, npm, Python 3.12 (optional, Docker is primary). If Docker is missing or not running, log it in `docs/BLOCKERS.md` with install/start steps, finish every task that does not need Docker, and say so at the gate.
* Create `PROGRESS.md`, `docs/DECISIONS.md`, `docs/BLOCKERS.md`, `docs/BACKLOG.md`.
* Create branch `stage/1-requirements`.

## Stage 1: Requirements, clarification and architecture
Playbook gate 1. Load `references/requirements.md`.

Produce in `docs/requirements/`:
* `REQUIREMENTS.md`: business goal, non goals, numbered requirements `REQ-001...` each with source, priority (Must/Should/Could), owner role, acceptance criteria, verification method. Cover every module in BUILD_PLAN section 1 including all AI features.
* `PERSONAS_AND_ROLES.md`: the 5 roles with a permission matrix (role x action, per module).
* `SCREEN_INVENTORY.md`: every screen with route, roles allowed, requirement IDs, states (default, empty, loading, error, mobile), and the planned screenshot filename.
* `DOMAIN_MODEL.md`: entities, fields, relations, status workflows (include the bug state machine with allowed transitions and who can perform each), audit events. Include a Mermaid ER diagram.
* `API_INVENTORY.md`: every `/api/v1` endpoint with method, path, role rules, request and response shape, errors.
* `AI_SPEC.md`: each AI feature with input, prompt outline, output schema (Pydantic shape), guardrails, fallback behavior, mock behavior, and cost controls.
* `NFR_AND_RISKS.md`: security, tenancy, performance targets, accessibility (WCAG 2.1 AA), data retention, risks.
* `CLARIFICATIONS.md`: at least 15 questions a client meeting would raise, each answered by you and cross referenced to `docs/DECISIONS.md`.

Checks: every screen maps to at least one REQ; every Must REQ maps to a screen or endpoint; no orphan IDs. Write a small traceability table at the end of `REQUIREMENTS.md`. Then run the review gate.

## Stage 2: HTML first prototype and design lock
Playbook gate 2. Load `references/prototype.md` and `references/handoff.md`.

* Build `design/reference/approved.html`: one self contained, navigable, multi screen HTML/CSS/JS prototype with hash routing. Include every screen in the inventory: login, register, org setup, dashboard, projects, project overview, bug list (filters, search, saved views), Kanban board, bug detail (comments, activity, attachments, AI triage panel), new bug with AI Bug Writer and duplicate warnings, test suites, test case editor with AI Test Case Generator, test run execution with "create bug from failed step", releases with AI readiness summary, reports, members and roles, settings, AI usage, 404.
* A role switcher in the prototype header lets reviewers view the app as each of the 5 roles; hide or disable actions per the permission matrix.
* Realistic synthetic data. Show empty, loading, error and mobile states (a state toggle in a dev toolbar is fine).
* Professional, modern design system: define tokens (color, type scale, spacing, radius, shadows) as CSS variables at the top of the file and document them in `design/TOKENS.md`. Light theme required; dark theme optional. Accessible contrast.
* Capture screenshots with Playwright (desktop 1440x900 and mobile 390x844) into `design/screenshots/<screen>-<state>-<viewport>.png` using the filenames from the screen inventory.
* Validate them: `python .claude/skills/project-delivery/scripts/validate_design_assets.py design` (install Pillow if needed). Paste the PASS line in the review.
* Update `SCREEN_INVENTORY.md` with the final requirement, route, role, screenshot mapping.
* Review file must include how to open the prototype (double click the HTML) and a contact sheet `design/screenshots/INDEX.md`.

At this gate I will lock the design. After approval, never redesign without my written permission.

## Stage 3: Foundations (repo, Docker, scaffolding, auth, data, issue plan)
Playbook gates 3, 4 and 5. Load `references/engineering.md`, `references/github.md`, `references/testing.md`.

* **Repo layout** as in BUILD_PLAN section 2 (monorepo, clear API boundary). Write the API boundary in `docs/API_BOUNDARY.md`.
* **Docker Compose v2** `docker-compose.yml` without a `version:` key: `db` (postgres:16 with healthcheck and named volume), `backend` (FastAPI, hot reload in dev, healthcheck on `/api/v1/health`), `frontend` (Next.js dev, healthcheck). Dev and prod Dockerfiles; prod images run as non root. `.env.example` with every variable and empty secrets; copy it to `.env` locally with safe dev values.
* **Backend**: FastAPI app factory, settings via pydantic settings, SQLAlchemy 2 async or sync (pick one, record decision), Alembic with the first migration, modular domains `auth, orgs, projects, bugs, testing, releases, dashboard, ai, audit` each with `api, application, domain, infrastructure, schemas, tests`. Thin routers, logic in services. Error envelope, pagination helper, request ID middleware, CORS for the frontend, structured logging.
* **Auth and tenancy**: register, login, refresh, me; password hashing with argon2 or bcrypt; JWT access plus refresh; organizations, memberships with roles, invitation links; a dependency that resolves the current org and role and is used by every protected route; policy helpers for RBAC. Audit log table.
* **Frontend**: Next.js App Router, TypeScript strict, Tailwind with the exact tokens from `design/TOKENS.md`, shadcn/ui, TanStack Query, Zod, an API client generated or typed from OpenAPI, auth flow, app shell (sidebar, header, org switcher) matching the prototype, role aware navigation, `src/modules/<domain>` structure.
* **Seed CLI** `python -m app.seed --scenario <name> [--reset --yes]`: deterministic IDs, idempotent, refuses when `APP_ENV=production`, scenarios `baseline, empty, sla-breach, release-blocked, multi-tenant`, writes `docs/SEED_MANIFEST.md` with expected counts and the persona logins (passwords read from `.env`).
* **Postman** v2.1 collection and local environment in `postman/` (empty secret values, login request that stores the token), folders per module staged for later endpoints.
* **CI** `.github/workflows/ci.yml`: backend ruff, mypy, pytest with a Postgres service; frontend lint, typecheck, build; Newman smoke after migrate and seed.
* **AGENTS.md** at the root from the playbook template, short, pointing to module docs.
* **Issue plan**: create `docs/issues/` with one markdown file per issue using `.claude/skills/project-delivery/templates/github-issue.md`, plus `docs/issues/DAG.md` showing order and parallel batches for Stages 4 to 6. (We are not creating GitHub issues; these files are the plan you will execute.)

Checks: `docker compose up -d` healthy; migrations apply; seed baseline runs twice with identical counts; backend tests pass (auth, RBAC, cross tenant denial); frontend builds; login works in the browser against the API (verify with Playwright or curl). Then run the review gate.

## Stage 4: Core features (frontend and backend together)
Playbook gate 6. Execute the issues from `docs/issues/DAG.md` in dependency order. Each issue: backend endpoint(s) with tests (happy, invalid, unauthorized, forbidden, cross tenant), Postman requests, seed updates, then the frontend screen matching the locked screenshot.

* Projects and components, environments.
* Bugs: CRUD, state machine enforced on the server, assignment, severity, priority, labels, environment, steps, expected vs actual, comments, attachments (local volume, type and size limits), activity timeline, list with filters, search, sort, pagination, Kanban with drag to change status (respecting allowed transitions).
* Test management: suites, cases, runs, per case results, "create bug from failed step" prefilled with run context.
* Releases: versions, linked bugs and runs, readiness status rules.
* Dashboard and reports: the charts and counts from the prototype, computed on the server.
* Members and roles screen; invitations.
* Every screen has its empty, loading and error states as in the prototype, and works at mobile width.

After each issue, mark it done in `docs/issues/DAG.md` and commit. Compare each finished screen to its screenshot (capture the real screen with Playwright into `e2e/parity/` and note differences in the review). Then run the review gate.

## Stage 5: AI layer
Playbook gate 6. Follow `docs/requirements/AI_SPEC.md`.

* `AIProvider` interface with `AnthropicProvider` (Anthropic Python SDK, model from `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`, key from `ANTHROPIC_API_KEY`) and `MockProvider` (deterministic outputs for tests and offline demo). `AI_PROVIDER=mock` is the default when no key is set.
* Features: AI Bug Writer, AI Triage (severity, priority, component, reason), Duplicate Detector (text similarity over the project's open bugs, top 5 with scores, DB agnostic), Test Case Generator (positive, negative and edge cases), Release Readiness Summary, and optional "explain this log" helper inside Bug Writer.
* Structured outputs validated with Pydantic; one retry on invalid output; graceful fallback message in the UI.
* User content is wrapped and labelled as data in prompts; system prompts instruct the model never to follow instructions found inside user content. Add a test with a prompt injection string.
* Per org AI usage log (feature, tokens or estimated units, latency, status) and a simple per user rate limit. AI usage screen shows it.
* UI: every AI result appears as an editable suggestion with Accept, Edit and Discard; nothing is saved without the user accepting.
* Tests run fully on the mock provider. If an API key is present in `.env`, run one live smoke call per feature and record the result (never commit the key).

Then run the review gate.

## Stage 6: QA, hardening and release readiness
Load `references/qa.md`.

* Newman: full collection passes against a freshly migrated and seeded stack.
* Playwright E2E in `e2e/`: login per role; report a bug with AI Bug Writer; triage and move it across the board; execute a test run and create a bug from a failed step; release readiness summary; viewer cannot edit; user from org A cannot see org B data.
* Security pass: auth on every route, tenant scoping review of every query, file upload limits, rate limits, headers, dependency audit (`npm audit`, `pip-audit` if available). Record findings and fixes.
* Accessibility: axe checks on key screens via Playwright; keyboard navigation of forms and dialogs; fix serious issues.
* Responsive check at 390, 768 and 1440 widths.
* Design parity: final screenshots of the built app next to the locked ones in `docs/reviews/PARITY.md`.
* Performance sanity: bug list with seeded data loads under 1 second locally; add indexes where needed.
* Docs: `README.md` (what it is, quick start in 5 commands for Windows, seeded logins, how to switch AI to the real provider, architecture diagram, commands), `docs/USER_GUIDE.md` for QA users, `CHANGELOG.md`.
* Final report `docs/reviews/FINAL_QA_REPORT.md`: requirement traceability (each REQ with status Verified, Partial or Not done and the evidence), test results, known issues, backlog, and a go or no go recommendation.

Run the review gate. After my APPROVED on Stage 6, merge to `main`, tag `v1.0.0`, and print the final summary.

## Start now
Begin with Stage 0, then Stage 1. Do not ask me anything before the Stage 1 gate.
