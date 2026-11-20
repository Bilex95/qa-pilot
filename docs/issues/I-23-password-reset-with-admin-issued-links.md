# I-23 Password reset with admin issued links

**Stage:** 4 | **Batch:** 4B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Let people who forgot their password get back in without email delivery (D-045).

Requirements: REQ-010, REQ-011

## Scope and exclusions

* PasswordReset model (token hash, expiry 1 hour, single use) and migration
* Endpoints: admin creates a reset link for a member; public preview; set new password with the token
* Forgot password page on sign in; reset link action on the members screen; set new password page

* Not in this issue: Self service by email (BL-005, BL-019)

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

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-030 | POST | `/invitations/preview` | Public | `{token}` (the token is in the body, never in a path or query: BL-014, D-055) | `{org_name, role, email_masked, expires_at}` | 410 `invitation_invalid`, 422 |
| API-031 | POST | `/invitations/accept` | Signed in (email must match) | `{token}` | `{org, membership}` | 403 `email_mismatch`, 410, 422 |
| API-151 | POST | `{O}/members/{membership_id}/password-reset` | `member.reset_password` (Org Admin) | none | 201 `{reset_url, expires_at}` (url shown once, single use, 1 hour, `/reset-password#<token>`) | 404, 409 `own_account`, 409 `shared_account` |
| API-152 | POST | `/auth/password-reset/preview` | Public | `{token}` | `{email_masked, expires_at}` | 410 `reset_invalid` (the same answer for an unknown, used, expired or replaced link), 422, 429 |
| API-153 | POST | `/auth/password-reset/confirm` | Public | `{token, new_password}` | 204 (the link is used up, every session of the person ends) | 410 `reset_invalid`, 422, 429 |

## Authorization, audit, data and edge cases

* Only an Org Admin of the org can create a link (`member.reset_password`); not for your own account (409 `own_account`) and not for a person who belongs to more than one workspace (409 `shared_account`, D-055)
* Audit: auth.reset_link_created, auth.password_reset, auth.reset_failed (no token in any audit data)
* Used, expired, unknown or replaced links all return the same 410 `reset_invalid`; setting a password revokes every refresh token and, with `users.password_changed_at`, every access token issued before it (same second handled by microsecond order)
* BL-014: invitation and reset tokens travel in the URL fragment and in request bodies, never in a path or query; the old token in path invitation routes and the `/invite/[token]` page are removed (D-055)
* Referrer-Policy no-referrer and Cache-Control no-store on the invite, reset and forgot password pages
* New endpoints added to API_INVENTORY.md (API-151 to API-153; API-030 and API-031 now take the token in the body), Postman and OpenAPI
* No user enumeration: the forgot password page has no email field and makes no request; every bad link gets the same answer; failed attempts per address are throttled (429)
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
