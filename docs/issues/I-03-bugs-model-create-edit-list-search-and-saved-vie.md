# I-03 Bugs: model, create, edit, list, search and saved views

**Stage:** 4 | **Batch:** 4B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

The bug record and the list QA teams live in: create, edit, assign, filter, search, sort, page, save views.

Requirements: REQ-017, REQ-018, REQ-020, REQ-021, REQ-026, REQ-027, REQ-029, REQ-041, REQ-062

## Scope and exclusions

* Bug, BugLabel, SavedView models and migration with the indexes in NFR-PERF-04
* Per project key numbering (D-008) with a row lock on the project counter
* List filters, search (D-023), sort, page pagination (D-004), SLA flag (D-019)
* New bug form without AI (AI arrives in I-15), bug list screen with saved views

* Not in this issue: Status changes (I-04), comments, attachments and activity (I-05)

## Module ownership / dependencies

* `backend/app/modules/bugs`
* `frontend/src/modules/bugs`
* Depends on: [I-01](I-01-projects-components-and-environments.md), [I-02](I-02-labels.md)
* Migration: `0004_bugs`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-08**: [`bug-list-default-desktop.png`](../../design/screenshots/bug-list-default-desktop.png), [`bug-list-default-mobile.png`](../../design/screenshots/bug-list-default-mobile.png), [`bug-list-empty-desktop.png`](../../design/screenshots/bug-list-empty-desktop.png), [`bug-list-loading-desktop.png`](../../design/screenshots/bug-list-loading-desktop.png), [`bug-list-error-desktop.png`](../../design/screenshots/bug-list-error-desktop.png)
* **SCR-11**: [`bug-new-default-desktop.png`](../../design/screenshots/bug-new-default-desktop.png), [`bug-new-default-mobile.png`](../../design/screenshots/bug-new-default-mobile.png), [`bug-new-ai-desktop.png`](../../design/screenshots/bug-new-ai-desktop.png), [`bug-new-error-desktop.png`](../../design/screenshots/bug-new-error-desktop.png), [`bug-new-loading-desktop.png`](../../design/screenshots/bug-new-loading-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-060 | GET | `{O}/bugs` | `bug.read` | `?project_id&status[]&severity[]&priority[]&assignee_id&reporter_id&component_id&environment_id&label_id&release_id&sla_breached&q&sort=-updated_at&page&page_size` | page of `BugSummary` | 422 |
| API-061 | POST | `{O}/bugs` | `bug.create` | `{project_id, title, description?, steps_to_reproduce?, expected_result?, actual_result?, severity?, priority?, component_id?, environment_id?, label_ids?, assignee_id?, release_id?, source_run_result_id?, ai_assisted?}` | 201 `Bug` | 403 (developer sets severity), 422 |
| API-062 | GET | `{O}/bugs/{bug_ref}` | `bug.read` | `bug_ref` is a UUID or key like `WEB-42` | `Bug` | 404 |
| API-063 | PATCH | `{O}/bugs/{bug_id}` | `bug.update_fields`, `bug.set_severity_priority`, `bug.assign` per field | any editable field | `Bug` | 403, 422 |
| API-064 | DELETE | `{O}/bugs/{bug_id}` | `bug.delete` | none | 204 | none |
| API-078 | GET | `{O}/saved-views` | `saved_view.manage` | none | `[{id, name, filters}]` (mine) | none |
| API-079 | POST | `{O}/saved-views` | `saved_view.manage` | `{name, filters}` | 201 view | 422 |
| API-080 | DELETE | `{O}/saved-views/{view_id}` | `saved_view.manage` (own) | none | 204 | 404 |

## Authorization, audit, data and edge cases

* bug.create for all but Viewer; Developers cannot set severity or priority (D-032, 403 if sent)
* bug.update_fields: Developers only on bugs they reported (D-006)
* bug.assign: Developers may only assign an unassigned bug to themselves (D-006)
* bug.delete: Org Admin and QA Lead, soft delete (D-016)
* Audit: bug.created, bug.updated, bug.assigned, bug.deleted
* Assignee, component, environment, release and labels must belong to the same org and project (422)
* Two bugs created at once in one project never get the same number
* `bug_ref` accepts a UUID or a key like WEB-42; keys from another org return 404
* SLA: calendar time from creation to Fixed; Won't fix stops the clock; Reopened restarts it (D-019)
* Search matches key, title and description, case insensitive; page_size above 100 is 422
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots
* Performance: `GET /bugs` p95 under 300 ms on the baseline seed (NFR-PERF-01)

## Acceptance checklist

- [ ] QA Engineer files a bug and sees key WEB-1 in the list
- [ ] Developer files a bug: severity Medium and P3 forced
- [ ] Saved views are private to their owner
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
