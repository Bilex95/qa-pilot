# I-21 Security, tenancy review and performance

**Stage:** 6 | **Batch:** 6A (see [DAG](DAG.md)) | **Status:** Done (D-078, review in STAGE_4_REVIEW.md)

## Goal / requirement IDs

Prove the security and performance targets before release.

Requirements: REQ-008, REQ-062, REQ-063

## Scope and exclusions

* Review every query for org_id scoping
* Upload limits, rate limits, headers
* npm audit and pip-audit; fix or record
* Bug list under 1 s with seeded data; indexes where needed

## Module ownership / dependencies

* `backend`
* `frontend`
* Depends on: [I-20](I-20-end-to-end-tests-accessibility-and-responsive-ch.md)

## Authorization, audit, data and edge cases

* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Findings and fixes recorded in the Stage 6 review

## Acceptance checklist

- [ ] No high or critical dependency findings left unexplained
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
