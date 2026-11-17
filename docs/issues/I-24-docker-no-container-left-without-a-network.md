# I-24 Docker: no container left without a network

**Stage:** 4 | **Batch:** 4A (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Root cause fix for the Stage 3 incident: a failed first start (port taken) left the db container running without a network.

Requirements: REQ-059

## Scope and exclusions

* Preflight in scripts/dc.ps1 and a POSIX twin that refuses `up` when a host port is already taken, naming the process
* Reproduce the incident in a test script; confirm whether `restart: unless-stopped` causes the detached restart and switch to `on-failure` with healthcheck based dependencies if so
* Compose healthcheck for the backend that fails fast when `db` does not resolve, with a clear log line

* Not in this issue: Changing the Docker engine itself

## Module ownership / dependencies

* `docker-compose.yml`
* `scripts/`
* Depends on: None

## Authorization, audit, data and edge cases

* Two stacks on the same ports; WSL restart in the middle of `up`
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Scripted reproduction before and after the fix, output in the stage review

## Acceptance checklist

- [ ] `up` with a taken port stops with a clear message and leaves no half started container
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
