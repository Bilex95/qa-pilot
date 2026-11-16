# I-07 Test runs, results and bug from a failed step

**Stage:** 4 | **Batch:** 4C (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Execute runs against an environment and turn a failed step into a prefilled bug in one click.

Requirements: REQ-032, REQ-033, REQ-034

## Scope and exclusions

* TestRun and TestRunResult models with case snapshots
* Run list, run execution screen
* Bug draft endpoint and prefilled new bug form

* Not in this issue: Release linking UI (I-08)

## Module ownership / dependencies

* `backend/app/modules/testing`
* `frontend/src/modules/testing`
* Depends on: [I-06](I-06-test-suites-and-test-cases.md), [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md)
* Migration: `0007_runs`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-14**: [`test-runs-default-desktop.png`](../../design/screenshots/test-runs-default-desktop.png), [`test-runs-default-mobile.png`](../../design/screenshots/test-runs-default-mobile.png), [`test-runs-empty-desktop.png`](../../design/screenshots/test-runs-empty-desktop.png), [`test-runs-loading-desktop.png`](../../design/screenshots/test-runs-loading-desktop.png), [`test-runs-error-desktop.png`](../../design/screenshots/test-runs-error-desktop.png)
* **SCR-15**: [`test-run-default-desktop.png`](../../design/screenshots/test-run-default-desktop.png), [`test-run-default-mobile.png`](../../design/screenshots/test-run-default-mobile.png), [`test-run-failed-desktop.png`](../../design/screenshots/test-run-failed-desktop.png), [`test-run-loading-desktop.png`](../../design/screenshots/test-run-loading-desktop.png), [`test-run-error-desktop.png`](../../design/screenshots/test-run-error-desktop.png)
* **SCR-11**: [`bug-new-default-desktop.png`](../../design/screenshots/bug-new-default-desktop.png), [`bug-new-default-mobile.png`](../../design/screenshots/bug-new-default-mobile.png), [`bug-new-ai-desktop.png`](../../design/screenshots/bug-new-ai-desktop.png), [`bug-new-error-desktop.png`](../../design/screenshots/bug-new-error-desktop.png), [`bug-new-loading-desktop.png`](../../design/screenshots/bug-new-loading-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-101 | GET | `{O}/test-runs` | `test.read` | `?project_id&status&release_id&page` | page of `{id, name, status, environment, release, counts:{pass,fail,blocked,skipped,untested}, pass_rate, created_at}` | none |
| API-102 | POST | `{O}/test-runs` | `run.create` | `{project_id, name, environment_id?, release_id?, suite_ids?, case_ids?}` | 201 run with results | 422 (no cases) |
| API-103 | GET | `{O}/test-runs/{run_id}` | `test.read` | none | run with results (snapshot steps, result, linked bug keys) | 404 |
| API-104 | PATCH | `{O}/test-runs/{run_id}` | `run.complete` | `{name?, status?: "completed", release_id?}` | run | 409 `run_completed` |
| API-105 | PATCH | `{O}/test-runs/{run_id}/results/{result_id}` | `run.execute` | `{result, failed_step_index?, actual_result?, note?}` | result | 409 `run_completed`, 422 |
| API-106 | GET | `{O}/test-runs/{run_id}/results/{result_id}/bug-draft` | `run.bug_from_failure` | none | prefilled bug input with `source_run_result_id` | 409 `result_not_failed` |

## Authorization, audit, data and edge cases

* run.create, run.execute, run.complete, run.bug_from_failure for QA roles
* Audit: run.created, run.completed
* Editing a case after a run starts does not change the run (snapshot)
* Completed runs are read only (409 run_completed)
* Bug draft only for failed results (409 result_not_failed); saved bug links back to the result
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Fail TC-103 at step 3, create bug, bug shows run link and environment
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
