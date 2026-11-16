# I-11 Settings: organization, AI switch, audit log and profile

**Stage:** 4 | **Batch:** 4B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

One settings screen with tabs per role.

Requirements: REQ-011, REQ-012, REQ-052, REQ-053

## Scope and exclusions

* Organization tab (name, AI on or off, daily limit), Labels tab (from I-02), Audit log tab, My profile tab with password change

* Not in this issue: AI usage numbers (I-19)

## Module ownership / dependencies

* `frontend/src/modules/settings`
* Depends on: [I-02](I-02-labels.md), [I-10](I-10-members-and-invitations-screen.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-20**: [`settings-default-desktop.png`](../../design/screenshots/settings-default-desktop.png), [`settings-default-mobile.png`](../../design/screenshots/settings-default-mobile.png), [`settings-profile-desktop.png`](../../design/screenshots/settings-profile-desktop.png), [`settings-loading-desktop.png`](../../design/screenshots/settings-loading-desktop.png), [`settings-error-desktop.png`](../../design/screenshots/settings-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-015 | PATCH | `/auth/me` | Signed in | `{full_name}` | `user` | 422 |
| API-016 | POST | `/auth/me/password` | Signed in | `{current_password, new_password}` | 204 | 400 `wrong_password`, 422 |
| API-023 | PATCH | `{O}` | `org.update_settings` | `{name?, ai_enabled?, ai_daily_limit?}` | org | 403, 422 |
| API-150 | GET | `{O}/audit-events` | `audit.read` | `?action&actor_id&entity_type&from&to&page` | page of audit events | none |

## Authorization, audit, data and edge cases

* Org Admin: all tabs; QA Lead: Labels and My profile; others: My profile
* Password change signs out other sessions (backend revokes refresh tokens)
* Turning AI off hides AI controls everywhere (D-027)
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Viewer only sees My profile
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
