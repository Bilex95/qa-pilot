# I-24 Docker: no container left without a network

**Stage:** 4 | **Batch:** 4A (see [DAG](DAG.md)) | **Status:** Planned

## Goal / requirement IDs

Root cause fix for the Stage 3 incident: a failed first start (port taken) left the db container running without a network.

Requirements: REQ-059

## Scope and exclusions

* Preflight in scripts/dc.ps1 and a POSIX twin (scripts/dc-preflight.sh, scripts/dc.sh) that refuses `up` when a host port belongs to anything but this Compose project, naming the owner; a port of the same project (qa-pilot) is a no-op (D-048)
* scripts/repro-i24.sh reproduces the incident in its own throwaway Compose project, before and after the fix; the restart policy stays `unless-stopped` because it brings the stack back after a WSL idle stop (measured, D-048)
* Backend startup check (`python -m app.core.db_preflight`) that retries resolving `db` for about 30 seconds, then exits with a clear message; `depends_on` db with `condition: service_healthy` is already in place
* WSL idle shutdown: scripts/with-wsl.ps1 holds one WSL session for exactly one task (closed in `finally`), scripts/newman.sh and scripts/newman.ps1 run Newman@6.2.3 inside Docker as one WSL session, scripts/repro-i24-idle.ps1 measures the effect; `instanceIdleTimeout=-1` in .wslconfig is documented as optional only and never changed by the build

* Not in this issue: Changing the Docker engine itself
* Not in this issue: Changing the product owner's .wslconfig

## Module ownership / dependencies

* `docker-compose.yml`
* `scripts/`
* `backend/app/core`
* Depends on: None

## Authorization, audit, data and edge cases

* Two stacks on the same ports; WSL restart in the middle of `up`; a Docker restart that beats the network by a moment
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Scripted reproduction before and after the fix, output in the stage review
* pytest for the db resolve retry and the clear failure message
* Idle control (no WSL session, Docker stops) against the held run (Docker stays up); Newman and the layout check green through the wrappers

## Acceptance checklist

- [ ] `up` with a taken port stops with a clear message and leaves no half started container
- [ ] Newman and the layout check run green without the stack disappearing in the middle of a run
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
