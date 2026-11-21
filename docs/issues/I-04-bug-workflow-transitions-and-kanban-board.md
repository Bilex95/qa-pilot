# I-04 Bug workflow, transitions and Kanban board

**Stage:** 4 | **Batch:** 4C (see [DAG](DAG.md)) | **Status:** Done

## Goal / requirement IDs

Enforce the nine status workflow on the server and let teams move bugs on a board.

Requirements: REQ-019, REQ-028

## Scope and exclusions

* State machine in `bugs/domain` from DOMAIN_MODEL section 4, with side effects (resolved_at, closed_at)
* Transitions endpoints and workflow definition
* Board endpoint and board screen with drag and the keyboard Move to menu
* Transition buttons on bug detail

* Not in this issue: No configurable workflows (D-005)

## Module ownership / dependencies

* `backend/app/modules/bugs/domain`
* `frontend/src/modules/board`
* Depends on: [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-09**: [`board-default-desktop.png`](../../design/screenshots/board-default-desktop.png), [`board-default-mobile.png`](../../design/screenshots/board-default-mobile.png), [`board-empty-desktop.png`](../../design/screenshots/board-empty-desktop.png), [`board-loading-desktop.png`](../../design/screenshots/board-loading-desktop.png), [`board-error-desktop.png`](../../design/screenshots/board-error-desktop.png)
* **SCR-10**: [`bug-detail-default-desktop.png`](../../design/screenshots/bug-detail-default-desktop.png), [`bug-detail-default-mobile.png`](../../design/screenshots/bug-detail-default-mobile.png), [`bug-detail-ai-desktop.png`](../../design/screenshots/bug-detail-ai-desktop.png), [`bug-detail-loading-desktop.png`](../../design/screenshots/bug-detail-loading-desktop.png), [`bug-detail-error-desktop.png`](../../design/screenshots/bug-detail-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-065 | GET | `{O}/bugs/{bug_id}/transitions` | `bug.read` | none | `{current, allowed:[status]}` for the caller | none |
| API-066 | POST | `{O}/bugs/{bug_id}/transitions` | `bug.transition` | `{to_status, comment?}` | `Bug` | 403, 409 `invalid_transition` |
| API-067 | GET | `{O}/bug-workflow` | `bug.read` | none | `{statuses:[...], transitions:[{from,to,roles}]}` | none |
| API-068 | GET | `{O}/bugs/board` | `bug.read` | `?project_id&assignee_id&severity[]&q` | `{columns:[{status, total, items:[BugSummary] (first 50)}]}` | 422 |

## Authorization, audit, data and edge cases

* Org Admin and QA Lead: every allowed transition
* QA Engineer: triage, verify, reopen, close
* Developer: start, fix, hand back, ready for retest, only on bugs assigned to them or unassigned (self assign on start)
* Viewer: none
* Audit: bug.status_changed
* Transition not in the table: 409 invalid_transition with details.allowed
* Optimistic board move rolls back with a message when the server refuses (D-025)
* Reopened clears resolved_at and closed_at
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Unit tests for every row of the transition table and every role (table driven)
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Developer cannot drag a bug assigned to someone else; the card returns with a message
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
