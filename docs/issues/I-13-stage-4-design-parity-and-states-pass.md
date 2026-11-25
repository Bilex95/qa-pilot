# I-13 Stage 4 design parity and states pass

**Stage:** 4 | **Batch:** 4F (see [DAG](DAG.md)) | **Status:** Done

## Goal / requirement IDs

Check every built screen against the locked screenshots and close the gaps.

Requirements: REQ-055, REQ-056, REQ-057, REQ-058

## Scope and exclusions

* Parity captures for every Stage 4 screen
* Empty, loading, error and mobile states
* axe scan on key screens

* Not in this issue: No redesign; differences are fixed or listed with a reason

## Module ownership / dependencies

* `frontend`
* `e2e`
* Depends on: [I-01](I-01-projects-components-and-environments.md), [I-02](I-02-labels.md), [I-03](I-03-bugs-model-create-edit-list-search-and-saved-vie.md), [I-04](I-04-bug-workflow-transitions-and-kanban-board.md), [I-05](I-05-bug-detail-comments-attachments-and-activity.md), [I-06](I-06-test-suites-and-test-cases.md), [I-07](I-07-test-runs-results-and-bug-from-a-failed-step.md), [I-08](I-08-releases-and-readiness.md), [I-09](I-09-dashboard-and-reports.md), [I-10](I-10-members-and-invitations-screen.md), [I-11](I-11-settings-organization-ai-switch-audit-log-and-pr.md), [I-12](I-12-seed-data-for-every-scenario.md), [I-23](I-23-password-reset-with-admin-issued-links.md), [I-24](I-24-docker-no-container-left-without-a-network.md)

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-05**: [`dashboard-default-desktop.png`](../../design/screenshots/dashboard-default-desktop.png), [`dashboard-default-mobile.png`](../../design/screenshots/dashboard-default-mobile.png), [`dashboard-empty-desktop.png`](../../design/screenshots/dashboard-empty-desktop.png), [`dashboard-loading-desktop.png`](../../design/screenshots/dashboard-loading-desktop.png), [`dashboard-error-desktop.png`](../../design/screenshots/dashboard-error-desktop.png)
* **SCR-06**: [`projects-default-desktop.png`](../../design/screenshots/projects-default-desktop.png), [`projects-default-mobile.png`](../../design/screenshots/projects-default-mobile.png), [`projects-empty-desktop.png`](../../design/screenshots/projects-empty-desktop.png), [`projects-loading-desktop.png`](../../design/screenshots/projects-loading-desktop.png), [`projects-error-desktop.png`](../../design/screenshots/projects-error-desktop.png)
* **SCR-07**: [`project-overview-default-desktop.png`](../../design/screenshots/project-overview-default-desktop.png), [`project-overview-default-mobile.png`](../../design/screenshots/project-overview-default-mobile.png), [`project-overview-empty-desktop.png`](../../design/screenshots/project-overview-empty-desktop.png), [`project-overview-loading-desktop.png`](../../design/screenshots/project-overview-loading-desktop.png), [`project-overview-error-desktop.png`](../../design/screenshots/project-overview-error-desktop.png)
* **SCR-08**: [`bug-list-default-desktop.png`](../../design/screenshots/bug-list-default-desktop.png), [`bug-list-default-mobile.png`](../../design/screenshots/bug-list-default-mobile.png), [`bug-list-empty-desktop.png`](../../design/screenshots/bug-list-empty-desktop.png), [`bug-list-loading-desktop.png`](../../design/screenshots/bug-list-loading-desktop.png), [`bug-list-error-desktop.png`](../../design/screenshots/bug-list-error-desktop.png)
* **SCR-09**: [`board-default-desktop.png`](../../design/screenshots/board-default-desktop.png), [`board-default-mobile.png`](../../design/screenshots/board-default-mobile.png), [`board-empty-desktop.png`](../../design/screenshots/board-empty-desktop.png), [`board-loading-desktop.png`](../../design/screenshots/board-loading-desktop.png), [`board-error-desktop.png`](../../design/screenshots/board-error-desktop.png)
* **SCR-10**: [`bug-detail-default-desktop.png`](../../design/screenshots/bug-detail-default-desktop.png), [`bug-detail-default-mobile.png`](../../design/screenshots/bug-detail-default-mobile.png), [`bug-detail-ai-desktop.png`](../../design/screenshots/bug-detail-ai-desktop.png), [`bug-detail-loading-desktop.png`](../../design/screenshots/bug-detail-loading-desktop.png), [`bug-detail-error-desktop.png`](../../design/screenshots/bug-detail-error-desktop.png)
* **SCR-11**: [`bug-new-default-desktop.png`](../../design/screenshots/bug-new-default-desktop.png), [`bug-new-default-mobile.png`](../../design/screenshots/bug-new-default-mobile.png), [`bug-new-ai-desktop.png`](../../design/screenshots/bug-new-ai-desktop.png), [`bug-new-error-desktop.png`](../../design/screenshots/bug-new-error-desktop.png), [`bug-new-loading-desktop.png`](../../design/screenshots/bug-new-loading-desktop.png)
* **SCR-12**: [`test-suites-default-desktop.png`](../../design/screenshots/test-suites-default-desktop.png), [`test-suites-default-mobile.png`](../../design/screenshots/test-suites-default-mobile.png), [`test-suites-empty-desktop.png`](../../design/screenshots/test-suites-empty-desktop.png), [`test-suites-loading-desktop.png`](../../design/screenshots/test-suites-loading-desktop.png), [`test-suites-error-desktop.png`](../../design/screenshots/test-suites-error-desktop.png)
* **SCR-13**: [`test-case-editor-default-desktop.png`](../../design/screenshots/test-case-editor-default-desktop.png), [`test-case-editor-default-mobile.png`](../../design/screenshots/test-case-editor-default-mobile.png), [`test-case-editor-ai-desktop.png`](../../design/screenshots/test-case-editor-ai-desktop.png), [`test-case-editor-loading-desktop.png`](../../design/screenshots/test-case-editor-loading-desktop.png), [`test-case-editor-error-desktop.png`](../../design/screenshots/test-case-editor-error-desktop.png)
* **SCR-14**: [`test-runs-default-desktop.png`](../../design/screenshots/test-runs-default-desktop.png), [`test-runs-default-mobile.png`](../../design/screenshots/test-runs-default-mobile.png), [`test-runs-empty-desktop.png`](../../design/screenshots/test-runs-empty-desktop.png), [`test-runs-loading-desktop.png`](../../design/screenshots/test-runs-loading-desktop.png), [`test-runs-error-desktop.png`](../../design/screenshots/test-runs-error-desktop.png)
* **SCR-15**: [`test-run-default-desktop.png`](../../design/screenshots/test-run-default-desktop.png), [`test-run-default-mobile.png`](../../design/screenshots/test-run-default-mobile.png), [`test-run-failed-desktop.png`](../../design/screenshots/test-run-failed-desktop.png), [`test-run-loading-desktop.png`](../../design/screenshots/test-run-loading-desktop.png), [`test-run-error-desktop.png`](../../design/screenshots/test-run-error-desktop.png)
* **SCR-16**: [`releases-default-desktop.png`](../../design/screenshots/releases-default-desktop.png), [`releases-default-mobile.png`](../../design/screenshots/releases-default-mobile.png), [`releases-empty-desktop.png`](../../design/screenshots/releases-empty-desktop.png), [`releases-loading-desktop.png`](../../design/screenshots/releases-loading-desktop.png), [`releases-error-desktop.png`](../../design/screenshots/releases-error-desktop.png)
* **SCR-17**: [`release-detail-default-desktop.png`](../../design/screenshots/release-detail-default-desktop.png), [`release-detail-default-mobile.png`](../../design/screenshots/release-detail-default-mobile.png), [`release-detail-ai-desktop.png`](../../design/screenshots/release-detail-ai-desktop.png), [`release-detail-loading-desktop.png`](../../design/screenshots/release-detail-loading-desktop.png), [`release-detail-error-desktop.png`](../../design/screenshots/release-detail-error-desktop.png)
* **SCR-18**: [`reports-default-desktop.png`](../../design/screenshots/reports-default-desktop.png), [`reports-default-mobile.png`](../../design/screenshots/reports-default-mobile.png), [`reports-empty-desktop.png`](../../design/screenshots/reports-empty-desktop.png), [`reports-loading-desktop.png`](../../design/screenshots/reports-loading-desktop.png), [`reports-error-desktop.png`](../../design/screenshots/reports-error-desktop.png)
* **SCR-19**: [`members-default-desktop.png`](../../design/screenshots/members-default-desktop.png), [`members-default-mobile.png`](../../design/screenshots/members-default-mobile.png), [`members-invite-desktop.png`](../../design/screenshots/members-invite-desktop.png), [`members-loading-desktop.png`](../../design/screenshots/members-loading-desktop.png), [`members-error-desktop.png`](../../design/screenshots/members-error-desktop.png)
* **SCR-20**: [`settings-default-desktop.png`](../../design/screenshots/settings-default-desktop.png), [`settings-default-mobile.png`](../../design/screenshots/settings-default-mobile.png), [`settings-profile-desktop.png`](../../design/screenshots/settings-profile-desktop.png), [`settings-loading-desktop.png`](../../design/screenshots/settings-loading-desktop.png), [`settings-error-desktop.png`](../../design/screenshots/settings-error-desktop.png)
* **SCR-22**: [`not-found-default-desktop.png`](../../design/screenshots/not-found-default-desktop.png), [`not-found-default-mobile.png`](../../design/screenshots/not-found-default-mobile.png)

## Authorization, audit, data and edge cases

* Every screen at 320 to 1440 px with no sideways scroll and 44 px targets up to 1024 px (D-035)
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Stage 4 review lists every parity difference
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
