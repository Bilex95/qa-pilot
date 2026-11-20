# API Inventory

## 1. Conventions (REQ-054)

* Base path `/api/v1`. Tenant routes start with `/api/v1/orgs/{org_id}` (written `{O}` below, D-002).
* Auth: `Authorization: Bearer <access JWT>` on every route except those marked Public.
* Role column uses the action keys from `PERSONAS_AND_ROLES.md`; the server checks membership first, then the action.
* JSON in and out, snake_case fields, ISO 8601 UTC timestamps.
* **Error envelope** for every non 2xx: `{"error": {"code": "string", "message": "string", "details": {} | []}}`.
* **Pagination** (D-004): `?page=1&page_size=25` (max 100) returns `{"items": [...], "page": 1, "page_size": 25, "total": 123}`.
* Every response carries `X-Request-ID` (echoed from the request or generated).
* OpenAPI at `/api/v1/openapi.json`, docs at `/api/v1/docs`.

### Standard errors (apply to every endpoint, not repeated)

| Status | Code | When |
|---|---|---|
| 401 | `unauthorized` | Missing, expired or invalid access token |
| 403 | `forbidden` | Member, but role lacks the action |
| 404 | `org_not_found` | Not a member of `{org_id}` (D-003) |
| 404 | `not_found` | Resource missing, deleted, or in another org |
| 422 | `validation_error` | Body or query invalid; `details` lists `{loc, msg}` |
| 429 | `rate_limited` | Throttle hit; `Retry-After` header set |
| 500 | `internal_error` | Unexpected; message is generic, request id included |

### Shared shapes

* `UserSummary`: `{id, full_name, email}`
* `BugSummary`: `{id, key, title, status, severity, priority, project_id, assignee: UserSummary|null, labels: [{id,name,color}], updated_at, sla_breached}`
* `Bug`: `BugSummary` plus `{description, steps_to_reproduce: [str], expected_result, actual_result, component, environment, reporter, release, source_run_result_id, ai_assisted, created_at, resolved_at, closed_at, comment_count, attachment_count}`

## 2. Endpoints

### 2.1 Health

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-001 | GET | `/api/v1/health` | Public | none | `{status:"ok", db:"ok", version}` | 503 `db_unavailable` |

### 2.2 Auth (module `auth`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-010 | POST | `/auth/register` | Public | `{full_name, email, password}` | 201 `{access_token, refresh_token, user}` | 409 `email_taken`, 422 |
| API-011 | POST | `/auth/login` | Public | `{email, password}` | `{access_token, refresh_token, user}` | 401 `invalid_credentials`, 429 |
| API-012 | POST | `/auth/refresh` | Public (refresh token) | `{refresh_token}` | `{access_token, refresh_token}` | 401 `invalid_refresh_token` |
| API-013 | POST | `/auth/logout` | Signed in | `{refresh_token}` | 204 | none |
| API-014 | GET | `/auth/me` | Signed in | none | `{user, memberships:[{org:{id,name,slug,ai_enabled}, role}], pending_invitations:[...]}` | none |
| API-015 | PATCH | `/auth/me` | Signed in | `{full_name}` | `user` | 422 |
| API-016 | POST | `/auth/me/password` | Signed in | `{current_password, new_password}` | 204 | 400 `wrong_password`, 422 |

### 2.3 Orgs, members, invitations (module `orgs`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-020 | POST | `/orgs` | Signed in | `{name, slug}` | 201 `{org, membership}` | 409 `slug_taken` |
| API-021 | GET | `/orgs` | Signed in | none | `[{org, role}]` (my orgs) | none |
| API-022 | GET | `{O}` | `org.read` | none | `{id, name, slug, ai_enabled, ai_daily_limit, my_role}` | 404 |
| API-023 | PATCH | `{O}` | `org.update_settings` | `{name?, ai_enabled?, ai_daily_limit?}` | org | 403, 422 |
| API-024 | GET | `{O}/members` | `member.list_basic` (full fields for `member.list`) | `?page&q&role` | page of `{membership_id, user: UserSummary, role, joined_at}` | none |
| API-025 | PATCH | `{O}/members/{membership_id}` | `member.update_role` | `{role}` | membership | 409 `last_admin` |
| API-026 | DELETE | `{O}/members/{membership_id}` | `member.remove` | none | 204 | 409 `last_admin` |
| API-027 | POST | `{O}/invitations` | `invitation.create` | `{email, role}` | 201 `{id, email, role, expires_at, invite_url}` (url shown once) | 409 `already_member` |
| API-028 | GET | `{O}/invitations` | `invitation.list` | `?status` | list of invitations without token | none |
| API-029 | DELETE | `{O}/invitations/{invitation_id}` | `invitation.revoke` | none | 204 | none |
| API-030 | GET | `/invitations/{token}` | Public | none | `{org_name, role, email_masked, expires_at}` | 410 `invitation_invalid` |
| API-031 | POST | `/invitations/{token}/accept` | Signed in (email must match) | none | `{org, membership}` | 403 `email_mismatch`, 410 |

### 2.4 Projects (module `projects`)

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
| API-052 | GET | `{O}/labels` | `org.read` | none | `[{id, name, color}]` | none |
| API-053 | POST | `{O}/labels` | `label.manage` | `{name, color}` | 201 label | 409 |
| API-054 | DELETE | `{O}/labels/{label_id}` | `label.manage` | none | 204 | none |

### 2.5 Bugs (module `bugs`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-060 | GET | `{O}/bugs` | `bug.read` | `?project_id&status[]&severity[]&priority[]&assignee_id&reporter_id&component_id&environment_id&label_id&release_id&sla_breached&q&sort=-updated_at&page&page_size` | page of `BugSummary` | 422 |
| API-061 | POST | `{O}/bugs` | `bug.create` | `{project_id, title, description?, steps_to_reproduce?, expected_result?, actual_result?, severity?, priority?, component_id?, environment_id?, label_ids?, assignee_id?, release_id?, source_run_result_id?, ai_assisted?}` | 201 `Bug` | 403 (developer sets severity), 422 |
| API-062 | GET | `{O}/bugs/{bug_ref}` | `bug.read` | `bug_ref` is a UUID or key like `WEB-42` | `Bug` | 404 |
| API-063 | PATCH | `{O}/bugs/{bug_id}` | `bug.update_fields`, `bug.set_severity_priority`, `bug.assign` per field | any editable field | `Bug` | 403, 422 |
| API-064 | DELETE | `{O}/bugs/{bug_id}` | `bug.delete` | none | 204 | none |
| API-065 | GET | `{O}/bugs/{bug_id}/transitions` | `bug.read` | none | `{current, allowed:[status]}` for the caller | none |
| API-066 | POST | `{O}/bugs/{bug_id}/transitions` | `bug.transition` | `{to_status, comment?}` | `Bug` | 403, 409 `invalid_transition` |
| API-067 | GET | `{O}/bug-workflow` | `bug.read` | none | `{statuses:[...], transitions:[{from,to,roles}]}` | none |
| API-068 | GET | `{O}/bugs/board` | `bug.read` | `?project_id&assignee_id&severity[]&q` | `{columns:[{status, total, items:[BugSummary] (first 50)}]}` | 422 |
| API-069 | GET | `{O}/bugs/{bug_id}/comments` | `bug.read` | `?page` | page of `{id, author, body, created_at, edited_at}` | none |
| API-070 | POST | `{O}/bugs/{bug_id}/comments` | `comment.create` | `{body}` | 201 comment | 422 |
| API-071 | PATCH | `{O}/comments/{comment_id}` | `comment.update` (own) | `{body}` | comment | 403 |
| API-072 | DELETE | `{O}/comments/{comment_id}` | `comment.delete` | none | 204 | 403 |
| API-073 | GET | `{O}/bugs/{bug_id}/attachments` | `bug.read` | none | `[{id, filename, content_type, size_bytes, uploaded_by, created_at}]` | none |
| API-074 | POST | `{O}/bugs/{bug_id}/attachments` | `attachment.upload` | multipart `file` | 201 attachment | 413 `file_too_large`, 415 `unsupported_type`, 409 `too_many_files` |
| API-075 | GET | `{O}/attachments/{attachment_id}/download` | `attachment.download` | none | file stream, `Content-Disposition: attachment` | 404 |
| API-076 | DELETE | `{O}/attachments/{attachment_id}` | `attachment.delete` | none | 204 | 403 |
| API-077 | GET | `{O}/bugs/{bug_id}/activity` | `bug.read` | `?page` | page of `{id, kind, actor, field, old_value, new_value, created_at}` | none |
| API-078 | GET | `{O}/saved-views` | `saved_view.manage` | none | `[{id, name, filters}]` (mine) | none |
| API-079 | POST | `{O}/saved-views` | `saved_view.manage` | `{name, filters}` | 201 view | 422 |
| API-080 | DELETE | `{O}/saved-views/{view_id}` | `saved_view.manage` (own) | none | 204 | 404 |

### 2.6 Test management (module `testing`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-090 | GET | `{O}/test-suites` | `test.read` | `?project_id&page` | page of `{id, name, project_id, component, case_count, last_run_pass_rate}` | none |
| API-091 | POST | `{O}/test-suites` | `suite.manage` | `{project_id, name, description?, component_id?}` | 201 suite | 422 |
| API-092 | GET | `{O}/test-suites/{suite_id}` | `test.read` | none | suite | 404 |
| API-093 | PATCH | `{O}/test-suites/{suite_id}` | `suite.manage` | `{name?, description?, component_id?}` | suite | 422 |
| API-094 | DELETE | `{O}/test-suites/{suite_id}` | `suite.manage` | none | 204 (soft) | none |
| API-095 | GET | `{O}/test-suites/{suite_id}/cases` | `test.read` | `?tag&case_type (positive, negative, edge)&page` | page of `{id, title, priority, case_type, tags, step_count, ai_generated}` | none |
| API-096 | POST | `{O}/test-suites/{suite_id}/cases` | `case.manage` | `{title (5 to 200 chars), preconditions?, steps:[{action, expected}], tags?, priority?, case_type? (positive, negative, edge)}` | 201 case | 422 |
| API-097 | GET | `{O}/test-cases/{case_id}` | `test.read` | none | full case | 404 |
| API-098 | PATCH | `{O}/test-cases/{case_id}` | `case.manage` | any case field | case | 422 |
| API-099 | DELETE | `{O}/test-cases/{case_id}` | `case.manage` | none | 204 (soft) | none |
| API-100 | POST | `{O}/test-suites/{suite_id}/cases/bulk` | `case.manage` | `{cases:[case input], ai_usage_id?}` (max 50) | 201 `{created:[case]}` | 422 |
| API-101 | GET | `{O}/test-runs` | `test.read` | `?project_id&status&release_id&page` | page of `{id, name, status, environment, release, counts:{pass,fail,blocked,skipped,untested}, pass_rate, created_at}` | none |
| API-102 | POST | `{O}/test-runs` | `run.create` | `{project_id, name, environment_id?, release_id?, suite_ids?, case_ids?}` | 201 run with results | 422 (no cases) |
| API-103 | GET | `{O}/test-runs/{run_id}` | `test.read` | none | run with results (snapshot steps, result, linked bug keys) | 404 |
| API-104 | PATCH | `{O}/test-runs/{run_id}` | `run.complete` | `{name?, status?: "completed", release_id?}` | run | 409 `run_completed` |
| API-105 | PATCH | `{O}/test-runs/{run_id}/results/{result_id}` | `run.execute` | `{result, failed_step_index?, actual_result?, note?}` | result | 409 `run_completed`, 422 |
| API-106 | GET | `{O}/test-runs/{run_id}/results/{result_id}/bug-draft` | `run.bug_from_failure` | none | prefilled bug input with `source_run_result_id` | 409 `result_not_failed` |

### 2.7 Releases (module `releases`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-110 | GET | `{O}/releases` | `release.read` | `?project_id&status&page` | page of `{id, name, project_id, status, target_date, readiness, open_bug_count, pass_rate}` | none |
| API-111 | POST | `{O}/releases` | `release.manage` | `{project_id, name, target_date?, description?}` | 201 release | 409 `name_taken` |
| API-112 | GET | `{O}/releases/{release_id}` | `release.read` | none | release with linked bugs summary, runs summary, readiness, ai_summary | 404 |
| API-113 | PATCH | `{O}/releases/{release_id}` | `release.manage` | `{name?, target_date?, description?, status?, ai_summary?, ai_usage_id?}` | release | 422 |
| API-114 | DELETE | `{O}/releases/{release_id}` | `release.manage` | none | 204 (unlinks bugs and runs) | 409 `released` |
| API-115 | GET | `{O}/releases/{release_id}/readiness` | `release.read` | none | `{status, reasons:[str], metrics:{open_by_severity, pass_rate, runs_in_progress, linked_runs}}` | 404 |
| API-116 | POST | `{O}/releases/{release_id}/bugs` | `release.manage` | `{bug_ids:[uuid]}` | `{linked: n}` | 422 (bug from other project) |
| API-117 | DELETE | `{O}/releases/{release_id}/bugs/{bug_id}` | `release.manage` | none | 204 | none |
| API-118 | POST | `{O}/releases/{release_id}/runs` | `release.manage` | `{run_ids:[uuid]}` | `{linked: n}` | 422 |
| API-119 | DELETE | `{O}/releases/{release_id}/runs/{run_id}` | `release.manage` | none | 204 | none |

### 2.8 Dashboard and reports (module `dashboard`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-130 | GET | `{O}/dashboard` | `dashboard.read` | `?project_id` | `{open_by_severity, sla_breached, trend:[{date, opened, closed}] (30 days), pass_rate:{last_7_days, runs}, top_components:[{name, open}], releases:[{id, name, readiness}], my_assigned_count}` | none |
| API-131 | GET | `{O}/reports/bug-trend` | `report.read` | `?project_id&from&to&interval=day|week` | `[{date, opened, closed, open_total}]` | 422 (range over 366 days) |
| API-132 | GET | `{O}/reports/summary` | `report.read` | `?project_id&from&to` | `{by_status, by_severity, by_component, by_assignee, run_pass_rate}` | 422 |
| API-133 | GET | `{O}/reports/bugs.csv` | `report.export` | same filters as API-060 | `text/csv` | 422 |

### 2.9 AI (module `ai`); schemas in `AI_SPEC.md`

All AI endpoints: check `ai_enabled` (403 `ai_disabled`), rate limits (429), write one AIUsage row, return `{usage_id, suggestion, provider, fallback: bool}`. They never write domain data (REQ-049).

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-140 | POST | `{O}/ai/bug-writer` | `ai.bug_writer` | `{project_id, notes, log?}` | `BugDraftSuggestion` | 422, 502 `ai_unavailable` (only if fallback also fails) |
| API-141 | POST | `{O}/ai/explain-log` | `ai.explain_log` | `{log}` | `LogExplanation` | 422 |
| API-142 | POST | `{O}/ai/triage` | `ai.triage` | `{bug_id}` or `{project_id, title, description, actual_result}` | `TriageSuggestion` | 404 |
| API-143 | POST | `{O}/ai/duplicates` | `ai.duplicates` | `{project_id, title, actual_result?, steps?, exclude_bug_id?}` | `{candidates:[{bug: BugSummary, score}]}` | 422 |
| API-144 | POST | `{O}/ai/test-cases` | `ai.test_cases` | `{project_id, story, count?: 3..15}` | `GeneratedTestCases` | 422 |
| API-145 | POST | `{O}/ai/release-summary` | `ai.release_summary` | `{release_id}` | `ReleaseSummarySuggestion` | 404 |
| API-146 | GET | `{O}/ai/usage` | `ai.usage_read` | `?feature&user_id&from&to&page` | page of AIUsage rows | none |
| API-147 | GET | `{O}/ai/usage/summary` | `ai.usage_read` | `?from&to` | `{provider, model, totals_by_feature:[{feature, calls, input_tokens, output_tokens, avg_latency_ms, acceptance_rate}], daily_limit, used_today}` | none |
| API-148 | POST | `{O}/ai/usage/{usage_id}/outcome` | caller of the original request | `{outcome: accepted|edited|discarded}` | 204 | 404, 409 `outcome_set` |

### 2.10 Audit (module `audit`)

| ID | Method | Path | Role | Request | Response | Errors |
|---|---|---|---|---|---|---|
| API-150 | GET | `{O}/audit-events` | `audit.read` | `?action&actor_id&entity_type&from&to&page` | page of audit events | none |

## 3. Counts

97 endpoints across 10 groups (counted by `scripts/check_traceability.py`). Every endpoint gets: Pydantic request and response schemas, pytest cases for happy, invalid, unauthorized, forbidden and cross tenant paths, and a Postman request (CLAUDE.md rules).
