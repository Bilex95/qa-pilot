# I-08 Releases and readiness

**Stage:** 4 | **Batch:** 4D (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Release versions with linked bugs and runs and a server computed readiness status with reasons.

Requirements: REQ-035, REQ-036, REQ-037

## Scope and exclusions

* Release model and migration
* Readiness rules exactly as D-014 in `releases/domain`
* Releases list and release detail without AI

* Not in this issue: AI summary (I-18)

## Module ownership / dependencies

* `backend/app/modules/releases`
* `frontend/src/modules/releases`
* Depends on: [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md), [I-07](I-07-test-runs-results-and-bug-from-a-failed-step.md)
* Migration: `0008_releases`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-16**: [`releases-default-desktop.png`](../../design/screenshots/releases-default-desktop.png), [`releases-default-mobile.png`](../../design/screenshots/releases-default-mobile.png), [`releases-empty-desktop.png`](../../design/screenshots/releases-empty-desktop.png), [`releases-loading-desktop.png`](../../design/screenshots/releases-loading-desktop.png), [`releases-error-desktop.png`](../../design/screenshots/releases-error-desktop.png)
* **SCR-17**: [`release-detail-default-desktop.png`](../../design/screenshots/release-detail-default-desktop.png), [`release-detail-default-mobile.png`](../../design/screenshots/release-detail-default-mobile.png), [`release-detail-ai-desktop.png`](../../design/screenshots/release-detail-ai-desktop.png), [`release-detail-loading-desktop.png`](../../design/screenshots/release-detail-loading-desktop.png), [`release-detail-error-desktop.png`](../../design/screenshots/release-detail-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-110 | GET | `{O}/releases` | `release.read` | `?project_id&status&page` | page of `{id, name, project_id, status, target_date, readiness, open_bug_count, pass_rate}` | none |
| API-111 | POST | `{O}/releases` | `release.manage` | `{project_id, name, target_date?, description?}` | 201 release | 409 `name_taken` |
| API-112 | GET | `{O}/releases/{release_id}` | `release.read` | none | release with linked bugs summary, runs summary, readiness, ai_summary | 404 |
| API-113 | PATCH | `{O}/releases/{release_id}` | `release.manage` | `{name?, target_date?, description?, status?, ai_summary?, ai_usage_id?}` | release | 422 |
| API-114 | DELETE | `{O}/releases/{release_id}` | `release.manage` | none | 204 (unlinks bugs and runs) | 409 `released` |
| API-115 | GET | `{O}/releases/{release_id}/readiness` | `release.read` | none | `{status, reasons:[str], metrics:{open_by_severity, pass_rate, runs_in_progress, linked_runs}}` | 404 |
| API-116 | POST | `{O}/releases/{release_id}/bugs` | `release.manage` | `{bug_ids:[uuid]}` | `{linked: n}` | 422 (bug from other project) |
| API-117 | DELETE | `{O}/releases/{release_id}/bugs/{bug_id}` | `release.manage` | none | 204 | none |
| API-118 | POST | `{O}/releases/{release_id}/runs` | `release.manage` | `{run_ids:[uuid]}` | `{linked: n}` | 422 |
| API-119 | DELETE | `{O}/releases/{release_id}/runs/{run_id}` | `release.manage` | none | 204 | none |

## Authorization, audit, data and edge cases

* release.read for all; release.manage for Org Admin and QA Lead
* Audit: release.created, release.status_changed
* A bug or run from another project cannot be linked (422)
* Deleting a released release is refused (409 released)
* Readiness reasons list every rule that fired; no runs means At risk
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Unit tests for each readiness rule and boundary (79, 80, 94, 95 percent)
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] WEB 2.4.0 seeded as Blocked with two reasons (release-blocked scenario)
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
