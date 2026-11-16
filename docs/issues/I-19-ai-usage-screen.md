# I-19 AI usage screen

**Stage:** 5 | **Batch:** 5B (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Show AI usage per feature and the request log.

Requirements: REQ-051

## Scope and exclusions

* AI usage screen from the locked design

## Module ownership / dependencies

* `frontend/src/modules/ai`
* Depends on: [I-14](I-14-ai-provider-guardrails-usage-log-and-limits.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-21**: [`ai-usage-default-desktop.png`](../../design/screenshots/ai-usage-default-desktop.png), [`ai-usage-default-mobile.png`](../../design/screenshots/ai-usage-default-mobile.png), [`ai-usage-empty-desktop.png`](../../design/screenshots/ai-usage-empty-desktop.png), [`ai-usage-loading-desktop.png`](../../design/screenshots/ai-usage-loading-desktop.png), [`ai-usage-error-desktop.png`](../../design/screenshots/ai-usage-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-146 | GET | `{O}/ai/usage` | `ai.usage_read` | `?feature&user_id&from&to&page` | page of AIUsage rows | none |
| API-147 | GET | `{O}/ai/usage/summary` | `ai.usage_read` | `?from&to` | `{provider, model, totals_by_feature:[{feature, calls, input_tokens, output_tokens, avg_latency_ms, acceptance_rate}], daily_limit, used_today}` | none |

## Authorization, audit, data and edge cases

* ai.usage_read for Org Admin and QA Lead
* Mock provider shows estimated tokens with a note
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* `e2e/scripts/check-prototype.mjs` style layout check on the built screen at 320 to 1440 px (D-035)
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Totals match the usage rows
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
