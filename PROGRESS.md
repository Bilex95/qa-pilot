# Progress

**Current stage:** 4 Core features
**Branch:** stage/4-core-features
**Remote:** origin = github.com/Bilex95/qa-pilot (private). Push only with `bash scripts/safe-push.sh` (branch or `--tag`). Gate flow per D-034, D-036.

## Done
* Stages 0 to 3 approved. Stage 3 merged as PR #2 (merge commit 287b4d1, CI run 44095091211 green on 459a371), tagged `stage-3-approved`.
* Stage 3 gate feedback applied: menus inside the viewport, 44 px inputs restored, content cap 1600 px (D-046), responsive standing rule with CI job (D-044), refresh reuse interval (D-039), password reset planned (I-23, D-045), Docker network root cause planned (I-24).

* I-01 projects, components and environments: committed (53bbea8 API, 82dd4f7 Postman).
* I-02 labels: API-052 to API-054, migration 0003, Settings Labels tab (minimal shell for I-11), D-047, BL-010. Verified: ruff, mypy, pytest 235 passed, migration up/down/up with no drift, Newman 103 requests and 155 assertions green, frontend lint and typecheck clean, layout check PASS (185 states, 10 widths, screenshots in `e2e/parity/stage4/i02-after/`). `next build` passes. Not run: Playwright parity capture (I-02 lists no UI parity test). Commits: 8199178 backend, 4ef3d92 Postman, 9749945 OpenAPI types, then frontend and docs. Not pushed.
* Docker incident (2026-11-19): the WSL distro idles out between short `wsl` calls and systemd stops docker.service about 15 to 20 s later, so Newman failed with 500s and no responses. Newman is green when a WSL session stays open. Fixed in I-24 (wrappers hold one WSL session per task; optional `instanceIdleTimeout=-1` documented only).

* I-24 Docker start safety and WSL idle (D-048): port preflight (`dc.ps1`, `dc.sh`, `dc-preflight.sh`), backend `db_preflight` with a 30 s retry, `with-wsl.ps1` (scoped hold, closed in `finally`), Newman inside Docker (`newman.ps1`, `newman.sh`, newman@6.2.3), `repro-i24.sh` and `repro-i24-idle.ps1`. Evidence in `docs/reviews/STAGE_4_REVIEW.md`. Verified: ruff, mypy, pytest 243 passed, Newman 103 requests and 155 assertions green through the wrapper, layout check PASS (185 states) through the wrapper, reproduction PASS, idle control (Docker stopped after 15 s) against held (stayed up). `.wslconfig` untouched; `instanceIdleTimeout=-1` documented only (BL-009). Not pushed.

* I-10 Members and invitations screen (D-049): Members and roles screen (table, role select, Remove with a confirm dialog, invite dialog with the link shown once, pending invitations), QA Lead read only, own row locked, table skeleton and request id on the error state. Frontend only. Verified: ruff, mypy, pytest 243 passed, Newman 103 requests and 155 assertions green, lint, typecheck and `next build` clean, layout check PASS (255 states, 10 widths), flow script PASS (invite, accept as a new user, link works once), parity compared at 1440 and 390 with the differences listed in `docs/reviews/STAGE_4_REVIEW.md`. The invite link never reaches logs, URLs, caches or screenshots. Backlog BL-012 (pager), BL-013 (leave workspace, self demotion). Not pushed.

* I-03 Bugs, backend part (D-050): migration 0004 (`bugs`, `bug_labels`, `saved_views`), API-060 to API-064 and API-078 to API-080, real label and open bug counts through the projects hooks, label delete cascade. Verified: ruff, mypy, pytest 392 passed, migration up/down/up with no drift, Newman 182 requests and 291 assertions green, OpenAPI regenerated, `GET /bugs` worst p95 54 ms over 5,000 bugs in a throwaway database. Backend approved by the product owner; the frontend part is the next bullet.

* I-03 Bugs, frontend part (D-051): bug list (SCR-08) with filters, More filters, sorting, pager and saved views (create, apply, delete), New bug form (SCR-11, Developer sends no severity or priority), label delete confirm with the real count, plus the backend `unassigned` filter. Verified: ruff, mypy, pytest 399 passed, Newman 184 requests and 295 assertions, lint, typecheck and `next build` clean in one off WSL containers, layout check PASS (445 states, 10 widths), flow script PASS, parity compared at 1440 and 390 with the differences in `docs/reviews/STAGE_4_REVIEW.md`. Backlog BL-015, BL-016, BL-017. Not pushed since BL-014.

## Stage 4 plan (docs/issues/DAG.md)
- [ ] 4A: I-01 projects, components, environments (done, 53bbea8, 82dd4f7); I-02 labels (done, see Done); I-10 members screen (done, see Done); I-24 Docker preflight (done, see Done). Batch 4A is complete
- [ ] 4B: I-03 bugs (done, see Done); I-06 suites and cases; I-11 settings; I-23 password reset
- [ ] 4C: I-04 workflow and board; I-05 bug detail; I-07 runs
- [ ] 4D: I-08 releases
- [ ] 4E: I-09 dashboard and reports; I-12 seed data
- [ ] 4F: I-13 parity and states pass
- [ ] Gate: review, before and after screenshots at each width (D-044), push, PR

## Rules to remember
* Every endpoint: schemas, five kinds of tests, Postman (edit `postman/build_collection.py`), OpenAPI regenerated (`sh scripts/api-types.sh` in WSL).
* Every screen and popup: add to `e2e/scripts/check-app-layout.mjs`; prototype first for any style change, then `python scripts/build_globals_css.py`.

## Next
* I-06, I-11, I-23 of batch 4B (plan first, then wait for the go ahead). BL-014 (invite token in URLs) is planned with I-23.

## Blockers
* None.
