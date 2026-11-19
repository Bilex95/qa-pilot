# Stage 4 Review: Core features (in progress)

**Branch:** `stage/4-core-features`

## 1. Setup tasks (before I-01, requested by the product owner)

| # | Task | Result |
|---|---|---|
| 1 | D-046 and TOKENS.md say 1552 px, matching the Stage 3 review | Both now state that the content area is at most 1600 px including 24 px padding each side, so at 1920 px the panel spans 1552 of 1688 px. No "1600 of 1688" wording remains |
| 2 | Add 2560 x 1440 to the responsive check, with a dashboard comparison at that width | Added to `e2e/scripts/check-app-layout.mjs` (and D-044, `CLAUDE.md`, the CI job name). Comparison below |
| 3 | `fillStable` records any retry as a layout problem | Every retry is reported as `form: typed text in <field> was wiped at step "<step>"`. Proven with a test only hook that wipes the field once (`QA_LAYOUT_INJECT_WIPE=1`) |
| 4 | Signing out from every signed in page lands on `/login` once and keeps typed text | New `e2e/scripts/check-signout.mjs`, added to the CI responsive job. Proven against a planted late second redirect |

### Evidence

```
> node scripts/check-app-layout.mjs --shots parity/stage4-setup/after
Checked 145 screen and popup states at 360, 390, 768, 1024, 1280, 1440, 1920, 2560, 1280-zoom200, 1920-zoom200
PASS: nothing outside the screen, no popup cut off, no clipped or tiny text, 44 px targets on touch widths

> QA_LAYOUT_INJECT_WIPE=1 node scripts/check-app-layout.mjs --only 1440     (negative test for task 3)
FAIL: 2 problem(s)
  - [1440] form: typed text in #l-email was wiped at step "sign in as the Org Admin" (attempt 1); the form was replaced after it was filled
  - [1440] form: typed text in #l-email was wiped at step "sign in as the long names fixture" (attempt 1); the form was replaced after it was filled

> node scripts/check-signout.mjs
PASS: 26 sign outs from 13 pages at 1440 and 390 px: one plain /login each, typed text kept, session ended
```

Negative test for task 4, with a second redirect planted one second after Sign out (confirmed live in the browser first, then removed and confirmed gone):

```
FAIL: 52 problem(s) in 26 sign outs
  - [1440] /o/lumen/dashboard: 2 navigations to /login after Sign out (expected exactly 1): http://localhost:3000/login, http://localhost:3000/login?again=1
  - [1440] /o/lumen/dashboard: sign in page has a query string (?again=1); expected a plain /login
```

A first attempt planted the second redirect immediately; Next.js merged both redirects into one navigation, so there was nothing a user could notice and the check rightly passed. The late redirect reproduces the real failure.

Pages covered by the sign out check: dashboard, projects, bugs, board, test suites, test runs, releases, reports, members, AI usage, settings, report a bug, and the in app 404.

### Dashboard at 2560 x 1440

Prototype and app match: the content area is capped at 1600 px, so the panel is 1552 px inside a 2328 px area (67 percent of it, left aligned).

![Prototype and app at 2560 px](../../e2e/parity/stage4-setup/compare/dashboard-empty-2560-prototype-vs-app.png)

All 2560 px app screenshots: `e2e/parity/stage4-setup/after/*-2560.png`.

## 2. Issues

I-01 and I-02 evidence is added at the end of Stage 4 (commits are listed in `docs/issues/DAG.md`). I-24 is first because every Newman and layout run depends on it.

### I-24 Docker: no container left without a network (REQ-059, D-048)

All output below was captured on 2026-11-19 on the build machine (Docker 29.4.0 in WSL 2.6.3, Ubuntu 24.04).

#### A. A taken host port, before and after

`scripts/repro-i24.sh` runs in its own throwaway Compose project (`qapilot-i24-repro`, host port 15433, its own containers, network and volumes), never in `qa-pilot`. Something else (`python3 -m http.server`) owns the port.

| | Before the fix (plain `docker compose up -d`) | After the fix (`scripts/dc-preflight.sh`) |
|---|---|---|
| Result | `up` exits 1: `failed to set up container networking: driver failed programming external connectivity` | Refused, exit 1: `port 15433 is in use by python3 (pid 1590)`, then `Nothing was started` |
| Left behind | Container `qapilot-i24-repro-db-1` in state `created`, `networks=[]`, still the same 20 seconds later (`restarts=0`) | No container for the project |

Two more cases, both as designed (D-048):

| Case | Result |
|---|---|
| The port belongs to the same Compose project | `Preflight ok`, exit 0 (up is a no-op) |
| The port belongs to another project name (another clone) | Refused, exit 1: `port 15433 is published by container qapilot-i24-repro-db-1 (Compose project qapilot-i24-repro)` |

Script result: `RESULT: PASS` (4 checks). Afterwards the throwaway project had 0 containers and 0 volumes, and the live stack was untouched. The first run of the script printed `tail`'s exit code instead of `docker compose`'s (a bug in the script, fixed; the table is from the corrected run).

What this does and does not show: it reproduces the start state of the Stage 3 incident (a failed first start leaves a container with no network). It does not reproduce the later detached start; the restart policy did not start the container within 20 seconds. The policy stays `restart: unless-stopped` because it is what brings the stack back after a WSL idle stop (below); `on-failure` would not (D-048).

#### B. WSL idle shutdown, control against held

`scripts/repro-i24-idle.ps1` brings the stack up, waits 45 seconds, then reads the journal of `docker.service`.

| Run | Wait | `docker.service` stops | Journal |
|---|---|---|---|
| Control: no WSL session during the wait | 45 s | 1 | `13:16:11 Stopping docker.service` (last `wsl` call ended 13:15:56, so 15 s later); started again at 13:16:44 by the next `wsl` call |
| Held through `scripts/with-wsl.ps1` | 49 s | 0 | none; `RESULT: Docker stayed up` |

An earlier attempt at the held run was discarded: the script passed `-NoProfile` to `with-wsl.ps1`, PowerShell read it as a parameter, the wait never ran, and the script still printed "Docker stayed up". The script now prints the elapsed time and fails when the wrapper fails.

Effect on the checks before the wrappers (Newman from Windows, no session): run 1 got health 503 and login 500 (connection refused to the database); run 2 got 26 failures in one block from the moment Docker was stopped, with no response at all; run 3 got 81 failures because the stack was down for the whole run. With a session held, the same collection passed: 103 requests, 155 assertions, 0 failed.

#### C. Backend check and the wrappers

| Check | Result |
|---|---|
| `python -m app.core.db_preflight` | Retries resolving `db` for about 30 seconds, then exits with a message naming the fix; 8 pytest tests (retry, give up after 30 s, message, no password echoed, bad URL) |
| `depends_on` db with `condition: service_healthy` | Already present on the backend (and the frontend waits for a healthy backend); nothing to add |
| Newman through `scripts/newman.ps1` (inside Docker, `newman@6.2.3`, one WSL session) | 103 requests, 155 assertions, 0 failed. Node is not installed in WSL, so a throwaway container from the frontend image is used |
| Layout check through `scripts/with-wsl.ps1` | PASS: 185 screen and popup states at 360, 390, 768, 1024, 1280, 1440, 1920, 2560, 1280 zoom 200 and 1920 zoom 200; the hold closed with no `qapilot-hold` process left |
| Ruff, mypy, pytest | Clean; clean (100 files); 243 passed |

Two bugs in `with-wsl.ps1` were found and fixed while testing it: the quoted `bash -c` string was split by `wsl.exe` and ended the hold at once (the hold is now a script file), and a one argument command was splatted as characters (`@(...)` keeps it an array).

#### D. Not done, on purpose

* The product owner's `.wslconfig` was not changed. `instanceIdleTimeout=-1` is documented in `docs/ENVIRONMENT.md` as optional and unverified against the Microsoft documentation (BL-009 keeps this open).
* The detached start after a Docker restart was not reproduced, so the restart policy conclusion rests on the 20 second observation and the idle measurements above.
