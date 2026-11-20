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

### I-10 Members and invitations screen (REQ-006, REQ-009, D-049)

Frontend only: the six endpoints (API-024 to API-029) came with Stage 3 and already have happy, invalid, forbidden, `last_admin` and cross tenant tests and Postman requests. No migration, no backend change, no OpenAPI change.

#### A. What a QA Lead may see (checked before the read only view was built)

| Source | Lines |
|---|---|
| `docs/requirements/REQUIREMENTS.md` REQ-006 | "An Org Admin invites people by email and role through a copyable link." |
| `docs/requirements/REQUIREMENTS.md` REQ-009 | "An Org Admin manages members: change role, remove member." |
| `docs/requirements/PERSONAS_AND_ROLES.md` section 3.1 (columns: Org Admin, QA Lead, QA Engineer, Developer, Viewer) | `member.list` (members screen): Y, Y, N, N, N. `member.update_role`: Y, N, N, N, N. `member.remove`: Y, N, N, N, N. `invitation.create` / `invitation.revoke`: Y, N, N, N, N. `invitation.list`: Y, Y, N, N, N |
| `docs/requirements/PERSONAS_AND_ROLES.md` section 4, navigation | "Members \| Y \| Y (read only) \| N \| N \| N" |
| `docs/requirements/SCREEN_INVENTORY.md` SCR-19 | "Admin (manage), Lead (read)" |

So a QA Lead sees the members list including emails (`member.list`) and the pending invitations including their email addresses (`invitation.list`), and nothing else: no role selects, no Remove, no Invite people, no Revoke. Every other role gets the no access state. The layout check fails if the QA Lead view contains one of those controls; it did not.

#### B. Checks

| Check | Result |
|---|---|
| Ruff, mypy, pytest | Clean; clean (100 files); 243 passed |
| Newman through `scripts/newman.ps1` | 103 requests, 155 assertions, 0 failed (no new endpoints) |
| Frontend lint, typecheck, `next build` | Clean; clean; builds, `/o/[org]/members` in the route list (dev server stopped for the build and restarted) |
| Layout check through `with-wsl.ps1 -Up` | PASS, 255 states at 360, 390, 768, 1024, 1280, 1440, 1920, 2560, 1280 zoom 200 and 1920 zoom 200. New: members as Org Admin, invite dialog (form, then link), remove confirmation, no results, members as QA Lead (read only), members with the 80 character name and long email |
| `e2e/scripts/check-members-flow.mjs` | PASS: Org Admin invites, the link is shown once, a new user registers with the invited email and accepts, the member is a Developer and no longer pending, the used link no longer works, the member is removed. Test users are `flow-i10-<timestamp>@qapilot.test`; the script removes the membership and any pending invitation of that pattern (also those left by earlier failed runs). The user records stay. The script never prints the link: it is held in one variable and removed from error text |

The invite link is a secret and was kept out of everything that persists: not logged, not put in a URL by this screen, the mutation has `gcTime: 0` and is reset when the dialog closes, the dialog state is cleared on close, and a failed clipboard write selects the text instead. The captured screenshots mask the field. One unmasked screenshot of an earlier layout run (an invitation that the run revoked at its end) was deleted and recaptured with the mask before anything was kept.

Bugs in my own scripts found and fixed on the way: the layout check ran against a stack that was still starting (the wrapper now has `-Up`), the flow clicked a banner sentence instead of the button (`text=` matches substrings), and a race that read the first row's role instead of the new member's.

#### C. Parity with the locked screenshots (1440 x 900 and 390 x 844)

Side by side images: `e2e/parity/stage4/i10/compare/*.png` (locked on the left, app on the right); app captures in `e2e/parity/stage4/i10/app/`.

| State | Result |
|---|---|
| Default, desktop | Same layout, columns, controls and spacing. Differences are data, not layout: join dates (the dev database has 16 Nov 2026 for everyone, the prototype has 2 Mar to 21 Aug 2026), order (the API sorts by name, the prototype by seed order) and avatar colours (derived from the user id) |
| Default, mobile | Same stacked rows, same labels and controls; the same data differences |
| Invite with link | Same dialog, banner and copy row. Differences: the email and role fields are read only after the link exists (the prototype leaves them looking editable), the link is masked in the capture, and the link is the real address of this app |
| Loading | Matches after a fix: the first version used a generic line skeleton; it now uses the prototype's table skeleton (filter blocks and rows of four cells) |
| Error | Matches after a fix: the first version had no "Request id" line; the error now carries the `X-Request-ID` header, which the API already exposes. The capture answers with a mocked 500 and the request id from the locked screenshot |
| Only in the prototype | The "View as" role switcher in the header; the Next.js development indicator in the app screenshots (development mode only) |
| Deliberate deviations | A confirm dialog before Remove (D-049; the prototype removes at once); your own row is locked with an explanation (D-049); the explanation is also exposed to screen readers |
| No locked screenshot | The QA Lead read only view, the remove confirmation and the no results state: the locked set only has the Org Admin screens. They are in `e2e/parity/stage4/i10-after/` (`members-lead-*`, `members-remove-*`, `members-no-results-*`) |

Backlog: BL-012 (pager), BL-013 (leave workspace and self demotion).

### I-03 Bugs, backend part (REQ-017, REQ-018, REQ-020, REQ-021, REQ-026, REQ-027, REQ-029, REQ-041, REQ-062; D-050)

The bug list screen and the New bug form are not built yet; this section covers the migration, API-060 to API-064 and API-078 to API-080, their tests and Newman. The frontend part comes after review.

#### A. Checks

| Check | Result |
|---|---|
| Ruff, mypy | Clean; clean (110 files) |
| pytest | 392 passed (243 before; 149 new in `modules/bugs/tests/` plus 8 routes added to the contract test, which also gives every new route its 401 and cross tenant case) |
| Migration `0004_bugs` | up, down, up, and `alembic check` reports no drift. Backend recreated afterwards (head 0004). Tables `bugs`, `bug_labels`, `saved_views`; indexes `(org_id, project_id, status)`, `(org_id, assignee_id)`, `(org_id, updated_at DESC)` (NFR-PERF-04) |
| Newman through `scripts/newman.ps1` | 182 requests, 291 assertions, 0 failed (103 and 155 before; 79 requests and 136 assertions added: Bugs folder with happy, invalid, unauthorized, forbidden and cross tenant for each of the eight endpoints, the all or nothing edit, the label cascade and saved view privacy) |
| OpenAPI | `frontend/openapi.json` and `schema.d.ts` regenerated with `scripts/api-types.sh` |

What the new tests pin down: the numbering (`WEB-1`, per project and per org, a deleted bug's key never reused, 20 bugs created from 10 threads on separate connections get 1 to 20), the Developer rules (severity or priority sent gives 403 and nothing is created; one forbidden field in a PATCH rejects the whole request and nothing is applied; self assign only on an unassigned bug), the open definition against all nine statuses (Fixed and Ready for retest are open; Verified, Closed and Won't fix are not) for the list filter and for both counters, the SLA filter against the Python rule for every severity and status (144 bugs), soft delete (gone from list, search, filters, counts, GET by id and key; the row stays), the label cascade (`bug_labels` rows deleted, the bug stays, the label `bug_count` is the real count), component and environment deletes leaving the bug with none, saved view privacy (even an Org Admin does not see another person's view; another org's view is 404), and search treating `%` and `_` as plain characters.

#### B. Performance of `GET /bugs` (NFR-PERF-01: p95 under 300 ms)

Measured in a throwaway database `qapilot_perf` on the same Postgres server, with a second backend on port 8001 and 5,000 bugs (about 2 percent soft deleted), 5,802 label links, 3 projects, 12 users. The script (`.gate/perf-bugs.py`, not committed) created the database and removed it again in `finally`; it printed "throwaway database removed: yes", and the dev database was never touched. 60 runs per request after 8 warm up requests, real HTTP inside the backend container, so the numbers leave out the browser and the Windows to WSL hop.

| Request | p50 ms | p95 ms | max ms | rows matched |
|---|---|---|---|---|
| default page (25, newest first) | 13.5 | 16.2 | 18.1 | 4887 |
| page_size=100 | 17.1 | 20.2 | 51.8 | 4887 |
| page 40 of size 100 | 20.5 | 24.5 | 28.4 | 4887 |
| open bugs | 13.0 | 15.9 | 46.9 | 3885 |
| status new, triaged and severity critical, high | 11.1 | 13.9 | 15.6 | 489 |
| project and component filter | 10.2 | 14.2 | 15.3 | 143 |
| label filter | 17.9 | 20.3 | 23.4 | 129 |
| assignee filter | 10.0 | 12.6 | 13.5 | 295 |
| sort by severity | 16.8 | 23.4 | 35.8 | 4887 |
| sla_breached=true | 14.3 | 17.2 | 57.6 | 3811 |
| sla_breached=true, open, sort by priority | 14.7 | 17.4 | 19.0 | 3204 |
| search "timeout" (about 1 bug in 8) | 38.3 | 40.9 | 42.9 | 612 |
| search "shipment 12" (title substring) | 41.3 | 43.8 | 44.4 | 60 |
| search "stops responding" (description, every bug) | 39.1 | 44.3 | 47.6 | 4887 |
| search by key "web-12" | 44.0 | 54.0 | 70.3 | 108 |
| search with no match | 39.6 | 45.1 | 48.3 | 0 |
| search with filters and sort | 33.0 | 37.0 | 66.3 | 360 |

Worst p95 is 54 ms against the 300 ms limit. Search is the slowest part, about three times a filtered list, because `ILIKE '%term%'` scans the table; it is not close to the limit at this size, so no trigram index item was added to the backlog. It grows with the number of bugs in the org, so it is worth re measuring when the seed (I-12, about 60 bugs per scenario) or a real workspace gets much larger than this.

#### C. Notes for review

* One addition to API-060: the boolean `open` parameter (the "All open" saved view needs it). Multi value filters are repeated parameters (`status=new&status=triaged`) rather than `status[]` (D-050).
* `release_id` and `source_run_result_id` are stored without foreign keys until I-08 and I-07; until those modules register their check (`bugs/application/hooks.py`) any such id is refused with 422.
* Component, environment and label deletes need no hook in the bugs module: the foreign keys do the work (`SET NULL` for the first two, `CASCADE` for `bug_labels`). The I-01 `on_component_deleted` hook stays unused.
* The BL-011 Undo on the label delete toast stays out of I-03 (product owner). The Labels tab confirm will say how many bugs lose the label, using the real count, in the frontend part.

#### D. Backend addition after review: the unassigned filter (D-051)

`unassigned=true` on `GET /bugs` returns bugs nobody is assigned to (`false` the assigned ones); `assignee_id` together with `unassigned=true` is a 422, and saved view filters accept the key with the same rule. Evidence: pytest 399 passed (ruff and mypy clean), Newman 184 requests and 295 assertions, 0 failed, OpenAPI types regenerated. Commits `9668292`, `3db68b2`, `ccf7f02`.

### I-03 Bugs, frontend part (SCR-08, SCR-11; D-051)

The bug list with saved views, the New bug form and the label delete confirmation with the real count.

#### E. Checks

| Check | Result |
|---|---|
| Lint, typecheck, `next build` | Run in one off containers in WSL with the dev server stopped (not on Windows): clean; clean; builds, and the route list has `/o/[org]/bugs` and `/o/[org]/bugs/new`. The `.next` cache volume was emptied afterwards, the dev server restarted and `/login` answers 200 |
| Layout check through `with-wsl.ps1 -Up` | PASS, 445 states (was 255) at 360, 390, 768, 1024, 1280, 1440, 1920, 2560, 1280 zoom 200 and 1920 zoom 200. Screenshots in `e2e/parity/stage4/i03-after/` |
| `e2e/scripts/check-bugs-flow.mjs` | PASS: a QA Engineer reports a bug (High, P2, a label) and finds it as `LAYT-n`; a Developer reports one and the real request has no `severity`, `priority`, `release_id` or `source_run_result_id` (the bug comes back Medium and P3); the Unassigned filter lists only unassigned bugs; Status, search and More filters (priority) narrow the list; a saved view is created, applied, still applied after a reload, invisible to another person, and deleted through its confirmation; a bug key link opens the placeholder; the label delete confirmation says "It will be removed from 1 bug. The bug itself stays." and the bug keeps existing without the label |
| Backend suites | ruff and mypy clean, pytest 399 passed, Newman 184 requests and 295 assertions, 0 failed |

States added to the layout check: bug list (admin) with a 200 character title, a 158 character unbroken word, a bug with 8 labels and a 59 character component; More filters open with a project and the long component; Save view dialog and its name taken error; the long named saved view applied; delete view confirmation; no results; Past SLA badge (the API cannot backdate a bug, so the check edits the list response to show the badge); loading (response held back); error (a mocked 500 with a request id); empty workspace ("No bugs yet", in the long names workspace); the list as Developer and as Viewer (no Report bug button); New bug as Org Admin, with the error banner, with long text in every field and every label picked, as Developer (severity and priority disabled with the hint, checked) and as Viewer (no access); the delete label confirmation in Settings. The fixtures are created and removed through the API: bugs are soft deleted (the keys stay used) and the fixture project is archived again.

What the checks found and fixed on the way: the sort chevron I had rotated pointed sideways (the icon already points down); the Save view tab put its plus icon above the text; two filter changes made faster than one render could overwrite each other in the first version of the flow script (the script now waits for the URL like a person), and a search that settled late could undo a view applied after it (typing is now only written to the URL while it is still unsent). One real limit remains: two filter changes made within a single render (milliseconds apart, not possible by hand) can lose the first one.

Flow script notes: the Playwright request body of the app's `fetch(Request)` calls cannot be read, so the first version of the Developer check passed on an empty body. It now records the real body inside the page and fails if no body was read. Test views are private to each person, so a failed run left three views behind; the script now removes `flow-i03-` views of every user it signs in as through the API in `finally`, and only those (a listing script with a dry run, `.gate/views-left.mjs`, showed exactly those three before they were deleted). The failure path of that cleanup was not exercised after the change; the normal path was (0 views left).

#### F. Parity with the locked screenshots (1440 x 900 and 390 x 844)

Side by side images: `e2e/parity/stage4/i03/compare/*.png` (locked on the left, app on the right); app captures in `e2e/parity/stage4/i03/app/`.

| State | Result |
|---|---|
| Bug list, default, desktop and mobile | Same page head, view tabs, filter row, table columns, badges, key, pager. Data differs (the dev database has the Layout fixture project and the parity bugs, all New, none past SLA). Row assignee names wrap in the app when the title column is wide because of the fixture titles |
| Bug list, no results ("refund") | Same state box, title and text |
| Bug list, loading and error | Same table skeleton; same error box with the request id |
| New bug, default and error, desktop and mobile | Same fields, order and styling. The error banner lists the fields that failed (the prototype's example says project and title; the app preselects a project, so it names the title only) |
| Differences by decision | No "Critical in prod" tab (BL-016); no Export CSV button (API-133, I-09); the Status select shows "Open (not finished)" instead of "Any status" because that is what the list really filters (D-051); a "More filters" button after the five controls; the search placeholder says "Search key, title or description"; the pager buttons are real; no "View as" switcher (as on Members) |
| Differences until their issues | No AI Bug Writer panel (the form is one column, 860 px wide), no duplicate warning, no file drop zone (I-15, I-05); the New bug AI and AI loading screenshots are not captured; Labels are a pick list of existing labels instead of a free text box (BL-015); Environment starts at None (the prototype starts at prod); bug key links open the "on its way" placeholder until I-05 |
| No locked screenshot | Save view and delete view dialogs, More filters row, empty workspace, Developer and Viewer forms: in `i03-after/` (`bugs-save-view-*`, `bugs-delete-view-*`, `bugs-more-filters-*`, `bugs-empty-*`, `bug-new-developer-*`, `bug-new-viewer-*`) |

Backlog: BL-015 (create a label on the spot), BL-016 (`is_production` flag), BL-017 (rename a saved view).
