# Progress

**Current stage:** 3 Foundations (at review gate)
**Branch:** stage/3-foundations (push with `bash scripts/safe-push.sh stage/3-foundations`, then PR into main)
**Remote:** origin = github.com/Bilex95/qa-pilot (private). Gate flow per D-034, D-036.

## Done
* Stages 0 to 2 approved. Stage 2 merged as PR #1 (merge commit 73d7fcc), tagged `stage-2-approved`. Design locked.
* Stage 3: T1 to T10 done. Review: `docs/reviews/STAGE_3_REVIEW.md`.

## In progress
* Nothing. Stopped at the Stage 3 gate.

## Next
* On APPROVED: `gh pr merge <n> --merge`, `git checkout main && git pull --ff-only`, tag `stage-3-approved` on the merge commit, `bash scripts/safe-push.sh --tag stage-3-approved`, branch `stage/4-core-features`, start batch 4A from `docs/issues/DAG.md`.
* On feedback: fix on `stage/3-foundations`, rerun the gate checks, add "Changes after feedback" to the review, push through the gate.

## How to resume the stack
* `powershell -File scripts/dc.ps1 up -d --wait`, then seed baseline. See `docs/ENVIRONMENT.md` for WSL notes.

## Blockers
* None.
