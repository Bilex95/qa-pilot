# I-17 AI Test Case Generator

**Stage:** 5 | **Batch:** 5B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Generate positive, negative and edge cases from a story.

Requirements: REQ-047

## Scope and exclusions

* Generator prompt and schema (AI_SPEC 3.5)
* Generator panel on the case editor with pick list and bulk add

* Not in this issue: Cases are created only through the bulk endpoint after the user picks them

## Module ownership / dependencies

* `backend/app/modules/ai`
* `frontend/src/modules/testing`
* Depends on: [I-14](I-14-ai-provider-guardrails-usage-log-and-limits.md), [I-06](I-06-test-suites-and-test-cases.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-13**: [`test-case-editor-default-desktop.png`](../../design/screenshots/test-case-editor-default-desktop.png), [`test-case-editor-default-mobile.png`](../../design/screenshots/test-case-editor-default-mobile.png), [`test-case-editor-ai-desktop.png`](../../design/screenshots/test-case-editor-ai-desktop.png), [`test-case-editor-loading-desktop.png`](../../design/screenshots/test-case-editor-loading-desktop.png), [`test-case-editor-error-desktop.png`](../../design/screenshots/test-case-editor-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-144 | POST | `{O}/ai/test-cases` | `ai.test_cases` | `{project_id, story, count?: 3..15}` | `GeneratedTestCases` | 422 |
| API-100 | POST | `{O}/test-suites/{suite_id}/cases/bulk` | `case.manage` | `{cases:[case input], ai_usage_id?}` (max 50) | 201 `{created:[case]}` | 422 |

## Authorization, audit, data and edge cases

* ai.test_cases for QA roles
* At least one case of each type when count is 3 or more, else one retry
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Add 6 selected cases to Checkout
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
