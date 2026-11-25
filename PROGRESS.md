# Progress

**Current stage:** 4 Core features
**Branch:** stage/4-core-features
**Remote:** origin = github.com/Bilex95/qa-pilot (private). Push only with `bash scripts/safe-push.sh` (branch or `--tag`). Gate flow per D-034, D-036.

## Resume here (updated 2026-11-25, token rules in CLAUDE.md)

**State:** Stage 5, I-15 (AI Bug Writer, Explain this log, duplicate detector). Branch pushed up to `96e6ffb`. Backend done (D-070, pytest 1633, Newman 590 requests and 1019 assertions). Frontend done and passing locally (AI flow PASS, lint, typecheck, build clean).

**CI (check each run once, no polling):** run 45596069987 (1d74866) was green except layout shards 360/390, 768/1024, 1920/2560, which were still running; the breadcrumb 12 px fix is in 1d74866. The projects flow failure (Edit project button too early) is fixed in 08ec901. Runs for 34ece25, 08ec901 and 96e6ffb not read yet: `gh run list --branch stage/4-core-features --limit 5`, then `gh run view <id> --log-failed`.

**I-15 still open:**
1. Look at `e2e/parity/stage4/i03/compare/bug-new-default-desktop.png`, `bug-new-error-desktop.png`, `bug-new-default-mobile.png` (recaptured with the AI panel; mobile stacking unchecked).
2. New layout states in `check-app-layout.mjs` (AI panel idle, drafting, draft, explained log, failed suggestion, duplicate warning with a 200 character row) have never run: CI runs them, fix what it reports.
3. Write D-071 (frontend decisions: a draft's description not shown because the locked form has no description field; "Add to actual result" instead of "Insert into description"; saved bugs marked `ai_assisted`; AI controls render nothing when AI is off), the I-15 review section in `docs/reviews/STAGE_4_REVIEW.md`, the Done entry here and the DAG entry (`scripts/build_issues.py` DONE map).

**Then:** I-16 (AI triage), I-17 (test case generator), I-18 (release summary), I-19 (AI usage screen), Stage 6 (I-20 to I-22), one final review. Each issue goes to the `issue-builder` subagent (CLAUDE.md "Token rules"). No full browser suites locally; stop only if CI stays red after two honest fixes of the same failure.

## Done
* Older entries (Stages 0 to 3, I-01 to I-12 and I-13 detail): `docs/progress-archive.md`.

* I-13 Parity and states pass (D-067, D-068): found and built the missing Projects and Project overview screens, extended API-040 and API-042 with the project figures, ten parity comparisons reviewed (two fixed), the axe scan of 16 screens, the projects flow, CI split into parallel jobs, the layout fixture bug on a fresh database fixed. Verified locally: pytest 1476, Newman 549 requests and 945 assertions, lint, typecheck, build, projects flow, axe. CI: see the latest run.
* I-14 AI foundation (D-069): migration 0014, `ai/application/service.run` (switch, limits, tagged prompts, validation with one retry, fallback, one usage row per call), mock and Anthropic providers, API-146 to API-148, the `ai_usage_id` check. Verified: ruff, mypy, pytest 1553 passed, migration round trip with no drift, Newman 568 requests and 979 assertions. No live Anthropic call (no key).

## Stage 4 plan (docs/issues/DAG.md)
- [ ] 4A: I-01 projects, components, environments (done, 53bbea8, 82dd4f7); I-02 labels (done, see Done); I-10 members screen (done, see Done); I-24 Docker preflight (done, see Done). Batch 4A is complete
- [ ] 4B: I-03 bugs (done, see Done); I-06 suites and cases (done, see Done); I-11 settings (done, see Done); I-23 password reset (done, see Done)
- [ ] 4C: I-04 workflow and board (done, see Done); I-05 bug detail (done, see Done); I-07 runs (done, see Done)
- [ ] 4D: I-08 releases (done, see Done)
- [ ] 4E: I-09 dashboard and reports (done, see Done); I-12 seed data (done, see Done)
- [ ] 4F: I-13 parity and states pass
- [ ] Gate: review, before and after screenshots at each width (D-044), push, PR

## Rules to remember
* Every endpoint: schemas, five kinds of tests, Postman (edit `postman/build_collection.py`), OpenAPI regenerated (`sh scripts/api-types.sh` in WSL).
* Every screen and popup: add to `e2e/scripts/check-app-layout.mjs`; prototype first for any style change, then `python scripts/build_globals_css.py`.

## Next
* Batch 4C: I-04 workflow and board, then I-05, I-07, then 4D to 4F, Stage 5 and Stage 6, in DAG order, under the autonomy rules in CLAUDE.md (no stop between issues, one final review). Run the full layout check once per issue with `scripts/layout-check.ps1`; the first full run must also cover the I-11 Settings states.

## Blockers
* Open item, 2026-11-21, I-11: the full layout check was killed for low memory three times (3.5 GB free of 15.7 GB), the last time after it was made lighter. Each kill left fixtures; `e2e/scripts/clean-layout-fixtures.mjs` removed them (0 live reset links). The product owner chose to skip the layout step for I-11 and go on. Its Settings states are in `check-app-layout.mjs` and run in the next full run; the next full run is also the first one with the browser restarted every 3 widths. Include this in the final review.
* Open item, 2026-11-21, I-04: the full layout check was killed for low memory once, then retried once with one width per browser (`-Batch 1`). The retry ran 654 states but the stack stopped answering midway ("fetch failed"), leaving 3 flow problems (settings in the long names workspace, the Past SLA badge) that are timeouts, not layout findings. Fixtures were cleaned again (one live reset link revoked, 0 left). Per Part 3 the layout step is skipped for I-04 and logged here. The board states are in `check-app-layout.mjs`; the I-11 and I-04 states run in the next full run. Include this in the final review.
* Open item, 2026-11-22, I-05: the full layout check was killed for low memory (6.2 GB free at the start). Fixtures cleaned (1 live reset link revoked, 0 left); ten tiny fixture files of that run stay orphaned on the upload volume (the cleanup script now deletes files first). The 390 px run passed alone (105 states, covering the I-04 and I-11 states too, after a stale long names step was fixed). Not retried, because the system asked that a killed run is not restarted on my own. The full run is still owed for I-04, I-05 and I-11. Include this in the final review.
