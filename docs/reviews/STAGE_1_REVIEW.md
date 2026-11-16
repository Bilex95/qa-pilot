# Stage 1 Review: Requirements, clarification and architecture

**Branch:** `stage/1-requirements` | **Date:** 2026-11-16 | **Playbook gate:** 1 (understand requirements)

## 1. Summary

Stage 0 bootstrapped the repo (git, `.gitignore`, `.gitattributes`, tracking docs, environment record). Stage 1 produced the full requirement baseline for QA Pilot: 63 numbered requirements, 5 roles with a per module permission matrix, 22 screens, a domain model with the bug state machine, 97 API endpoints, a specification for each AI feature, non functional targets and risks, and 24 answered client questions backed by 32 recorded decisions. A script checks traceability and passes.

## 2. What was built

| File | Contents |
|---|---|
| `docs/requirements/REQUIREMENTS.md` | Business goal, non goals, REQ-001 to REQ-063 (source, priority, owner, acceptance criteria, verification), traceability table |
| `docs/requirements/PERSONAS_AND_ROLES.md` | 5 personas, 5 roles, permission matrix by module using backend action keys, navigation per role |
| `docs/requirements/SCREEN_INVENTORY.md` | SCR-01 to SCR-22 with route, roles, REQs, states, slug; 100 planned screenshot filenames |
| `docs/requirements/DOMAIN_MODEL.md` | 21 entities with fields, Mermaid ER diagram, enums, bug state machine (diagram and table of who may perform each transition), other workflows, audit events |
| `docs/requirements/API_INVENTORY.md` | Conventions, error envelope, standard errors, API-001 to API-150 (97 endpoints) with method, path, role rule, request, response, errors |
| `docs/requirements/AI_SPEC.md` | Provider architecture, 9 common guardrails, 6 features with input, prompt outline, Pydantic output schema, fallback, mock behaviour and token caps; usage logging and limits |
| `docs/requirements/NFR_AND_RISKS.md` | Security, tenancy, performance, accessibility, responsiveness, operations, data retention, 11 risks |
| `docs/requirements/CLARIFICATIONS.md` | 24 client questions with answers, each linked to a decision |
| `docs/DECISIONS.md` | D-001 to D-032 |
| `docs/ENVIRONMENT.md`, `docs/BLOCKERS.md`, `docs/BACKLOG.md`, `PROGRESS.md` | Stage 0 tracking docs |
| `scripts/check_traceability.py` | Automated Stage 1 checks (see evidence) |

## 3. How to review in under 15 minutes

1. **(3 min)** Read `REQUIREMENTS.md` sections 1 and 2 (goal and non goals), then skim the Must rows in section 5.
2. **(3 min)** Read the permission matrix in `PERSONAS_AND_ROLES.md` section 3. The key choices: Developers move only bugs assigned to them and cannot set severity (D-006, D-032); Viewers are fully read only, no comments (D-007).
3. **(3 min)** Read the bug state machine table in `DOMAIN_MODEL.md` section 4.
4. **(3 min)** Skim `CLARIFICATIONS.md`. Every row is a decision you can overturn; reply with the C number.
5. **(1 min)** Run the checker yourself:
   ```powershell
   python scripts/check_traceability.py
   ```
6. Optional: open `DOMAIN_MODEL.md` in VS Code markdown preview (or GitHub) to see the Mermaid diagrams.

## 4. Evidence

Traceability check (real output):

```
> python scripts/check_traceability.py
Requirements: 63 (Must 52, Should 9, Could 2)
Screens: 22  Endpoints: 97  Artifacts: 5  Decisions: 32
Planned screenshots: 100 (100 unique)
PASS: every screen maps to a REQ, every Must REQ maps to a screen, endpoint or artifact, no orphan ids, prose rule holds
exit=0
```

The checker was proved able to fail. Run against a scratch copy with three planted faults (a Must REQ with no mapping, a renamed endpoint, a hyphen used as punctuation):

```
FAIL: 7 problem(s)
  - REQ-012 references unknown endpoint API-150
  - REQ-058 is Must but maps to nothing
  - SCR-22 has no specific requirement
  - SCR-22 lists REQ-058 in the inventory but the trace table does not map REQ-058 to SCR-22
  - API-151 is not referenced by any requirement
  - orphan id API-150 mentioned but not defined
  - CLARIFICATIONS.md:31 uses a hyphen as punctuation
exit=1
```

What the checker verifies: the register and the trace table list the same REQs with the same priorities; every Must REQ maps to a screen, endpoint or artifact; every screen has at least one specific REQ and the screen inventory agrees with the trace table in both directions; every endpoint is referenced; every REQ, SCR, API, ART and D id mentioned in the requirement docs is defined; no em dashes or hyphens used as punctuation in the requirement docs and decisions.

Prerequisites (Stage 0, from `docs/ENVIRONMENT.md`):

```
git version 2.55.0.windows.2
node v24.14.0, npm 11.9.0, Python 3.12.10
docker (inside WSL Ubuntu): Docker version 29.4.0, Docker Compose version v5.1.1
docker info: 29.4.0 Ubuntu 24.04.1 LTS   (daemon running)
```

## 5. Decisions made

All 32 are in `docs/DECISIONS.md`. The ones most worth your attention:

| Decision | Choice |
|---|---|
| D-001 | Docker runs through WSL Ubuntu (`wsl -d Ubuntu -- docker compose ...`), not Docker Desktop |
| D-002, D-003 | Org id in the API path; non members and cross tenant ids get 404, role failures get 403 |
| D-005, D-006 | Fixed 9 status workflow; developers move only bugs assigned to them |
| D-007, D-032 | Viewers cannot comment; developers can report bugs but not set severity or priority |
| D-012 | AI limits: 20 per user per minute, 500 per org per day, token caps per feature |
| D-013 | Duplicate detection uses in app TF IDF similarity, no vector DB |
| D-014 | Release readiness rules (Blocked, At risk, Ready) |
| D-015 | One target release per bug and per run |
| D-018 | AI usage log keeps metadata only, never prompt text |
| D-019 | SLA thresholds are an assumption (Critical 2 days, High 5, Medium 14, Low 30) |

## 6. Known gaps and risks

* Mermaid diagrams were written by hand and not rendered by a tool in this stage (rendering needs a headless browser download). They will be checked visually when the prototype tooling is installed in Stage 2.
* The SLA thresholds (D-019) and readiness thresholds (D-014) are assumptions, not client confirmed values.
* Scope is large for 3 days (RISK-06). If time runs short, cut the Could items first (REQ-040 CSV export, REQ-044 explain log), then Should items.
* Docker inside WSL may make hot reload from `C:\` slow (RISK-01); Stage 3 will use polling watchers.
* The in memory per user AI rate limit only works for a single backend process; documented in `AI_SPEC.md` section 4.
* The GitHub MCP connection failed in this session. It is not needed (no GitHub issues are created, per the master prompt).

## 7. Next stage

Stage 2: HTML first prototype and design lock. One self contained `design/reference/approved.html` with hash routing covering all 22 screens, a role switcher for the 5 roles, a dev toolbar to show empty, loading and error states, design tokens documented in `design/TOKENS.md`, 100 Playwright screenshots (desktop 1440x900, mobile 390x844) validated by `validate_design_assets.py`, and a contact sheet in `design/screenshots/INDEX.md`.

## 8. Changes after feedback

Feedback at the gate: "Approved with these notes". Applied on `stage/1-requirements` before the merge (see D-033):

| Note | Change |
|---|---|
| Developers can also self assign unassigned bugs | D-006 updated; `bug.assign` for Developer is now "Self (only when unassigned)"; DOMAIN_MODEL transition rules and REQ-020 updated; C-05 updated |
| Viewers can comment but can't change anything else | D-007 reversed; `comment.create` allowed for Viewer, own comment edit and delete allowed; REQ-023 and C-06 updated. Sections 3 and 5 above still describe the original rule and are kept as the record of what was reviewed |
| Keep D-014 as is | No change |
| SLA thresholds, Critical in hours, mark confirmed | D-019 now measures Critical in hours. **Not marked confirmed:** the note's numbers were still placeholders ("X"). Working values meanwhile: Critical 48 hours, High 5 days, Medium 14 days, Low 30 days, kept in one constant. RISK-11 and C-09 updated |

Rerun of the checker after the changes:

```
> python scripts/check_traceability.py
Requirements: 63 (Must 52, Should 9, Could 2)
Screens: 22  Endpoints: 97  Artifacts: 5  Decisions: 33
Planned screenshots: 100 (100 unique)
PASS: every screen maps to a REQ, every Must REQ maps to a screen, endpoint or artifact, no orphan ids, prose rule holds
```
