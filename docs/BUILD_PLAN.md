# QA Pilot: Build Plan

AI powered bug tracking and QA management application.
Method: the Project Delivery v1.0 playbook (approval gated), adapted so Claude Code runs each stage on its own and stops only at the review gate.

## 1. Product summary

QA Pilot helps QA professionals anywhere report bugs faster, manage test cases and test runs, and let AI handle the tedious parts: turning rough notes into clean bug reports, suggesting severity and priority, catching duplicates, generating test cases from user stories, and summarising release readiness.

### Personas and roles
| Role | What they do |
|---|---|
| Org Admin | Creates the workspace, invites members, manages roles and settings |
| QA Lead | Owns projects, test plans, releases, triage and reports |
| QA Engineer | Reports bugs, writes test cases, executes test runs |
| Developer | Picks up assigned bugs, updates status, comments |
| Viewer (Stakeholder) | Read only dashboards and release reports |

Every record belongs to an organization. Tenant isolation is enforced on the server, in queries and in services.

### Core modules (MVP)
1. **Auth and workspaces**: register, login (JWT), organizations, memberships, invitations, role based access.
2. **Projects**: projects inside an org, components/modules, environments (dev, staging, prod).
3. **Bug tracking**: create, edit, assign, status workflow (New, Triaged, In Progress, Fixed, Ready for Retest, Verified, Closed, Reopened, Won't Fix), severity, priority, labels, environment, steps to reproduce, expected vs actual, attachments, comments, activity log, list view with filters and search, Kanban board.
4. **Test management**: test suites, test cases (steps, expected results, preconditions, tags), test runs, per case result (Pass, Fail, Blocked, Skipped), one click "create bug from failed step".
5. **Releases**: release versions, linked bugs and runs, readiness status.
6. **Dashboard and reports**: open bugs by severity, bug trend, run pass rate, top components, release readiness.
7. **AI layer** (Claude API, with an offline mock so everything runs without a key):
   * AI Bug Writer: rough notes or a pasted log become a structured report (title, steps, expected, actual, environment).
   * AI Triage: severity, priority and component suggestion with a short reason.
   * Duplicate Detector: similar existing bugs shown before you submit.
   * Test Case Generator: user story or acceptance criteria become test cases, including negative and edge cases.
   * Release Readiness Summary: plain English summary of risk for a release.
   * Every AI output is a suggestion the user accepts or edits. AI usage is logged per org.

### Out of scope for v1
Jira/GitHub sync, SSO, billing, mobile apps, real email delivery (invites are shown as copyable links), file storage in the cloud (local volume storage in v1).

## 2. Architecture

| Layer | Choice (playbook defaults) |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui, Zod, TanStack Query |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| AI | Anthropic Python SDK behind a provider interface; `mock` provider for tests and offline use |
| Infra | Docker Compose v2 (no `version:` key), healthchecks, non root prod images |
| Quality | pytest, Ruff, mypy, ESLint, TypeScript strict, Playwright E2E, Postman v2.1 + Newman, GitHub Actions CI |

Repo shape: one monorepo (faster for a 3 day build) with a clear API boundary.

```
qa-pilot/
  CLAUDE.md  AGENTS.md  docker-compose.yml  .env.example
  design/reference/approved.html   design/screenshots/*.png
  docs/requirements  docs/issues  docs/reviews  docs/DECISIONS.md  PROGRESS.md
  backend/app/modules/<domain>/{api,application,domain,infrastructure,schemas,tests}
  frontend/src/modules/<domain>/...
  postman/  e2e/  .github/workflows/ci.yml
```

Backend domains: `auth`, `orgs`, `projects`, `bugs`, `testing`, `releases`, `dashboard`, `ai`, `audit`.

## 3. Stages, gates and timeline

Each stage runs autonomously in Claude Code. At the end it commits to a stage branch, writes a review file in `docs/reviews/`, and stops. You review, reply `APPROVED` (or give feedback), and it moves on.

| Stage | Playbook gate | Output | Est. Claude Code run time |
|---|---|---|---|
| 1. Requirements and architecture | Gate 1 | Requirement register (REQ IDs), roles/permission matrix, screen inventory, domain model, API inventory, risks, decisions | 30 to 45 min |
| 2. HTML prototype and design lock | Gate 2 | One navigable multi screen HTML prototype, all roles, empty/loading/error/mobile states, Playwright screenshots, validated | 1.5 to 2.5 h |
| 3. Foundations | Gates 3, 4, 5 | Docker Compose v2, backend and frontend scaffolds, auth + RBAC + tenancy, migrations, seed CLI, Postman skeleton, CI, AGENTS.md, issue DAG in `docs/issues/` | 2.5 to 3.5 h |
| 4. Core features | Gate 6 | Projects, bugs, Kanban, comments, attachments, activity, test suites/cases/runs, releases, dashboard; UI matches prototype | 3.5 to 5 h |
| 5. AI layer | Gate 6 | Provider abstraction, the 5 AI features, guardrails, usage log, tests with mock provider | 2 to 3 h |
| 6. QA and release readiness | QA gates | Newman smoke, Playwright E2E, tenant/RBAC tests, accessibility and responsive checks, screenshot parity, README, final QA report | 1.5 to 2.5 h |

**Total machine time:** about 11 to 17 hours.

### Schedule
| Day | Work | Your review |
|---|---|---|
| Day 1 | Stages 1 and 2 | Approve requirements, then lock the design (most important review) |
| Day 2 | Stages 3 and 4 | Run `docker compose up`, click through core flows |
| Day 3 | Stages 5 and 6 | Try AI features, read the final QA report |

**My estimate: 3 days.** It can compress into 2 days if you review quickly and switch to continuous mode after the design lock. The biggest swing factor is how long you spend iterating on the prototype in Stage 2; that time is worth spending because everything after it is built to match it.

## 4. Seed data

Deterministic, idempotent, local/test only. Two organizations (to prove isolation), 10+ personas across all roles, 3 projects, about 60 bugs across every status and severity, 4 suites with about 40 test cases, 5 runs, 3 releases. Scenarios: `baseline`, `empty`, `sla-breach` (old untouched critical bugs), `release-blocked`, `multi-tenant`. Seed passwords come from `.env`, never committed.

## 5. Definition of done

* `docker compose up -d` starts db, backend and frontend healthy from a clean clone.
* Login with a seeded persona, report a bug with AI help, triage it, run a test run, fail a step into a bug, see the dashboard and a release summary.
* Backend tests, frontend type check and lint, Newman smoke and Playwright E2E all pass and the outputs are pasted in the final review.
* No secrets committed. Cross tenant access returns 404/403 in tests.
* Nothing is pushed or merged to a remote without you approving.

## 6. Risks
| Risk | Mitigation |
|---|---|
| Permission prompts still appear in the VS Code extension | Run Claude Code in the VS Code terminal with the skip permissions flag (see README) |
| Docker not running | Stage 1 checks prerequisites first and records a blocker with exact fix steps |
| No Anthropic API key | Mock provider keeps every feature and test working; real AI switches on when the key is added |
| Context window fills during long stages | `PROGRESS.md` is updated after every task so a fresh session resumes exactly where it stopped |
| Scope creep | Out of scope list above; extra ideas go to `docs/BACKLOG.md` |
