# I-18 AI Release Readiness Summary

**Stage:** 5 | **Batch:** 5B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

A plain English risk summary for stakeholders.

Requirements: REQ-048

## Scope and exclusions

* Summary prompt from server built data only (AI_SPEC 3.6)
* Summary panel on release detail; accepted text saved on the release

* Not in this issue: Viewers never trigger AI

## Module ownership / dependencies

* `backend/app/modules/ai`
* `frontend/src/modules/releases`
* Depends on: [I-14](I-14-ai-provider-guardrails-usage-log-and-limits.md), [I-08](I-08-releases-and-readiness.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-17**: [`release-detail-default-desktop.png`](../../design/screenshots/release-detail-default-desktop.png), [`release-detail-default-mobile.png`](../../design/screenshots/release-detail-default-mobile.png), [`release-detail-ai-desktop.png`](../../design/screenshots/release-detail-ai-desktop.png), [`release-detail-loading-desktop.png`](../../design/screenshots/release-detail-loading-desktop.png), [`release-detail-error-desktop.png`](../../design/screenshots/release-detail-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-145 | POST | `{O}/ai/release-summary` | `ai.release_summary` | `{release_id}` | `ReleaseSummarySuggestion` | 404 |
| API-113 | PATCH | `{O}/releases/{release_id}` | `release.manage` | `{name?, target_date?, description?, status?, ai_summary?, ai_usage_id?}` | release | 422 |

## Authorization, audit, data and edge cases

* ai.release_summary for Org Admin and QA Lead; everyone reads the accepted summary
* Recommendation must be consistent with readiness (blocked cannot become ship)
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Accept and publish stores the summary and writes release.summary_accepted
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
