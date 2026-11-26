# Parity report: built screens against the locked design

Locked screens: `design/screenshots/` (index: `design/screenshots/INDEX.md`) and `design/reference/approved.html`. Built screens are captured by `e2e/scripts/capture-*-parity.mjs` into `e2e/parity/stage4/<issue>/` (git ignored; the CI parity job produces them on every run) and compared at 1440 x 900 and 390 x 844. Each issue's comparison and every accepted difference is written in its section of `docs/reviews/STAGE_4_REVIEW.md`.

Result: all 22 screens (SCR-01 to SCR-22) are built and were compared. Real differences were fixed in the issue that found them; the rest are accepted differences, listed below.

| Screen | Locked screenshots (`design/screenshots/`) | Compared in | Result |
|---|---|---|---|
| SCR-01 Login | `login-*` | Stage 3 | Matches; error and loading too |
| SCR-02 Register | `register-*` | Stage 3 | Matches |
| SCR-03 Org setup | `org-setup-*` | Stage 3 | Matches |
| SCR-04 Invite | `invite-*` | Stage 3 | Matches |
| SCR-05 Dashboard | `dashboard-*` | Stage 3, I-09, I-13 | Matches, four states; 1920 and 2560 px fixed (stage4-setup) |
| SCR-06 Projects | `projects-*` | I-13 | Built in I-13 (was missing); matches, four states and mobile |
| SCR-07 Project overview | `project-overview-*` | I-13 | Error and loading heads fixed; matches |
| SCR-08 Bug list | `bug-list-*` | I-03 | Matches |
| SCR-09 Board | `board-*` | I-04 | Matches |
| SCR-10 Bug detail | `bug-detail-*` | I-05, I-16 | Matches, including the AI triage panel |
| SCR-11 New bug | `bug-new-*` | I-03, I-15 | Matches, including the AI panel and duplicate warning |
| SCR-12 Test suites | `test-suites-*` | I-06 | Matches |
| SCR-13 Test case editor | `test-case-editor-*` | I-06, I-17 | Matches, including the generator |
| SCR-14 Test runs | `test-runs-*` | I-07 | Matches |
| SCR-15 Test run | `test-run-*` | I-07 | Matches |
| SCR-16 Releases | `releases-*` | I-08 | Matches |
| SCR-17 Release detail | `release-detail-*` | I-08, I-18 | Matches, including the summary panel |
| SCR-18 Reports | `reports-*` | I-09 | Matches |
| SCR-19 Members | `members-*` | I-10 | Matches |
| SCR-20 Settings | `settings-*` | I-11 | Matches |
| SCR-21 AI usage | `ai-usage-*` | I-19 | Matches |
| SCR-22 Not found | `not-found-*` | Stage 3 | Matches |

## Accepted differences (by decision)

* Dialogs the prototype only showed as a toast (Add component, Add environment, Complete run) are real dialogs or confirmations.
* New test run has a Project field; suites are toggle buttons, not 13 px checkboxes, so touch targets stay at 44 px.
* Project overview shows the project's real components and figures, plus an "All runs" link.
* Numbers differ from the prototype where the screen shows real data.
* Layout beyond the locked widths (320 to 430, 768, 1024, 1280, 1920, 2560 px, 200 percent zoom) has no locked screenshot; it follows the responsive rule (D-044) and is checked by `check-app-layout.mjs`.

## Known gaps

* The captured parity images are not committed (size, and they are regenerated); the table above points to the review sections that record each comparison.
* I-20 to I-22 changed no screen, so no new parity capture was taken for them.
