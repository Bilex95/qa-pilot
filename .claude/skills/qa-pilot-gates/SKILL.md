---
name: qa-pilot-gates
description: Use when running checks, gates, commits or pushes in QA Pilot: how to run commands without permission prompts, where gate output goes, how to read it cheaply, fixture cleanup, safe push and CI checks.
---

# QA Pilot gates, commands and CI

## No prompt commands
* Read and search only with Read, Grep and Glob, absolute paths under `C:/Users/HP/qa-pilot`. No cat, sed, head, tail, cut, wc, ls or grep in Bash.
* Write code only with Edit and Write. No `cat >>`, heredocs or echo redirects.
* Bash and PowerShell: one plain command per call. No cd (use absolute paths or `git -C C:/Users/HP/qa-pilot`), no pipes, parentheses, `&&` chains, loops, `$(...)` or variables in paths.
* Gate output goes to `C:/Users/HP/qa-pilot/.gate/<name>.txt` by redirect. Take the exit code from the tool result, then Grep the file for the summary and failure lines. Do not Read whole output files.
* PowerShell scripts run as `& C:\Users\HP\qa-pilot\scripts\<name>.ps1` (never a nested `powershell`). Never join commands with `&`. Run `with-wsl.ps1` with its target as an argument in one call (`& ...\with-wsl.ps1 -Up ...\py-checks.ps1 > ...\.gate\x.txt`, one held WSL session), or run commands in sequence with a semicolon (`& ...\with-wsl.ps1 -Up; & ...\py-checks.ps1 > ...\.gate\x.txt`) or as separate calls. A bare `with-wsl.ps1 -Up` closes its session on exit and Docker can stop seconds later (D-048), so use the held form for long runs.
* Helper scripts live in `C:/Users/HP/qa-pilot/scripts/` only. `.claude/settings.local.json` holds this machine's allow, ask and deny lists (not committed).

## Gate runs
* AI in tests (D-086): local pytest, Newman and flows always run on the MOCK provider automatically, `.env` untouched (never read or edit it; it may hold real keys). `py-checks.sh` uses `exec -e` flags, `newman.sh`, `run-flows.ps1` and `e2e.ps1` recreate only the backend with `docker-compose.test.yml` and restore it afterwards; a guard fails fast with "AI guard FAILED". `gate.ps1 -Only newman` runs Newman (baseline seed needed).
* All local gates in one command: `& C:\Users\HP\qa-pilot\scripts\gate.ps1` (frontend lint, typecheck, build, then ruff, mypy, pytest, in one held WSL session; `-Only frontend` or `-Only python`). It prints one PASS or FAIL line per part and writes the full output to `.gate\gate-frontend.txt` and `.gate\gate-python.txt` (Grep those for failure lines).
* Backend ruff, mypy and pytest alone: `with-wsl.ps1 -Up` then `py-checks.ps1`. Contract regeneration: `api-types.ps1` the same way.
* Newman: `scripts/newman.ps1` (baseline seed needed). Postman collection is generated: edit `postman/build_collection.py`, run it.
* Frontend: `npm run lint`, `npm run typecheck`, `npm run build` in `frontend`.
* Design: `scripts/validate-design.ps1`. Seed: `scripts/seed.ps1`. Flows: `scripts/run-flows.ps1` (only the screens you changed; the full set runs in CI).
* Never start a blocking foreground process. Use `docker compose up -d`, background dev servers, timeouts. Stop what you started.
* A command failing 3 times with different fixes goes in `docs/BLOCKERS.md` with the exact error and fix steps; pick a fallback.

## Fixtures
Every script that creates fixtures cleans them up in `finally`, including revoking reset links. Leftovers: `e2e/scripts/clean-layout-fixtures.mjs`; a reseed removes the rest.

## Commit and push
Small conventional commits on `stage/<n>-<name>`. Push only with `bash scripts/safe-push.sh <branch>` (tags: `--tag <name>`). If it blocks on the commit email, stop and tell the human. Never force push, never push to main, never make the repo public. End of stage: PR into main, on APPROVED `gh pr merge --merge`, tag `stage-<n>-approved`.

## CI
Never poll or wait for CI in the conversation. To be told when a run ends, start `bash scripts/wait-ci.sh <commit>` as a background monitor: it prints nothing until the run finishes, then `run <id> <conclusion>` and the failed job names (exit 0 green, 1 red, 2 not found or timed out). Otherwise push, continue, and check each run once later: `gh run list --branch <branch> --limit 5`, then `gh run view <id> --log-failed` (job logs: `gh api repos/Bilex95/qa-pilot/actions/jobs/<id>/logs`). Read only failure lines. Fix, push, check once again. Stop only if CI stays red after two honest fixes of the same failure.
