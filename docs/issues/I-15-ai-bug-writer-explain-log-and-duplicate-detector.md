# I-15 AI Bug Writer, Explain log and Duplicate detector

**Stage:** 5 | **Batch:** 5B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Turn rough notes into a structured bug and warn about duplicates before saving.

Requirements: REQ-043, REQ-044, REQ-046

## Scope and exclusions

* Bug writer and explain log prompts and schemas (AI_SPEC 3.1, 3.2)
* TF IDF duplicate search over open bugs in the project (D-013)
* New bug screen AI panel with the proof mark suggestion and duplicate warning

* Not in this issue: Nothing is saved by AI; Save bug remains the user's action

## Module ownership / dependencies

* `backend/app/modules/ai`
* `frontend/src/modules/bugs`
* Depends on: [I-14](I-14-ai-provider-guardrails-usage-log-and-limits.md), [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-11**: [`bug-new-default-desktop.png`](../../design/screenshots/bug-new-default-desktop.png), [`bug-new-default-mobile.png`](../../design/screenshots/bug-new-default-mobile.png), [`bug-new-ai-desktop.png`](../../design/screenshots/bug-new-ai-desktop.png), [`bug-new-error-desktop.png`](../../design/screenshots/bug-new-error-desktop.png), [`bug-new-loading-desktop.png`](../../design/screenshots/bug-new-loading-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-140 | POST | `{O}/ai/bug-writer` | `ai.bug_writer` | `{project_id, notes, log?}` | `BugDraftSuggestion` | 422, 502 `ai_unavailable` (only if fallback also fails) |
| API-141 | POST | `{O}/ai/explain-log` | `ai.explain_log` | `{log}` | `LogExplanation` | 422 |
| API-143 | POST | `{O}/ai/duplicates` | `ai.duplicates` | `{project_id, title, actual_result?, steps?, exclude_bug_id?}` | `{candidates:[{bug: BugSummary, score}]}` | 422 |

## Authorization, audit, data and edge cases

* ai.bug_writer, ai.explain_log, ai.duplicates for all but Viewer
* Duplicate call debounced 600 ms and only when the title has 8 characters
* Mapped component and environment must exist in the project
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Accept fills the form; Discard leaves it unchanged; outcome logged
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
