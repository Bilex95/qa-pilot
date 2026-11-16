# I-10 Members and invitations screen

**Stage:** 4 | **Batch:** 4A (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

The members screen for the existing org, member and invitation APIs.

Requirements: REQ-006, REQ-009

## Scope and exclusions

* Members table with role select and remove, invite dialog showing the link once, pending invitations list

* Not in this issue: Backend already done in Stage 3

## Module ownership / dependencies

* `frontend/src/modules/members`
* Depends on: None

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-19**: [`members-default-desktop.png`](../../design/screenshots/members-default-desktop.png), [`members-default-mobile.png`](../../design/screenshots/members-default-mobile.png), [`members-invite-desktop.png`](../../design/screenshots/members-invite-desktop.png), [`members-loading-desktop.png`](../../design/screenshots/members-loading-desktop.png), [`members-error-desktop.png`](../../design/screenshots/members-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-024 | GET | `{O}/members` | `member.list_basic` (full fields for `member.list`) | `?page&q&role` | page of `{membership_id, user: UserSummary, role, joined_at}` | none |
| API-025 | PATCH | `{O}/members/{membership_id}` | `member.update_role` | `{role}` | membership | 409 `last_admin` |
| API-026 | DELETE | `{O}/members/{membership_id}` | `member.remove` | none | 204 | 409 `last_admin` |
| API-027 | POST | `{O}/invitations` | `invitation.create` | `{email, role}` | 201 `{id, email, role, expires_at, invite_url}` (url shown once) | 409 `already_member` |
| API-028 | GET | `{O}/invitations` | `invitation.list` | `?status` | list of invitations without token | none |
| API-029 | DELETE | `{O}/invitations/{invitation_id}` | `invitation.revoke` | none | 204 | none |

## Authorization, audit, data and edge cases

* Org Admin manages; QA Lead reads; others have no menu entry and see the no access state
* Last admin controls disabled with an explanation (409 last_admin handled)
* Invite link shown once, copy button
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Admin invites, copies link, a new user accepts it (Stage 3 accept screen)
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
