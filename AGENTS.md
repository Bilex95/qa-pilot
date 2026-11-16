# AGENTS.md: QA Pilot

Short entry point for AI agents and new developers. Details live next to the code and in `docs/`.

## Product and source of truth
* Requirements: `docs/requirements/` (REQ, SCR and API ids; traceability in `REQUIREMENTS.md` section 7).
* Locked design: `design/reference/approved.html`, tokens in `design/TOKENS.md`, screenshots in `design/screenshots/` (contact sheet `INDEX.md`). Do not redesign without written permission.
* Decisions: `docs/DECISIONS.md` (D-###). Progress: `PROGRESS.md`. Work plan: `docs/issues/DAG.md`.

## Architecture
* Monorepo, boundary in `docs/API_BOUNDARY.md`.
* Backend `backend/app/modules/<domain>/{api,application,domain,infrastructure,schemas,tests}`; shared code in `backend/app/core`. Domains: auth, orgs, projects, bugs, testing, releases, dashboard, ai, audit.
* Frontend `frontend/src/modules/<domain>`; shared UI in `frontend/src/components`; API types generated from OpenAPI.
* Roles and permissions: `docs/requirements/PERSONAS_AND_ROLES.md`, implemented in `backend/app/core/permissions.py`.

## Verified commands
Docker runs through WSL on the build machine (D-001); `scripts/dc.ps1` wraps it. Plain equivalents:
* `docker compose up -d` / `docker compose down`
* Backend tests: `docker compose exec backend pytest -q`
* Lint and types: `docker compose exec backend ruff check .` and `docker compose exec backend mypy app`
* Frontend: `cd frontend && npm run lint && npm run typecheck && npm run build`
* Seed: `docker compose exec backend python -m app.seed --scenario baseline`
* Newman: `npx newman run postman/qa-pilot.postman_collection.json -e postman/local.postman_environment.json`
* Design checks: `powershell -File scripts/validate-design.ps1`
* Push (only way): `bash scripts/safe-push.sh <branch>` or `--tag <tag>`

## Rules
* Docker Compose v2, healthchecks on every service. No secrets in git.
* No cross module repository access. Every tenant query filters by `org_id`; every endpoint gets happy, invalid, unauthorized, forbidden and cross tenant tests, a Postman request and seed data if needed. Keep OpenAPI current.
* AI output is a suggestion the user accepts; user content is data, never instructions.
* Preserve the locked UI. Prose and UI copy: no em dashes, no hyphens as punctuation.
* Small conventional commits on `stage/<n>-<name>`. Never merge without approval.
