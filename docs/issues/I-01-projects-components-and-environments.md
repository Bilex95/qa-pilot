# I-01 Projects, components and environments

**Stage:** 4 | **Batch:** 4A (see [DAG](DAG.md)) | **Status:** Done

## Goal / requirement IDs

Org Admins and QA Leads create and archive projects with a key; projects own components and environments.

Requirements: REQ-013, REQ-014, REQ-015, REQ-016

## Scope and exclusions

* Models Project, Component, Environment (DOMAIN_MODEL 1.2) and migration
* Default environments dev, staging, prod created with each project
* Projects list and project overview screens

* Not in this issue: Bug counts on the overview come from I-03 and I-09; show zero until then

## Module ownership / dependencies

* `backend/app/modules/projects`
* `frontend/src/modules/projects`
* Depends on: None
* Migration: `0002_projects: projects, components, environments with org_id first in every index`

## UI states and committed screenshots

Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).

* **SCR-06**: [`projects-default-desktop.png`](../../design/screenshots/projects-default-desktop.png), [`projects-default-mobile.png`](../../design/screenshots/projects-default-mobile.png), [`projects-empty-desktop.png`](../../design/screenshots/projects-empty-desktop.png), [`projects-loading-desktop.png`](../../design/screenshots/projects-loading-desktop.png), [`projects-error-desktop.png`](../../design/screenshots/projects-error-desktop.png)
* **SCR-07**: [`project-overview-default-desktop.png`](../../design/screenshots/project-overview-default-desktop.png), [`project-overview-default-mobile.png`](../../design/screenshots/project-overview-default-mobile.png), [`project-overview-empty-desktop.png`](../../design/screenshots/project-overview-empty-desktop.png), [`project-overview-loading-desktop.png`](../../design/screenshots/project-overview-loading-desktop.png), [`project-overview-error-desktop.png`](../../design/screenshots/project-overview-error-desktop.png)

## API contract

Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-040 | GET | `{O}/projects` | `project.read` | `?include_archived&page` | page of `{id, name, key, description, open_bug_count, archived_at}` | none |
| API-041 | POST | `{O}/projects` | `project.create` | `{name, key, description?}` | 201 project (with default environments) | 409 `key_taken` |
| API-042 | GET | `{O}/projects/{project_id}` | `project.read` | none | project plus components and environments | 404 |
| API-043 | PATCH | `{O}/projects/{project_id}` | `project.update` / `project.archive` | `{name?, description?, archived?}` | project | 422 |
| API-044 | GET | `{O}/projects/{project_id}/components` | `project.read` | none | `[{id, name, description, open_bug_count}]` | 404 |
| API-045 | POST | `{O}/projects/{project_id}/components` | `component.manage` | `{name, description?}` | 201 component | 409 `name_taken` |
| API-046 | PATCH | `{O}/components/{component_id}` | `component.manage` | `{name?, description?}` | component | 409 |
| API-047 | DELETE | `{O}/components/{component_id}` | `component.manage` | none | 204 (bugs unlinked) | none |
| API-048 | GET | `{O}/projects/{project_id}/environments` | `project.read` | none | `[{id, name, sort_order}]` | 404 |
| API-049 | POST | `{O}/projects/{project_id}/environments` | `environment.manage` | `{name}` | 201 environment | 409 |
| API-050 | PATCH | `{O}/environments/{environment_id}` | `environment.manage` | `{name?, sort_order?}` | environment | 409 |
| API-051 | DELETE | `{O}/environments/{environment_id}` | `environment.manage` | none | 204 | 409 `in_use` if runs reference it |

## Authorization, audit, data and edge cases

* project.read for all roles; project.create, project.update, project.archive, component.manage, environment.manage for Org Admin and QA Lead
* Audit: project.created, project.updated, project.archived
* Key 2 to 6 uppercase letters, unique per org (409 key_taken); key cannot change after the first bug
* Archived projects are hidden from pickers but readable; archiving twice is a no op
* Component names unique per project (409); deleting a component in use unlinks bugs (I-03 contract)
* Environment in use by a run cannot be deleted (409 in_use)
* Every query filters by `org_id`; ids from another org return 404 (D-003)

## Tests

* pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), cross tenant (404, covered by the contract test plus a resource id from the other org)
* Postman: requests for the same five cases in the module folder; Newman green
* OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green
* Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review
* Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, including its menus, dialogs and long text (D-044); before and after screenshots in the stage review
* default, empty, loading and error states match the locked screenshots

## Acceptance checklist

- [ ] Lead creates project WEB; key WEB-1 style numbering ready for I-03 (`next_bug_number` starts at 1)
- [ ] Developer and Viewer see projects read only; create button hidden and API returns 403
- [ ] Implementation and tests
- [ ] Negative and tenant permission tests
- [ ] Docker and CI pass
- [ ] OpenAPI, Postman, seed or screenshot references updated
- [ ] Evidence in the stage review; no automatic merge
