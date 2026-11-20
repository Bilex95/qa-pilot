# I-05 Bug detail: comments, attachments and activity

**Stage:** 4 | **Batch:** 4C (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

The bug detail page with its conversation, files and full history.

Requirements: REQ-018, REQ-023, REQ-024, REQ-025

## Scope and exclusions

* Comment, Attachment, BugActivity models and migration
* Local volume storage with type sniffing and size limits (D-009)
* Authenticated, tenant checked download
* Bug detail screen

* Not in this issue: AI triage panel (I-16)

## Module ownership / dependencies

* `backend/app/modules/bugs`
* `frontend/src/modules/bugs`
* Depends on: [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md)
* Migration: `0006_bug_detail`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-10**: [`bug-detail-default-desktop.png`](../../design/screenshots/bug-detail-default-desktop.png), [`bug-detail-default-mobile.png`](../../design/screenshots/bug-detail-default-mobile.png), [`bug-detail-ai-desktop.png`](../../design/screenshots/bug-detail-ai-desktop.png), [`bug-detail-loading-desktop.png`](../../design/screenshots/bug-detail-loading-desktop.png), [`bug-detail-error-desktop.png`](../../design/screenshots/bug-detail-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-069 | GET | `{O}/bugs/{bug_id}/comments` | `bug.read` | `?page` | page of `{id, author, body, created_at, edited_at}` | none |
| API-070 | POST | `{O}/bugs/{bug_id}/comments` | `comment.create` | `{body}` | 201 comment | 422 |
| API-071 | PATCH | `{O}/comments/{comment_id}` | `comment.update` (own) | `{body}` | comment | 403 |
| API-072 | DELETE | `{O}/comments/{comment_id}` | `comment.delete` | none | 204 | 403 |
| API-073 | GET | `{O}/bugs/{bug_id}/attachments` | `bug.read` | none | `[{id, filename, content_type, size_bytes, uploaded_by, created_at}]` | none |
| API-074 | POST | `{O}/bugs/{bug_id}/attachments` | `attachment.upload` | multipart `file` | 201 attachment | 413 `file_too_large`, 415 `unsupported_type`, 409 `too_many_files` |
| API-075 | GET | `{O}/attachments/{attachment_id}/download` | `attachment.download` | none | file stream, `Content-Disposition: attachment` | 404 |
| API-076 | DELETE | `{O}/attachments/{attachment_id}` | `attachment.delete` | none | 204 | 403 |
| API-077 | GET | `{O}/bugs/{bug_id}/activity` | `bug.read` | `?page` | page of `{id, kind, actor, field, old_value, new_value, created_at}` | none |

## Authorization, audit, data and edge cases

* comment.create for every role including Viewer (D-007); edit and delete own; Org Admin deletes any
* attachment.upload for all but Viewer; delete own for QA Engineer and Developer
* Audit: attachment.uploaded, attachment.deleted, comment.deleted
* 413 file_too_large over 10 MB, 415 unsupported_type by extension or magic bytes, 409 too_many_files over 10
* Download sends Content-Disposition attachment and nosniff; never served from a public path
* Activity records old and new values for every field change
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Viewer comments; Viewer cannot upload
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
