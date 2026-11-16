# Personas and Roles

## 1. Personas

| Persona | Role | Context | Goals | Frustrations QA Pilot removes |
|---|---|---|---|---|
| Amara Okafor | Org Admin | Engineering manager at a 40 person SaaS company in Lagos | Set up the workspace, invite the team, control who can do what, watch AI spend | Chasing people for access; no visibility into tool usage |
| Lukas Weber | QA Lead | Leads 4 testers in Berlin, owns release sign off | Plan test cycles, triage incoming bugs quickly, tell stakeholders if the release can ship | Inconsistent bug reports, duplicate tickets, writing status summaries by hand |
| Priya Raman | QA Engineer | Manual and exploratory tester in Bengaluru | Report clear bugs fast, execute runs, write cases from user stories | Rewriting notes into templates, repetitive case writing |
| Diego Alvarez | Developer | Backend developer in Mexico City | See bugs assigned to him with clear repro steps, move them along, ask questions | Vague bugs, not knowing what to pick up next |
| Hana Sato | Viewer | Product manager in Tokyo | Know quality status and release risk at a glance | Asking QA for status updates |

The seed data (Stage 3) creates these personas plus extra members so every role has at least two users.

## 2. Roles

| Role key | Name | Summary |
|---|---|---|
| `org_admin` | Org Admin | Everything in the org, including members, settings, audit log and AI controls |
| `qa_lead` | QA Lead | Owns projects, releases, triage, test planning and reports; cannot manage members or org settings |
| `qa_engineer` | QA Engineer | Reports and edits bugs, writes cases, executes runs, uses AI helpers |
| `developer` | Developer | Works assigned bugs, self assigns unassigned bugs, comments, reports bugs without severity or priority (D-006, D-032) |
| `viewer` | Viewer | Read only across the org except comments; no AI (D-007) |

Rules that apply to everyone:
* Roles are per membership; a user can be QA Lead in one org and Viewer in another (D-022).
* A role never grants access to another org (REQ-008).
* AI features never let a user do more than they could do by hand (D-028).

## 3. Permission matrix

Legend: **Y** allowed, **O** own records only (see notes), **A** assigned to me only, **N** denied (403, control hidden or disabled in UI). Action keys are the names used by backend policy helpers.

### 3.1 Org, members, settings

| Action key | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| `org.read` | Y | Y | Y | Y | Y |
| `org.update_settings` | Y | N | N | N | N |
| `member.list` (members screen) | Y | Y | N | N | N |
| `member.list_basic` (assignee pickers) | Y | Y | Y | Y | Y |
| `member.update_role` | Y | N | N | N | N |
| `member.remove` | Y | N | N | N | N |
| `invitation.create` / `invitation.revoke` | Y | N | N | N | N |
| `invitation.list` | Y | Y | N | N | N |
| `audit.read` | Y | N | N | N | N |
| `label.manage` | Y | Y | N | N | N |

### 3.2 Projects

| Action key | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| `project.read` | Y | Y | Y | Y | Y |
| `project.create` / `project.update` / `project.archive` | Y | Y | N | N | N |
| `component.manage` / `environment.manage` | Y | Y | N | N | N |

### 3.3 Bugs

| Action key | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| `bug.read` (list, board, detail, activity) | Y | Y | Y | Y | Y |
| `bug.create` | Y | Y | Y | Y (no severity or priority) | N |
| `bug.update_fields` (title, description, steps, expected, actual, component, environment, labels, release) | Y | Y | Y | O (reported by me) | N |
| `bug.set_severity_priority` | Y | Y | Y | N | N |
| `bug.assign` | Y | Y | Y | Self (only when unassigned) | N |
| `bug.transition` | Y (any allowed) | Y (any allowed) | Y (QA transitions, section 4 of DOMAIN_MODEL) | A (dev transitions) | N |
| `bug.delete` | Y | Y | N | N | N |
| `comment.create` | Y | Y | Y | Y | Y |
| `comment.update` / `comment.delete` | Y (delete any) | O | O | O | O |
| `attachment.upload` | Y | Y | Y | Y | N |
| `attachment.delete` | Y | Y | O | O | N |
| `attachment.download` | Y | Y | Y | Y | Y |
| `saved_view.manage` | Y | Y | Y | Y | Y (private views only) |

### 3.4 Test management

| Action key | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| `test.read` (suites, cases, runs) | Y | Y | Y | Y | Y |
| `suite.manage` | Y | Y | Y | N | N |
| `case.manage` | Y | Y | Y | N | N |
| `run.create` | Y | Y | Y | N | N |
| `run.execute` (record results) | Y | Y | Y | N | N |
| `run.complete` | Y | Y | Y | N | N |
| `run.bug_from_failure` | Y | Y | Y | N | N |

### 3.5 Releases, dashboard, reports

| Action key | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| `release.read` (including readiness and accepted summary) | Y | Y | Y | Y | Y |
| `release.manage` (create, edit, status, link bugs and runs) | Y | Y | N | N | N |
| `dashboard.read` / `report.read` | Y | Y | Y | Y | Y |
| `report.export` | Y | Y | Y | Y | Y |

### 3.6 AI

| Action key | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| `ai.bug_writer` / `ai.explain_log` / `ai.duplicates` | Y | Y | Y | Y | N |
| `ai.triage` | Y | Y | Y | N | N |
| `ai.test_cases` | Y | Y | Y | N | N |
| `ai.release_summary` | Y | Y | N | N | N |
| `ai.usage_read` (AI usage screen) | Y | Y | N | N | N |
| `ai.configure` (on or off, daily limit) | Y | N | N | N | N |

All AI actions also require the org setting AI on (D-027) and respect rate limits (D-012).

## 4. Navigation per role

| Menu item | Org Admin | QA Lead | QA Engineer | Developer | Viewer |
|---|---|---|---|---|---|
| Dashboard | Y | Y | Y | Y | Y |
| Projects | Y | Y | Y | Y | Y |
| Bugs (list) | Y | Y | Y | Y | Y |
| Board | Y | Y | Y | Y | Y |
| Test suites | Y | Y | Y | Y | Y |
| Test runs | Y | Y | Y | Y | Y |
| Releases | Y | Y | Y | Y | Y |
| Reports | Y | Y | Y | Y | Y |
| Members | Y | Y (read only) | N | N | N |
| Settings | Y (all tabs) | Profile and Labels tabs | Profile tab only | Profile tab only | Profile tab only |
| AI usage | Y | Y | N | N | N |
| "Report bug" button | Y | Y | Y | Y | N |
