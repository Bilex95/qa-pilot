# CLAUDE.md: QA Pilot

AI powered bug tracking and QA management app. Plan: `docs/BUILD_PLAN.md`. Delivery method: `.claude/skills/project-delivery/SKILL.md` (load only the reference file for the current stage).

## Operating mode (autonomous)
* Work without asking questions. When something is unclear, choose the most reasonable option, record it in `docs/DECISIONS.md`, and continue.
* Stop only at the end of a stage (review gate) or for a decision that cannot be undone and is not covered here.
* Keep `PROGRESS.md` current after every completed task: stage, done, next, blockers. On any new session, read `PROGRESS.md` first and resume.
* If a command fails 3 times with different fixes, log it in `docs/BLOCKERS.md` with the exact error and fix steps for the human, pick a fallback, and move on.
* Never start a blocking foreground process. Use `docker compose up -d`, background dev servers, and timeouts on long commands. Stop what you started.

## Autonomy rules (product owner, 2026-11-21; they replace the stop at each review)

### Part 1: no permission prompts
One plain command per call, Read/Grep/Glob to read, Edit/Write to write, gate output to `.gate/<name>.txt`. Details, gate runs, fixtures, safe push and CI checks: skill `qa-pilot-gates`.

### Part 2: one review at the end
* Work through every remaining Stage 4 issue, then Stage 5, then Stage 6, in DAG order, without stopping for review between issues. For each issue: build, test, run all checks, capture parity screenshots, write its review section, update PROGRESS, BACKLOG and the DAG, commit in logical pieces and push the stage branch with `bash scripts/safe-push.sh <branch>`. Then start the next issue.
* Decide reasonable things alone and record each one in `docs/DECISIONS.md`.
* Stop and ask only when: an action would permanently delete or overwrite data or work that cannot be recovered; a security problem needs a product decision (fix and log the ones with an obvious fix); a change would alter the locked prototype in a way not already approved; or truly blocked (a check still fails after two honest fix attempts, or the machine runs out of memory twice).
* When everything is finished, stop once with one final review: what was built per issue, every decision, all check results (pytest, Newman, lint, typecheck, build, layout, flows, Playwright), the parity screenshot folders, known gaps and anything to decide.

### Part 3: lighter layout runs
Superseded by the CI decision (2026-11-25): no full browser suites locally, only changed screens at 390 and 1440; CI is the judge. Procedure: skill `qa-pilot-ui-checks`.

## Token rules (product owner, 2026-11-25)
* One subagent per remaining issue: hand the whole issue (build, tests, checks, docs, commit, push) to `.claude/agents/issue-builder.md` (model: sonnet) with a short brief: issue file path, relevant decisions, what done means. It returns at most 15 lines (what changed, check results, commits, decisions needed). The main session stays on Opus only for planning, reviewing summaries and hard problems.
* Long procedures live in project skills (`qa-pilot-gates`, `qa-pilot-ui-checks`), not here. Project Delivery covers only generic phase gates, so it is not duplicated.
* Reading: Grep first, then Read only the line range needed. Never read whole large files, logs or generated files. For check output read only the summary and failure lines.
* CI: never poll or wait. Push, continue, check each run once later with `gh run view <id> --log-failed`.
* `PROGRESS.md` "Resume here" stays under 30 lines; older entries go to `docs/progress-archive.md`.
* When the main conversation gets long, tell the product owner so they can run /clear, after updating "Resume here".

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
* Git: `stage/<n>-<name>` branches, small conventional commits. `origin` is the PUBLIC repo `Bilex95/qa-pilot` (public since 2026-11-25, D-073) and must stay free of secrets and personal data: no real credentials, no personal email or name beyond the GitHub noreply identity, no local machine paths. Push ONLY with `bash scripts/safe-push.sh <branch>`; never force push or push to `main`. Stage end, PR and tag procedure: skill `qa-pilot-gates` (D-034).
* Prose in docs and UI copy: no em dashes and no hyphens used as punctuation.
* Responsive standing rule (D-044), parity capture and the generated `globals.css`: skill `qa-pilot-ui-checks`. Every new screen and popup goes into `e2e/scripts/check-app-layout.mjs`.

## Commands (keep this list verified and updated)
* `docker compose up -d --wait` / `docker compose down` (build machine: `powershell -File scripts/dc.ps1 <args>`, Docker runs in WSL, D-001). `up` through `dc.ps1` or `sh scripts/dc.sh` refuses a host port owned by anything but this project (D-048)
* WSL stops Docker a few seconds after the last `wsl` session ends (D-048): run Windows side long tasks as `powershell -File scripts/with-wsl.ps1 [-Up] <command>` (`-Up` brings the stack up first; one held session, closed in `finally`; no free running keepalives)
* Backend tests: `docker compose exec backend pytest -q`
* Lint/types: `docker compose exec backend ruff check . && docker compose exec backend mypy app`
* Backend ruff, mypy and pytest in one go from Windows: `powershell -File scripts/with-wsl.ps1 -Up powershell -File scripts/py-checks.ps1`; contract regeneration the same way with `scripts/api-types.ps1`
* Frontend: `cd frontend && npm run lint && npm run typecheck && npm run build`
* Seed: `docker compose exec backend python -m app.seed --scenario baseline`
* Newman (needs the baseline seed; runs inside Docker as one WSL session): `powershell -File scripts/newman.ps1` (or `sh scripts/newman.sh` in WSL). Plain equivalent where Node is on the PATH: `npx newman@6.2.3 run postman/qa-pilot.postman_collection.json -e postman/local.postman_environment.json --working-dir postman --env-var password=<SEED_USER_PASSWORD>` (`--working-dir postman` lets the upload requests find `postman/fixtures/`)
* Postman collection is generated: edit `postman/build_collection.py`, then `python postman/build_collection.py`
* API contract after backend schema changes: `sh scripts/api-types.sh` (inside WSL on the build machine)
* Browser login smoke (stack up, baseline seeded): `cd e2e && node scripts/smoke-login.mjs`
* Design checks: `powershell -File scripts/validate-design.ps1`; issue plan: `python scripts/build_issues.py`
* E2E: `cd e2e && npx playwright test` (Playwright test suite arrives in Stage 6, issue I-20)
