# Progress

**Current stage:** 3 Foundations (repo, Docker, scaffolding, auth, data, issue plan)
**Branch:** stage/3-foundations
**Remote:** origin = github.com/Bilex95/qa-pilot (private). Push only with `bash scripts/safe-push.sh` (branch or `--tag`). Gate flow per D-034, D-036.

## Done
* Stages 0 to 2 approved. Stage 2 merged as PR #1 (merge commit 73d7fcc), tagged `stage-2-approved`. Design locked.
* D-019 SLA confirmed (D-036).

## Stage 3 tasks
- [x] T1 Repo layout, `docs/API_BOUNDARY.md`, `AGENTS.md`
- [x] T2 Docker Compose (db, backend, frontend), Dockerfiles dev and prod, `.env.example`, `.env`, `scripts/*.ps1`
- [x] T3 Backend core: app factory, settings, DB, Alembic, error envelope, pagination, request id, logging, CORS, headers, health
- [x] T4 Auth, orgs, memberships, invitations, RBAC policies, audit log, tests
- [x] T5 Seed CLI and `docs/SEED_MANIFEST.md`
- [ ] T6 Frontend: Next.js, tokens, shadcn/ui, TanStack Query, typed API client, auth flow, app shell
- [ ] T7 Postman collection and environment
- [ ] T8 CI workflow
- [ ] T9 Issue plan `docs/issues/` and `DAG.md`
- [ ] T10 Gate checks, review file, push, PR

## Next
* T6 frontend.

## Blockers
* None.
