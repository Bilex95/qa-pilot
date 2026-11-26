# Final QA report

Branch `stage/4-core-features`. Last CI run seen green: run 45796890360 (commit f8352f9), all jobs success. Status values: **Verified** (built and checked by an automated test or a recorded manual check), **Partial** (built, with a stated gap), **Not done**.

## Recommendation: GO, with one condition

1. The large seed latency check (BL-035) is done: bug list p95 45 ms and dashboard p95 316 ms at 20,068 bugs (D-080).
2. Add a general API rate limit (BL-034) before exposing the API to the public internet. Sign in, password reset and AI calls are already limited.

No critical or high defect is open. No cross tenant leak was found (I-21). Nothing needs a product decision.

## Check totals (latest recorded)

| Check | Result |
|---|---|
| pytest | 1758 passed (I-21) |
| ruff, mypy | clean |
| Newman | 620 requests, 1073 assertions, 0 failed (I-18, last API change) |
| Frontend lint, typecheck, build | clean |
| Browser checks in CI | layout shards (9 widths plus 1280, 1920, 2560, zoom), flows (including journeys and keyboard), parity and axe: all success in run 45796890360 and 45790781486 |
| axe | 17 screens at 1440 and 390 px, zero violations |
| Security | `npm audit` 0, `pip-audit` none, secret scan found only test values |
| Performance (baseline seed, 68 bugs) | bug list p95 69 ms (target 300), dashboard 115 ms (target 500) |
| Performance (D-080, p95 ms at 68, 5,068 and 20,068 bugs) | bug list 23, 22, 45; dashboard 30, 52, 316; trend 16, 36, 195; summary 40, 26, 172; releases 21, 19, 53 |

## Requirement traceability

Evidence key: UT = backend pytest, NM = Newman collection, FL = browser flow script, LY = layout check, AX = axe, CI = CI job, REV = section in `docs/reviews/STAGE_4_REVIEW.md` (issue in brackets).

| REQ | Status | Evidence |
|---|---|---|
| REQ-001 register | Verified | UT, NM, FL (journeys), Stage 3 review |
| REQ-002 sign in | Verified | UT, NM, FL |
| REQ-003 refresh and logout | Verified | UT, NM |
| REQ-004 org setup | Verified | UT, NM, FL |
| REQ-005 org switcher | Verified | FL (journeys, workspace A and B), Stage 3 review |
| REQ-006 invitations | Verified | UT, NM, FL, REV (I-10) |
| REQ-007 roles enforced | Verified | UT forbidden tests on every endpoint, FL (Viewer cannot edit) |
| REQ-008 tenant isolation | Verified | UT cross tenant test per endpoint, `test_tenancy_review.py`, FL, REV (I-21) |
| REQ-009 member management | Verified | UT, NM, FL, REV (I-10) |
| REQ-010 passwords and brute force | Verified | UT, REV (I-23) |
| REQ-011 profile and password | Verified | UT, NM, REV (I-11) |
| REQ-012 audit log | Verified | UT, NM, REV (I-11) |
| REQ-013 projects | Verified | UT, NM, FL, REV (I-01, I-13) |
| REQ-014 components | Verified | UT, NM, FL |
| REQ-015 environments | Verified | UT, NM, FL |
| REQ-016 project overview | Verified | UT, FL, REV (I-13) |
| REQ-017 create bug | Verified | UT, NM, FL, REV (I-03) |
| REQ-018 view and edit bug | Verified | UT, NM, FL, REV (I-05) |
| REQ-019 workflow | Verified | UT (transition tests), NM, FL, REV (I-04) |
| REQ-020 assignment | Verified | UT, NM |
| REQ-021 severity and priority | Verified | UT, NM |
| REQ-022 labels | Verified | UT, NM, REV (I-02) |
| REQ-023 comments | Verified | UT, NM, FL, REV (I-05) |
| REQ-024 attachments | Verified | UT (type and size limits), NM, REV (I-05) |
| REQ-025 activity timeline | Verified | UT, FL |
| REQ-026 list filters, search, sort | Verified | UT, NM, FL |
| REQ-027 saved views | Verified | UT, NM |
| REQ-028 board | Verified | UT, FL (drag and keyboard move), REV (I-04) |
| REQ-029 delete bug | Verified | UT, NM |
| REQ-030 suites | Verified | UT, NM, FL, REV (I-06) |
| REQ-031 test cases | Verified | UT, NM, FL |
| REQ-032 test runs | Verified | UT, NM, FL, REV (I-07) |
| REQ-033 results | Verified | UT, NM, FL |
| REQ-034 bug from failed result | Verified | UT, FL (journeys) |
| REQ-035 releases | Verified | UT, NM, FL, REV (I-08) |
| REQ-036 link bugs and runs | Verified | UT, NM |
| REQ-037 readiness | Verified | UT (rules D-014), NM, REV (I-08) |
| REQ-038 dashboard | Verified | UT, NM, FL, REV (I-09) |
| REQ-039 reports | Verified | UT, NM, FL |
| REQ-040 CSV export | Verified | UT, NM |
| REQ-041 SLA breach | Verified | UT, NM, `sla-breach` seed scenario |
| REQ-042 provider interface | Verified | UT; **live Anthropic call not tested (no API key)**, mock only |
| REQ-043 Bug Writer | Verified | UT, NM, FL (AI flow, journeys) |
| REQ-044 Explain this log | Verified | UT, NM |
| REQ-045 Triage | Verified | UT, NM, FL |
| REQ-046 duplicate detector | Verified | UT, NM, FL |
| REQ-047 test case generator | Verified | UT, NM, FL |
| REQ-048 release summary | Verified | UT, NM, FL |
| REQ-049 suggestion, accept, discard | Verified | UT (no AI endpoint writes domain data), NM, FL |
| REQ-050 content as data, validated output | Verified | UT (prompt injection test, retry and fallback) |
| REQ-051 AI usage log and screen | Verified | UT, NM, FL, REV (I-19) |
| REQ-052 AI limits and off switch | Verified | UT, NM |
| REQ-053 org settings | Verified | UT, NM, FL, REV (I-11) |
| REQ-054 API conventions | Verified | UT (envelope, request id), OpenAPI regenerated and checked in CI |
| REQ-055 four states per screen | Verified | LY states, parity comparison (`PARITY.md`) |
| REQ-056 widths | Verified | LY at 320 to 2560 px and 200 percent zoom, CI shards |
| REQ-057 WCAG 2.1 AA | Partial | AX zero violations on 17 screens, keyboard flow, contrast in design tokens. No manual screen reader pass yet: stays Partial until the product owner's manual NVDA check is done |
| REQ-058 404 page | Verified | FL, layout state |
| REQ-059 compose healthy from a clean clone | Verified | CI stack start on every run, REV (I-24) |
| REQ-060 seed CLI | Verified | UT (idempotent, refuses production), five scenarios |
| REQ-061 Postman and CI | Verified | CI runs ruff, mypy, pytest, lint, tsc, build and Newman |
| REQ-062 bug list speed | Verified | `measure-api-latency.mjs`: p95 23 ms on 68 bugs, 22 ms on 5,068, 45 ms on 20,068 (target 300); dashboard 316 ms at 20,068 (target 500) (D-080) |
| REQ-063 secure defaults | Verified | UT (headers, CORS), non root images, secret scan, REV (I-21) |

Totals: 62 Verified, 1 Partial (REQ-057, pending the product owner's manual NVDA check), 0 Not done. REQ-042 is Verified for the mock provider only.

## Known gaps and backlog

* BL-035 is done (D-080). The dashboard is the endpoint to watch beyond 20,000 bugs (316 ms p95 against a 500 ms target).
* BL-034: general API rate limit (before public exposure).
* BL-036: the dashboard grows faster than the data (52 ms at 5,000 bugs, 316 ms at 20,000). Not blocking; before a larger customer arrives, run EXPLAIN ANALYZE on the dashboard, trend and summary queries at 20,000 bugs and propose an index or pre-aggregation.
* No live call to the Anthropic provider was run (no key); validation, retry and fallback are tested against a fake provider.
* REQ-057 stays Partial: no manual screen reader pass yet, pending the product owner's manual NVDA check.
* Browser suites ran locally only for changed screens; CI is the judge (D-060).
* Other backlog items (BL-001 to BL-033) are tracked in `docs/BACKLOG.md`.
