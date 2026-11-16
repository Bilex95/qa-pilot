# I-20 End to end tests, accessibility and responsive checks

**Stage:** 6 | **Batch:** 6A (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Playwright suite for the critical journeys plus axe and width checks.

Requirements: REQ-055, REQ-056, REQ-057, REQ-058

## Scope and exclusions

* Login per role; report a bug with AI; triage and move it on the board; run a test and create a bug from a failed step; release summary; viewer cannot edit; org A cannot see org B
* axe on key screens; keyboard pass for forms and dialogs
* Widths 320, 360, 375, 390, 412, 430, 768, 1024, 1440

## Module ownership / dependencies

* `e2e`
* Depends on: [I-13](I-13-stage-4-design-parity-and-states-pass.md), [I-15](I-15-ai-bug-writer-explain-log-and-duplicate-detector.md), [I-16](I-16-ai-triage.md), [I-17](I-17-ai-test-case-generator.md), [I-18](I-18-ai-release-readiness-summary.md), [I-19](I-19-ai-usage-screen.md)

## Authorization, audit, data and edge cases

* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Suite runs in CI against compose

## Acceptance checklist

- [ ] All journeys green; no serious or critical axe findings
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
