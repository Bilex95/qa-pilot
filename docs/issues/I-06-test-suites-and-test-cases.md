# I-06 Test suites and test cases

**Stage:** 4 | **Batch:** 4B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

QA organises cases into suites with ordered steps and expected results.

Requirements: REQ-030, REQ-031

## Scope and exclusions

* TestSuite and TestCase models (steps as JSON list, D-031) and migration
* Suites screen and case editor without AI
* Bulk create endpoint used later by the generator (I-17)

* Not in this issue: AI generation (I-17)

## Module ownership / dependencies

* `backend/app/modules/testing`
* `frontend/src/modules/testing`
* Depends on: [I-01](I-01-projects-components-and-environments.md)
* Migration: `0006_testing`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-12**: [`test-suites-default-desktop.png`](../../design/screenshots/test-suites-default-desktop.png), [`test-suites-default-mobile.png`](../../design/screenshots/test-suites-default-mobile.png), [`test-suites-empty-desktop.png`](../../design/screenshots/test-suites-empty-desktop.png), [`test-suites-loading-desktop.png`](../../design/screenshots/test-suites-loading-desktop.png), [`test-suites-error-desktop.png`](../../design/screenshots/test-suites-error-desktop.png)
* **SCR-13**: [`test-case-editor-default-desktop.png`](../../design/screenshots/test-case-editor-default-desktop.png), [`test-case-editor-default-mobile.png`](../../design/screenshots/test-case-editor-default-mobile.png), [`test-case-editor-ai-desktop.png`](../../design/screenshots/test-case-editor-ai-desktop.png), [`test-case-editor-loading-desktop.png`](../../design/screenshots/test-case-editor-loading-desktop.png), [`test-case-editor-error-desktop.png`](../../design/screenshots/test-case-editor-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-090 | GET | `{O}/test-suites` | `test.read` | `?project_id&page` | page of `{id, name, project_id, component, case_count, last_run_pass_rate}` | none |
| API-091 | POST | `{O}/test-suites` | `suite.manage` | `{project_id, name, description?, component_id?}` | 201 suite | 422 |
| API-092 | GET | `{O}/test-suites/{suite_id}` | `test.read` | none | suite | 404 |
| API-093 | PATCH | `{O}/test-suites/{suite_id}` | `suite.manage` | `{name?, description?, component_id?}` | suite | 422 |
| API-094 | DELETE | `{O}/test-suites/{suite_id}` | `suite.manage` | none | 204 (soft) | none |
| API-095 | GET | `{O}/test-suites/{suite_id}/cases` | `test.read` | `?tag&case_type&page` | page of `{id, title, priority, case_type, tags, step_count, ai_generated}` | none |
| API-096 | POST | `{O}/test-suites/{suite_id}/cases` | `case.manage` | `{title, preconditions?, steps:[{action, expected}], tags?, priority?, case_type?}` | 201 case | 422 |
| API-097 | GET | `{O}/test-cases/{case_id}` | `test.read` | none | full case | 404 |
| API-098 | PATCH | `{O}/test-cases/{case_id}` | `case.manage` | any case field | case | 422 |
| API-099 | DELETE | `{O}/test-cases/{case_id}` | `case.manage` | none | 204 (soft) | none |
| API-100 | POST | `{O}/test-suites/{suite_id}/cases/bulk` | `case.manage` | `{cases:[case input], ai_usage_id?}` (max 50) | 201 `{created:[case]}` | 422 |

## Authorization, audit, data and edge cases

* test.read for all; suite.manage and case.manage for Org Admin, QA Lead, QA Engineer
* Audit: suite.deleted, case.deleted
* At least one step; at most 50 steps; step reorder keeps ids
* Bulk create at most 50 cases, all or nothing
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] QA Engineer writes a case with 4 steps; Developer sees it read only
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
