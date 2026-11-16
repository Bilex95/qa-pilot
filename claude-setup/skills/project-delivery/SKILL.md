---
name: project-delivery
description: Use when starting, planning, scaffolding, coordinating or auditing a software project with HTML-first prototypes, GitHub issues, Docker Compose v2, AI agent standards and API testing.
---
# Project Delivery v1.0

A portable, technology-aware, **approval-gated** delivery workflow. Use for frontend, backend, or full-stack work. Adapt stack to project constraints. Do not assert GitHub actions, file uploads or test outcomes without verification.

## Phase gates
1. **Understand requirements.** Capture business goal, stakeholders, personas, roles, domain entities, end-to-end workflows, permissions, integrations, data classification, constraints, risks, acceptance criteria and explicit unknowns. Produce requirement register, screen inventory, domain and API inventory. Obtain approval.
2. **Prototype HTML-first.** Produce a complete, interactive, multi-screen HTML/CSS/JS prototype, including all personas and key empty/loading/error states. Review with stakeholder. Obtain explicit design lock; do not redesign afterward without permission.
3. **Set up repos.** Confirm frontend/backend applicability, owner, privacy, stack, branches, deployment environments and access. Only create repositories with authorization; verify before writing. Define API boundary between repos.
4. **Create GitHub issues.** Plan foundations, domain work, dependencies and parallel batches. Each issue includes business context, files/modules, detailed contracts, examples, tests, edge cases, acceptance criteria and handoff. Obtain explicit approval before creating issues. Do not assign, comment, approve or merge without authorization.
5. **Engineering foundations.** Docker and Docker Compose **v2** first (no deprecated `version:` field); module-first scaffolding, `AGENTS.md`, relevant AI skills, token-efficient instructions, CI, migrations, API contracts, seed data and Postman/Newman where applicable. Respect approved stack.
6. **Execute and verify.** Implement in dependency order; review PRs, CI, tests, RBAC/ABAC, design parity and API integration. Never merge without explicit request.

## Defaults, not mandates
Frontend: Next.js App Router, React, TypeScript, shadcn/ui, Tailwind, Zod; TanStack Query for server state. Backend: Python/FastAPI, Pydantic v2, PostgreSQL, SQLAlchemy 2, Alembic, pytest, Ruff, mypy. Separate frontend/backend repos when applicable. Enforce server-side tenant, location and role access where relevant.

## Non-negotiable design handoff
Export screenshots from the locked HTML; validate image files. Commit HTML and screenshot binaries to the target repository/branch **before** adding image links to GitHub issues. Verify repository paths and GitHub issue rendering; never use assumed relative links or claim a local ZIP is a GitHub commit. If upload is unavailable, deliver a verified archive and wait for commit.

## Seed and API testing
Provide deterministic, idempotent **local/test-only** seed CLI with synthetic personas/customers/sites, expected count manifest and scenarios (`baseline`, `empty`, `sla-breach`, `stockout`, `repairs`, `multi-tenant`) when relevant. Production seed/reset forbidden. Provide OpenAPI, versioned Postman collections/environment, Newman CI smoke, happy/invalid/unauthorized/cross-tenant tests. Never commit passwords or tokens.

## Token efficiency
Keep root AGENTS.md concise, domain docs near modules, specialized skills loaded only when relevant, no repeated long context. Self-contained GitHub issues for agents with limited repo visibility. Never copy proprietary skill content.

## Phase references
Load only the relevant reference: `references/requirements.md`, `references/prototype.md`, `references/handoff.md`, `references/github.md`, `references/engineering.md`, `references/testing.md`, `references/qa.md`. Use templates for issues, PRs and AGENTS. At each milestone report completed vs pending, approved decisions, blockers, next gate and safe parallel work.
