# I-02 Labels

**Stage:** 4 | **Batch:** 4A (see [DAG](DAG.md)) | **Status:** Done

## Goal / requirement IDs

Org wide labels that can be attached to bugs and managed in Settings.

Requirements: REQ-022

## Scope and exclusions

* Label model and migration
* Labels API
* Labels tab of Settings (shared with I-11)

* Not in this issue: Attaching labels to bugs is part of I-03

## Module ownership / dependencies

* `backend/app/modules/projects (labels live with projects)`
* `frontend/src/modules/settings`
* Depends on: None
* Migration: `0003_labels`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge d5c5e14, tag `stage-2-approved`).

* **SCR-20**: [`settings-default-desktop.png`](../../design/screenshots/settings-default-desktop.png), [`settings-default-mobile.png`](../../design/screenshots/settings-default-mobile.png), [`settings-profile-desktop.png`](../../design/screenshots/settings-profile-desktop.png), [`settings-loading-desktop.png`](../../design/screenshots/settings-loading-desktop.png), [`settings-error-desktop.png`](../../design/screenshots/settings-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-052 | GET | `{O}/labels` | `org.read` | none | `[{id, name, color}]` | none |
| API-053 | POST | `{O}/labels` | `label.manage` | `{name, color}` | 201 label | 409 |
| API-054 | DELETE | `{O}/labels/{label_id}` | `label.manage` | none | 204 | none |

## Authorization, audit, data and edge cases

* org.read to list; label.manage (Org Admin, QA Lead) to create and delete
* Names are trimmed, 1 to 40 characters, unique per org case insensitively (409); a race past the check is caught from the unique index and is also 409
* Colour is optional and must be a token name (D-047); default neutral; chips stay neutral until BL-010
* The list returns `bug_count`, 0 until I-03 registers the real count through `hooks.label_bug_counts`
* Deleting a label removes it from bugs (I-03 adds the cascading `bug_labels` foreign key); an unknown id in the same org is 404 like another org's id
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green

## Acceptance checklist

- [ ] Lead creates and deletes labels; QA Engineer gets 403
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
