# I-14 AI provider, guardrails, usage log and limits

**Stage:** 5 | **Batch:** 5A (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

The AI foundation every feature uses (AI_SPEC sections 1, 2 and 4).

Requirements: REQ-042, REQ-049, REQ-050, REQ-051, REQ-052

## Scope and exclusions

* AIProvider protocol, MockProvider (deterministic), AnthropicProvider (model from ANTHROPIC_MODEL)
* Prompt builder that wraps user content in labelled tags as data
* Pydantic validation, one retry, graceful fallback
* AIUsage model, per user rate limit (20 per minute) and org daily limit, ai_enabled switch
* Outcome endpoint for Accept, Edit, Discard

* Not in this issue: Feature prompts (I-15 to I-18)

## Module ownership / dependencies

* `backend/app/modules/ai`
* Depends on: None
* Migration: `0009_ai_usage`

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-146 | GET | `{O}/ai/usage` | `ai.usage_read` | `?feature&user_id&from&to&page` | page of AIUsage rows | none |
| API-147 | GET | `{O}/ai/usage/summary` | `ai.usage_read` | `?from&to` | `{provider, model, totals_by_feature:[{feature, calls, input_tokens, output_tokens, avg_latency_ms, acceptance_rate}], daily_limit, used_today}` | none |
| API-148 | POST | `{O}/ai/usage/{usage_id}/outcome` | caller of the original request | `{outcome: accepted|edited|discarded}` | 204 | 404, 409 `outcome_set` |

## Authorization, audit, data and edge cases

* AI never grants more than the user's role (D-028); ai_disabled returns 403
* No prompt or response text stored (D-018)
* Provider timeout 30 s then fallback
* Anthropic selected without a key falls back to mock with a warning
* Prompt injection test from AI_SPEC 2.9
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* All AI tests run on the mock provider
* Live smoke per feature only when ANTHROPIC_API_KEY is set; key never logged

## Acceptance checklist

- [ ] Usage row written for every call with status ok, invalid_output, fallback, error or rate_limited
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
