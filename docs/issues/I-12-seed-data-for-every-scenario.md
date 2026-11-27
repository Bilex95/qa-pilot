# I-12 Seed data for every scenario

**Stage:** 4 | **Batch:** 4E (see [DAG](DAG.md)) | **Status:** Done

## Goal / requirement IDs

Extend the seed so every scenario has realistic domain data, deterministic and idempotent.

Requirements: REQ-060

## Scope and exclusions

* baseline: 3 projects, about 60 bugs across every status and severity, 4 suites with about 40 cases, 5 runs, 3 releases (BUILD_PLAN 4)
* sla-breach: bugs past the confirmed SLA (D-019)
* release-blocked: a release blocked by Critical bugs and a low pass rate (D-014)
* multi-tenant: mirrored data in both orgs for isolation tests
* Manifest regenerated with the new counts

* Not in this issue: Production seeding stays forbidden

## Module ownership / dependencies

* `backend/app/seed`
* Depends on: [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md), [I-04](I-04-bug-workflow-transitions-and-kanban-board.md), [I-05](I-05-bug-detail-comments-attachments-and-activity.md), [I-06](I-06-test-suites-and-test-cases.md), [I-07](I-07-test-runs-results-and-bug-from-a-failed-step.md), [I-08](I-08-releases-and-readiness.md)

## Authorization, audit, data and edge cases

* Seeded ids stay in the seed namespace; reset never touches other records
* Running twice gives identical counts for every table
* Timestamps relative to a fixed anchor so SLA results are stable
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* test_seed.py extended to every new table
* CI seeds twice and compares counts

## Acceptance checklist

- [ ] `docs/SEED_MANIFEST.md` lists counts per scenario and they match
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
