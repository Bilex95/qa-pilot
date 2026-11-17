# Progress

**Current stage:** 4 Core features
**Branch:** stage/4-core-features
**Remote:** origin = github.com/Bilex95/qa-pilot (private). Push only with `bash scripts/safe-push.sh` (branch or `--tag`). Gate flow per D-034, D-036.

## Done
* Stages 0 to 3 approved. Stage 3 merged as PR #2 (merge commit 287b4d1, CI run 44095091211 green on 459a371), tagged `stage-3-approved`.
* Stage 3 gate feedback applied: menus inside the viewport, 44 px inputs restored, content cap 1600 px (D-046), responsive standing rule with CI job (D-044), refresh reuse interval (D-039), password reset planned (I-23, D-045), Docker network root cause planned (I-24).

## Stage 4 plan (docs/issues/DAG.md)
- [ ] 4A: I-01 projects, components, environments; I-02 labels; I-10 members screen; I-24 Docker preflight
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
* I-01.

## Blockers
* None.
