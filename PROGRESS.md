# Progress

**Current stage:** 4 Core features
**Branch:** stage/4-core-features
**Remote:** origin = github.com/Bilex95/qa-pilot (private). Push only with `bash scripts/safe-push.sh` (branch or `--tag`). Gate flow per D-034, D-036.

## Done
* Stages 0 to 3 approved. Stage 3 merged as PR #2 (merge commit 287b4d1, CI run 44095091211 green on 459a371), tagged `stage-3-approved`.
* Stage 3 gate feedback applied: menus inside the viewport, 44 px inputs restored, content cap 1600 px (D-046), responsive standing rule with CI job (D-044), refresh reuse interval (D-039), password reset planned (I-23, D-045), Docker network root cause planned (I-24).

* I-01 projects, components and environments: committed (53bbea8 API, 82dd4f7 Postman).
* I-02 labels: API-052 to API-054, migration 0003, Settings Labels tab (minimal shell for I-11), D-047, BL-010. Verified: ruff, mypy, pytest 235 passed, migration up/down/up with no drift, Newman 103 requests and 155 assertions green, frontend lint and typecheck clean, layout check PASS (185 states, 10 widths, screenshots in `e2e/parity/stage4/i02-after/`). `next build` passes. Not run: Playwright parity capture (I-02 lists no UI parity test). Commits: 8199178 backend, 4ef3d92 Postman, 9749945 OpenAPI types, then frontend and docs. Not pushed.
* Docker incident (2026-11-19): the WSL distro idles out between short `wsl` calls and systemd stops docker.service about 15 to 20 s later, so Newman failed with 500s and no responses. Newman is green when a WSL session stays open. Fix is planned in I-24 (run long tasks inside one WSL session; optional `instanceIdleTimeout=-1`, to be verified against the WSL docs).

## Stage 4 plan (docs/issues/DAG.md)
- [ ] 4A: I-01 projects, components, environments (done, 53bbea8, 82dd4f7); I-02 labels (done, see Done); I-10 members screen; I-24 Docker preflight
- [ ] 4B: I-03 bugs; I-06 suites and cases; I-11 settings; I-23 password reset
- [ ] 4C: I-04 workflow and board; I-05 bug detail; I-07 runs
- [ ] 4D: I-08 releases
- [ ] 4E: I-09 dashboard and reports; I-12 seed data
- [ ] 4F: I-13 parity and states pass
- [ ] Gate: review, before and after screenshots at each width (D-044), push, PR

## Rules to remember
* Every endpoint: schemas, five kinds of tests, Postman (edit `postman/build_collection.py`), OpenAPI regenerated (`sh scripts/api-types.sh` in WSL).
* Every screen and popup: add to `e2e/scripts/check-app-layout.mjs`; prototype first for any style change, then `python scripts/build_globals_css.py`.

## Next
* I-24 with the agreed approach: wrappers (`scripts/dc.ps1` and the POSIX twin) run long tasks such as Newman inside one WSL session; `instanceIdleTimeout=-1` in `.wslconfig` is documented as an optional setting the product owner applies. Then I-10.

## Blockers
* None.
