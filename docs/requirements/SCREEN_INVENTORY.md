# Screen Inventory

App routes use the org slug (D-029). The prototype uses hash routes with the same path, for example `approved.html#/o/acme/bugs`.

## 1. Screenshot naming

`design/screenshots/<slug>-<state>-<viewport>.png`
* `state`: `default`, `empty`, `loading`, `error`, or a named variant (for example `ai`).
* `viewport`: `desktop` (1440x900) or `mobile` (390x844).
* Every screen gets `default-desktop` and `default-mobile`. Extra states are captured at desktop size. The full list of planned files is in section 3.

## 2. Screens

| ID | Screen | Route | Roles | REQs | States | Slug |
|---|---|---|---|---|---|---|
| SCR-01 | Login | `/login` | Public | REQ-002, REQ-003, REQ-010 | default, error (wrong credentials), loading (submitting), mobile | `login` |
| SCR-02 | Register | `/register` | Public | REQ-001, REQ-010 | default, error (validation), mobile | `register` |
| SCR-03 | Org setup | `/onboarding/org` | Signed in, no org | REQ-004 | default, error (slug taken), mobile | `org-setup` |
| SCR-04 | Accept invitation | `/invite/{token}` | Public preview, signed in to accept | REQ-006 | default, error (expired link), mobile | `invite` |
| SCR-05 | Dashboard | `/o/{org}/dashboard` | All | REQ-038, REQ-041, REQ-005 | default, empty (new org), loading, error, mobile | `dashboard` |
| SCR-06 | Projects | `/o/{org}/projects` | All (create: Admin, Lead) | REQ-013 | default, empty, loading, error, mobile | `projects` |
| SCR-07 | Project overview | `/o/{org}/projects/{key}` | All (manage: Admin, Lead) | REQ-013, REQ-014, REQ-015, REQ-016 | default, empty (no bugs), loading, error, mobile | `project-overview` |
| SCR-08 | Bug list | `/o/{org}/bugs` | All | REQ-020, REQ-026, REQ-027, REQ-041, REQ-062 | default, empty (no match), loading, error, mobile | `bug-list` |
| SCR-09 | Kanban board | `/o/{org}/board` | All (drag: per workflow) | REQ-019, REQ-028 | default, empty, loading, error, mobile | `board` |
| SCR-10 | Bug detail | `/o/{org}/bugs/{key}` | All (edit per matrix) | REQ-018 to REQ-025, REQ-029, REQ-045, REQ-049 | default, ai (triage panel with suggestion), loading, error (not found), mobile | `bug-detail` |
| SCR-11 | New bug | `/o/{org}/bugs/new` | Admin, Lead, QA Engineer, Developer | REQ-017, REQ-021, REQ-022, REQ-024, REQ-034, REQ-043, REQ-044, REQ-046, REQ-049 | default, ai (Bug Writer suggestion and duplicate warning), error (validation), loading (AI working), mobile | `bug-new` |
| SCR-12 | Test suites | `/o/{org}/tests` | All (manage: Admin, Lead, QA Engineer) | REQ-030 | default, empty, loading, error, mobile | `test-suites` |
| SCR-13 | Test case editor | `/o/{org}/tests/cases/{id}` and `/o/{org}/tests/cases/new` | All (edit: Admin, Lead, QA Engineer) | REQ-031, REQ-047, REQ-049 | default, ai (generated cases to pick), loading, error, mobile | `test-case-editor` |
| SCR-14 | Test runs | `/o/{org}/runs` | All (create: Admin, Lead, QA Engineer) | REQ-032 | default, empty, loading, error, mobile | `test-runs` |
| SCR-15 | Test run execution | `/o/{org}/runs/{id}` | All (execute: Admin, Lead, QA Engineer) | REQ-033, REQ-034 | default, failed (result marked Fail with "create bug" action), loading, error, mobile | `test-run` |
| SCR-16 | Releases | `/o/{org}/releases` | All (manage: Admin, Lead) | REQ-035, REQ-037 | default, empty, loading, error, mobile | `releases` |
| SCR-17 | Release detail | `/o/{org}/releases/{id}` | All (manage and AI: Admin, Lead) | REQ-035, REQ-036, REQ-037, REQ-048, REQ-049 | default, ai (readiness summary suggestion), loading, error, mobile | `release-detail` |
| SCR-18 | Reports | `/o/{org}/reports` | All | REQ-039, REQ-040 | default, empty (no data in range), loading, error, mobile | `reports` |
| SCR-19 | Members and roles | `/o/{org}/members` | Admin (manage), Lead (read) | REQ-006, REQ-009 | default, invite (invite dialog with link), loading, error, mobile | `members` |
| SCR-20 | Settings | `/o/{org}/settings` | All (tabs per role) | REQ-011, REQ-012, REQ-022, REQ-052, REQ-053 | default (org tab), profile, loading, error, mobile | `settings` |
| SCR-21 | AI usage | `/o/{org}/ai-usage` | Admin, Lead | REQ-042, REQ-051, REQ-052 | default, empty, loading, error, mobile | `ai-usage` |
| SCR-22 | Not found | any unknown route | All | REQ-058 | default, mobile | `not-found` |

Shared layout (not a screen): the app shell with sidebar, header, org switcher, user menu and "Report bug" button appears on SCR-05 to SCR-21 and covers REQ-005, REQ-007 (role aware navigation) and REQ-056.

Cross cutting requirements REQ-007, REQ-008, REQ-055, REQ-056 and REQ-057 apply to every screen.

## 3. Planned screenshot files

Default at both viewports for every screen, extra states at desktop:

| Slug | Files |
|---|---|
| `login` | `login-default-desktop.png`, `login-default-mobile.png`, `login-error-desktop.png`, `login-loading-desktop.png` |
| `register` | `register-default-desktop.png`, `register-default-mobile.png`, `register-error-desktop.png` |
| `org-setup` | `org-setup-default-desktop.png`, `org-setup-default-mobile.png`, `org-setup-error-desktop.png` |
| `invite` | `invite-default-desktop.png`, `invite-default-mobile.png`, `invite-error-desktop.png` |
| `dashboard` | `dashboard-default-desktop.png`, `dashboard-default-mobile.png`, `dashboard-empty-desktop.png`, `dashboard-loading-desktop.png`, `dashboard-error-desktop.png` |
| `projects` | `projects-default-desktop.png`, `projects-default-mobile.png`, `projects-empty-desktop.png`, `projects-loading-desktop.png`, `projects-error-desktop.png` |
| `project-overview` | `project-overview-default-desktop.png`, `project-overview-default-mobile.png`, `project-overview-empty-desktop.png`, `project-overview-loading-desktop.png`, `project-overview-error-desktop.png` |
| `bug-list` | `bug-list-default-desktop.png`, `bug-list-default-mobile.png`, `bug-list-empty-desktop.png`, `bug-list-loading-desktop.png`, `bug-list-error-desktop.png` |
| `board` | `board-default-desktop.png`, `board-default-mobile.png`, `board-empty-desktop.png`, `board-loading-desktop.png`, `board-error-desktop.png` |
| `bug-detail` | `bug-detail-default-desktop.png`, `bug-detail-default-mobile.png`, `bug-detail-ai-desktop.png`, `bug-detail-loading-desktop.png`, `bug-detail-error-desktop.png` |
| `bug-new` | `bug-new-default-desktop.png`, `bug-new-default-mobile.png`, `bug-new-ai-desktop.png`, `bug-new-error-desktop.png`, `bug-new-loading-desktop.png` |
| `test-suites` | `test-suites-default-desktop.png`, `test-suites-default-mobile.png`, `test-suites-empty-desktop.png`, `test-suites-loading-desktop.png`, `test-suites-error-desktop.png` |
| `test-case-editor` | `test-case-editor-default-desktop.png`, `test-case-editor-default-mobile.png`, `test-case-editor-ai-desktop.png`, `test-case-editor-loading-desktop.png`, `test-case-editor-error-desktop.png` |
| `test-runs` | `test-runs-default-desktop.png`, `test-runs-default-mobile.png`, `test-runs-empty-desktop.png`, `test-runs-loading-desktop.png`, `test-runs-error-desktop.png` |
| `test-run` | `test-run-default-desktop.png`, `test-run-default-mobile.png`, `test-run-failed-desktop.png`, `test-run-loading-desktop.png`, `test-run-error-desktop.png` |
| `releases` | `releases-default-desktop.png`, `releases-default-mobile.png`, `releases-empty-desktop.png`, `releases-loading-desktop.png`, `releases-error-desktop.png` |
| `release-detail` | `release-detail-default-desktop.png`, `release-detail-default-mobile.png`, `release-detail-ai-desktop.png`, `release-detail-loading-desktop.png`, `release-detail-error-desktop.png` |
| `reports` | `reports-default-desktop.png`, `reports-default-mobile.png`, `reports-empty-desktop.png`, `reports-loading-desktop.png`, `reports-error-desktop.png` |
| `members` | `members-default-desktop.png`, `members-default-mobile.png`, `members-invite-desktop.png`, `members-loading-desktop.png`, `members-error-desktop.png` |
| `settings` | `settings-default-desktop.png`, `settings-default-mobile.png`, `settings-profile-desktop.png`, `settings-loading-desktop.png`, `settings-error-desktop.png` |
| `ai-usage` | `ai-usage-default-desktop.png`, `ai-usage-default-mobile.png`, `ai-usage-empty-desktop.png`, `ai-usage-loading-desktop.png`, `ai-usage-error-desktop.png` |
| `not-found` | `not-found-default-desktop.png`, `not-found-default-mobile.png` |

Total planned: 100 files. Final mapping is confirmed in Stage 2.
