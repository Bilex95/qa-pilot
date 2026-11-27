# I-09 Dashboard and reports

**Stage:** 4 | **Batch:** 4E (see [DAG](DAG.md)) | **Status:** Done

## Goal / requirement IDs

Server computed metrics for the dashboard and the reports screen, with CSV export.

Requirements: REQ-038, REQ-039, REQ-040, REQ-041

## Scope and exclusions

* Dashboard and report endpoints (aggregations in SQL, one round trip per widget at most)
* Charts from the locked prototype with the validated palette, tooltips and table view (dataviz rules)

* Not in this issue: No real time updates (D-025)

## Module ownership / dependencies

* `backend/app/modules/dashboard`
* `frontend/src/modules/dashboard`
* Depends on: [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md), [I-07](I-07-test-runs-results-and-bug-from-a-failed-step.md), [I-08](I-08-releases-and-readiness.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge d5c5e14, tag `stage-2-approved`).

* **SCR-05**: [`dashboard-default-desktop.png`](../../design/screenshots/dashboard-default-desktop.png), [`dashboard-default-mobile.png`](../../design/screenshots/dashboard-default-mobile.png), [`dashboard-empty-desktop.png`](../../design/screenshots/dashboard-empty-desktop.png), [`dashboard-loading-desktop.png`](../../design/screenshots/dashboard-loading-desktop.png), [`dashboard-error-desktop.png`](../../design/screenshots/dashboard-error-desktop.png)
* **SCR-18**: [`reports-default-desktop.png`](../../design/screenshots/reports-default-desktop.png), [`reports-default-mobile.png`](../../design/screenshots/reports-default-mobile.png), [`reports-empty-desktop.png`](../../design/screenshots/reports-empty-desktop.png), [`reports-loading-desktop.png`](../../design/screenshots/reports-loading-desktop.png), [`reports-error-desktop.png`](../../design/screenshots/reports-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-130 | GET | `{O}/dashboard` | `dashboard.read` | `?project_id` | `{open_by_severity, sla_breached, trend:[{date, opened, closed}] (30 days), pass_rate:{last_7_days, runs}, top_components:[{name, open}], releases:[{id, name, readiness}], my_assigned_count}` | none |
| API-131 | GET | `{O}/reports/bug-trend` | `report.read` | `?project_id&from&to&interval=day|week` | `[{date, opened, closed, open_total}]` | 422 (range over 366 days) |
| API-132 | GET | `{O}/reports/summary` | `report.read` | `?project_id&from&to` | `{by_status, by_severity, by_component, by_assignee, run_pass_rate}` | 422 |
| API-133 | GET | `{O}/reports/bugs.csv` | `report.export` | same filters as API-060 | `text/csv` | 422 |

## Authorization, audit, data and edge cases

* dashboard.read, report.read, report.export for every role
* Empty org shows the empty state, never zero filled charts
* Date range over 366 days is 422
* CSV escapes formulas (cells starting with =, +, -, @)
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots
* Numbers match docs/SEED_MANIFEST.md for the baseline seed

## Acceptance checklist

- [ ] Dashboard p95 under 500 ms on baseline (NFR-PERF-02)
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
