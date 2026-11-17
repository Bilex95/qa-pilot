# I-23 Password reset with admin issued links

**Stage:** 4 | **Batch:** 4B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Let people who forgot their password get back in without email delivery (D-045).

Requirements: REQ-010, REQ-011

## Scope and exclusions

* PasswordReset model (token hash, expiry 1 hour, single use) and migration
* Endpoints: admin creates a reset link for a member; public preview; set new password with the token
* Forgot password page on sign in; reset link action on the members screen; set new password page

* Not in this issue: Self service by email (BL-005)

## Module ownership / dependencies

* `backend/app/modules/auth`
* `frontend/src/modules/auth`
* `frontend/src/modules/members`
* Depends on: [I-10](I-10-members-and-invitations-screen.md)
* Migration: `0010_password_resets`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-01**: [`login-default-desktop.png`](../../design/screenshots/login-default-desktop.png), [`login-default-mobile.png`](../../design/screenshots/login-default-mobile.png), [`login-error-desktop.png`](../../design/screenshots/login-error-desktop.png), [`login-loading-desktop.png`](../../design/screenshots/login-loading-desktop.png)
* **SCR-19**: [`members-default-desktop.png`](../../design/screenshots/members-default-desktop.png), [`members-default-mobile.png`](../../design/screenshots/members-default-mobile.png), [`members-invite-desktop.png`](../../design/screenshots/members-invite-desktop.png), [`members-loading-desktop.png`](../../design/screenshots/members-loading-desktop.png), [`members-error-desktop.png`](../../design/screenshots/members-error-desktop.png)

## Authorization, audit, data and edge cases

* Only an Org Admin of an org the person belongs to can create a link (member.update_role level)
* Audit: auth.reset_link_created, auth.password_reset
* Used, expired or revoked links return 410; setting a password revokes every refresh token
* New endpoints added to API_INVENTORY.md (new API ids), Postman and OpenAPI
* No user enumeration: the forgot password page gives the same answer for any email
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Admin creates a link, the person sets a new password, old sessions are signed out
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
