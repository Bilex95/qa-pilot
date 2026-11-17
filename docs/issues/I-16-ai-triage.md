# I-16 AI Triage

**Stage:** 5 | **Batch:** 5B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Severity, priority and component suggestion with a reason on bug detail.

Requirements: REQ-045

## Scope and exclusions

* Triage prompt and schema (AI_SPEC 3.3)
* Triage panel on bug detail

* Not in this issue: Auto apply is never allowed

## Module ownership / dependencies

* `backend/app/modules/ai`
* `frontend/src/modules/bugs`
* Depends on: [I-14](I-14-ai-provider-guardrails-usage-log-and-limits.md), [I-05](I-05-bug-detail-comments-attachments-and-activity.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-10**: [`bug-detail-default-desktop.png`](../../design/screenshots/bug-detail-default-desktop.png), [`bug-detail-default-mobile.png`](../../design/screenshots/bug-detail-default-mobile.png), [`bug-detail-ai-desktop.png`](../../design/screenshots/bug-detail-ai-desktop.png), [`bug-detail-loading-desktop.png`](../../design/screenshots/bug-detail-loading-desktop.png), [`bug-detail-error-desktop.png`](../../design/screenshots/bug-detail-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-142 | POST | `{O}/ai/triage` | `ai.triage` | `{bug_id}` or `{project_id, title, description, actual_result}` | `TriageSuggestion` | 404 |

## Authorization, audit, data and edge cases

* ai.triage for Org Admin, QA Lead, QA Engineer
* Apply uses the normal PATCH and its permission checks
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Accept changes the three fields and writes activity entries
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
