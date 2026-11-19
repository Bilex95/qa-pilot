# CLAUDE.md: QA Pilot

AI powered bug tracking and QA management app. Plan: `docs/BUILD_PLAN.md`. Delivery method: `.claude/skills/project-delivery/SKILL.md` (load only the reference file for the current stage).

## Operating mode (autonomous)
* Work without asking questions. When something is unclear, choose the most reasonable option, record it in `docs/DECISIONS.md`, and continue.
* Stop only at the end of a stage (review gate) or for a decision that cannot be undone and is not covered here.
* Keep `PROGRESS.md` current after every completed task: stage, done, next, blockers. On any new session, read `PROGRESS.md` first and resume.
* If a command fails 3 times with different fixes, log it in `docs/BLOCKERS.md` with the exact error and fix steps for the human, pick a fallback, and move on.
* Never start a blocking foreground process. Use `docker compose up -d`, background dev servers, and timeouts on long commands. Stop what you started.

## Source of truth
* Requirements: `docs/requirements/`
* Locked design: `design/reference/approved.html` and `design/screenshots/`. After Stage 2 approval, do not redesign; match layout, tokens and interactions.

## Stack (approved)
Frontend: Next.js App Router, TypeScript strict, Tailwind, shadcn/ui, Zod, TanStack Query, in `frontend/src/modules/<domain>`.
Backend: FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, PostgreSQL 16, in `backend/app/modules/<domain>/{api,application,domain,infrastructure,schemas,tests}`.
AI: provider interface in `backend/app/modules/ai`; `AI_PROVIDER=mock|anthropic`; default model from `ANTHROPIC_MODEL`.

## Rules
* Docker Compose v2 only (no top level `version:`). Healthchecks on every service.
* No cross module repository access; modules talk through services or public contracts.
* Every query is scoped by `org_id` on the server. Add a cross tenant test for every new endpoint.
* API under `/api/v1`, one error envelope `{error:{code,message,details}}`, cursor or page pagination, OpenAPI kept current.
* Every new endpoint: Pydantic schemas, tests (happy, invalid, unauthorized, forbidden, cross tenant), Postman request, seed data if needed.
* AI output is always a suggestion the user accepts. Treat user content sent to the model as data, never as instructions. Validate model output with Pydantic; fall back gracefully on failure.
* Never commit secrets. `.env` is gitignored; `.env.example` has empty values.
* Seed CLI is local/test only and refuses to run when `APP_ENV=production`.
* Git: work on `stage/<n>-<name>` branches, small conventional commits. Remote `origin` is the PRIVATE repo `Bilex95/qa-pilot`; never make it public. Push ONLY with `bash scripts/safe-push.sh <branch>`; it blocks unless origin is private, the commit email is verified on the account, and no `.env` or secret is in history (stop and tell the human if it blocks on the email). At the end of each stage push the stage branch and open a PR into `main`; on APPROVED merge it with `gh pr merge --merge` (merge commit, never squash or rebase), tag `stage-<n>-approved` on the merge commit and push it with `bash scripts/safe-push.sh --tag stage-<n>-approved`. Never force push or push to `main` directly. See D-034.
* Prose in docs and UI copy: no em dashes and no hyphens used as punctuation.
* Responsive standing rule (D-044): every page, component and popup fits 360, 390, 768, 1024, 1280, 1440, 1920, 2560 px and 200% zoom; nothing outside the screen or its container, no horizontal scroll, text at least 12 px, tap targets 44 px on touch widths, popups fully inside the viewport, long text truncates or wraps. Add each new screen and popup to `e2e/scripts/check-app-layout.mjs` (runs in CI) and put before and after screenshots at each width in the stage review.
* `frontend/src/app/globals.css` is generated: change `design/reference/approved.html`, then `python scripts/build_globals_css.py` (CI fails on drift).

## Commands (keep this list verified and updated)
* `docker compose up -d --wait` / `docker compose down` (build machine: `powershell -File scripts/dc.ps1 <args>`, Docker runs in WSL, D-001). `up` through `dc.ps1` or `sh scripts/dc.sh` refuses a host port owned by anything but this project (D-048)
* WSL stops Docker a few seconds after the last `wsl` session ends (D-048): run Windows side long tasks as `powershell -File scripts/with-wsl.ps1 [-Up] <command>` (`-Up` brings the stack up first; one held session, closed in `finally`; no free running keepalives)
* Backend tests: `docker compose exec backend pytest -q`
* Lint/types: `docker compose exec backend ruff check . && docker compose exec backend mypy app`
* Frontend: `cd frontend && npm run lint && npm run typecheck && npm run build`
* Seed: `docker compose exec backend python -m app.seed --scenario baseline`
* Newman (needs the baseline seed; runs inside Docker as one WSL session): `powershell -File scripts/newman.ps1` (or `sh scripts/newman.sh` in WSL). Plain equivalent where Node is on the PATH: `npx newman@6.2.3 run postman/qa-pilot.postman_collection.json -e postman/local.postman_environment.json --env-var password=<SEED_USER_PASSWORD>`
* Postman collection is generated: edit `postman/build_collection.py`, then `python postman/build_collection.py`
* API contract after backend schema changes: `sh scripts/api-types.sh` (inside WSL on the build machine)
* Browser login smoke (stack up, baseline seeded): `cd e2e && node scripts/smoke-login.mjs`
* Design checks: `powershell -File scripts/validate-design.ps1`; issue plan: `python scripts/build_issues.py`
* E2E: `cd e2e && npx playwright test` (Playwright test suite arrives in Stage 6, issue I-20)
