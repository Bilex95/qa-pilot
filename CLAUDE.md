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
* Read and search only with the Read, Grep and Glob tools, with absolute paths under `C:/Users/HP/qa-pilot`. Never use cat, sed, head, tail, cut, wc, ls or grep in Bash to read files.
* Write code only with the Edit and Write tools. Never write files with `cat >>`, heredocs or echo redirects.
* Bash and PowerShell: one plain command per call. No cd (use absolute paths or `git -C C:/Users/HP/qa-pilot`), no pipes, no parentheses, no `;` or `&&` chains, no loops, no `$(...)` or variables in paths.
* Gate output goes to `C:/Users/HP/qa-pilot/.gate/<name>.txt` by redirect. Take the exit code from the tool result and read the file with the Read tool.
* In the PowerShell tool call scripts as `& C:\Users\HP\qa-pilot\scripts\<name>.ps1` (never a nested `powershell` process). `with-wsl.ps1` runs its target directly, so `& ...\with-wsl.ps1 -Up & ...\py-checks.ps1` style calls work.
* Helper scripts live in `C:/Users/HP/qa-pilot/scripts/` only (never the scratchpad or `.gate`).
* `.claude/settings.local.json` holds the allow, ask and deny lists for this machine. It is not committed (it is in `.gitignore`).

### Part 2: one review at the end
* Work through every remaining Stage 4 issue, then Stage 5, then Stage 6, in DAG order, without stopping for review between issues. For each issue: build, test, run all checks, capture parity screenshots, write its review section, update PROGRESS, BACKLOG and the DAG, commit in logical pieces and push the stage branch with `bash scripts/safe-push.sh <branch>`. Then start the next issue.
* Decide reasonable things alone and record each one in `docs/DECISIONS.md`.
* Stop and ask only when: an action would permanently delete or overwrite data or work that cannot be recovered; a security problem needs a product decision (fix and log the ones with an obvious fix); a change would alter the locked prototype in a way not already approved; or truly blocked (a check still fails after two honest fix attempts, or the machine runs out of memory twice).
* When everything is finished, stop once with one final review: what was built per issue, every decision, all check results (pytest, Newman, lint, typecheck, build, layout, flows, Playwright), the parity screenshot folders, known gaps and anything to decide.

### Part 3: lighter layout runs
* Run the full layout check once per issue, at the end of the issue. While working, check only the changed screens at 390 and 1440.
* Before each full run: `wsl --shutdown`, bring the containers up, and run nothing else at the same time (`scripts/layout-check.ps1` does this).
* If a run is killed for memory, retry once with fewer parallel pages. If it fails again, log it in PROGRESS, continue with the next issue and include it in the final review.
* Every script that creates fixtures cleans them up in `finally`, including revoking any reset links.

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
* Backend ruff, mypy and pytest in one go from Windows: `powershell -File scripts/with-wsl.ps1 -Up powershell -File scripts/py-checks.ps1`; contract regeneration the same way with `scripts/api-types.ps1`
* Frontend: `cd frontend && npm run lint && npm run typecheck && npm run build`
* Seed: `docker compose exec backend python -m app.seed --scenario baseline`
* Newman (needs the baseline seed; runs inside Docker as one WSL session): `powershell -File scripts/newman.ps1` (or `sh scripts/newman.sh` in WSL). Plain equivalent where Node is on the PATH: `npx newman@6.2.3 run postman/qa-pilot.postman_collection.json -e postman/local.postman_environment.json --env-var password=<SEED_USER_PASSWORD>`
* Postman collection is generated: edit `postman/build_collection.py`, then `python postman/build_collection.py`
* API contract after backend schema changes: `sh scripts/api-types.sh` (inside WSL on the build machine)
* Browser login smoke (stack up, baseline seeded): `cd e2e && node scripts/smoke-login.mjs`
* Design checks: `powershell -File scripts/validate-design.ps1`; issue plan: `python scripts/build_issues.py`
* E2E: `cd e2e && npx playwright test` (Playwright test suite arrives in Stage 6, issue I-20)
