"""Generates the issue plan for Stages 4 to 6: docs/issues/I-##-<slug>.md and docs/issues/DAG.md.

Run from the repo root: python scripts/build_issues.py
Endpoint rows are copied from docs/requirements/API_INVENTORY.md and screenshot files from
docs/requirements/SCREEN_INVENTORY.md, so contracts in issues never drift from the inventories.
Template: .claude/skills/project-delivery/templates/github-issue.md. These files are the plan; no GitHub issues are created.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "issues"
API_ROWS = {m.group(1): line for line in (ROOT / "docs/requirements/API_INVENTORY.md").read_text(encoding="utf-8").splitlines()
            if (m := re.match(r"\| (API-\d{3}) \|", line))}
SCREEN_ROWS = {m.group(1): line for line in (ROOT / "docs/requirements/SCREEN_INVENTORY.md").read_text(encoding="utf-8").splitlines()
               if (m := re.match(r"\| (SCR-\d{2}) \|", line))}
SHOT_FILES = re.findall(r"`([a-z0-9-]+-(?:desktop|mobile)\.png)`", (ROOT / "docs/requirements/SCREEN_INVENTORY.md").read_text(encoding="utf-8"))
API_HEADER = "| ID | Method | Path | Role | Request | Response | Errors |\n|---|---|---|---|---|---|---|"


def slug_of(scr: str) -> str:
    return re.search(r"\| `([a-z-]+)` \|$", SCREEN_ROWS[scr]).group(1)  # type: ignore[union-attr]


@dataclass
class Issue:
    id: str
    title: str
    stage: int
    batch: str
    reqs: list[str]
    goal: str
    scope: list[str]
    exclusions: list[str]
    modules: list[str]
    deps: list[str] = field(default_factory=list)
    apis: list[str] = field(default_factory=list)
    screens: list[str] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)
    edge: list[str] = field(default_factory=list)
    tests: list[str] = field(default_factory=list)
    accept: list[str] = field(default_factory=list)
    migration: str = ""

    @property
    def file(self) -> str:
        return f"{self.id}-{re.sub(r'[^a-z0-9]+', '-', self.title.lower()).strip('-')[:48]}.md"


def rng(a: str, b: str) -> list[str]:
    return [f"API-{n:03d}" for n in range(int(a[4:]), int(b[4:]) + 1) if f"API-{n:03d}" in API_ROWS]


STD_TESTS = ["pytest: happy path, invalid input (422), unauthorized (401, covered by the contract test), forbidden per role (403), "
             "cross tenant (404, covered by the contract test plus a resource id from the other org)",
             "Postman: requests for the same five cases in the module folder; Newman green",
             "OpenAPI regenerated with `scripts/api-types.sh`; CI contract job green"]
STD_UI_TESTS = ["Playwright parity capture into `e2e/parity/` at 1440x900 and 390x844, differences noted in the stage review",
                "Screen added to `e2e/scripts/check-app-layout.mjs`; passes at 360, 390, 768, 1024, 1280, 1440, 1920 px and 200% zoom, "
                "including its menus, dialogs and long text (D-044); before and after screenshots in the stage review",
                "default, empty, loading and error states match the locked screenshots"]

ISSUES = [
    Issue("I-01", "Projects, components and environments", 4, "4A", ["REQ-013", "REQ-014", "REQ-015", "REQ-016"],
          "Org Admins and QA Leads create and archive projects with a key; projects own components and environments.",
          ["Models Project, Component, Environment (DOMAIN_MODEL 1.2) and migration",
           "Default environments dev, staging, prod created with each project",
           "Projects list and project overview screens"],
          ["Bug counts on the overview come from I-03 and I-09; show zero until then"],
          ["backend/app/modules/projects", "frontend/src/modules/projects"], [],
          rng("API-040", "API-051"), ["SCR-06", "SCR-07"],
          ["project.read for all roles; project.create, project.update, project.archive, component.manage, environment.manage for Org Admin and QA Lead",
           "Audit: project.created, project.updated, project.archived"],
          ["Key 2 to 6 uppercase letters, unique per org (409 key_taken); key cannot change after the first bug",
           "Archived projects are hidden from pickers but readable; archiving twice is a no op",
           "Component names unique per project (409); deleting a component in use unlinks bugs (I-03 contract)",
           "Environment in use by a run cannot be deleted (409 in_use)"],
          STD_TESTS + STD_UI_TESTS,
          ["Lead creates project WEB; key WEB-1 style numbering ready for I-03 (`next_bug_number` starts at 1)",
           "Developer and Viewer see projects read only; create button hidden and API returns 403"],
          "0002_projects: projects, components, environments with org_id first in every index"),
    Issue("I-02", "Labels", 4, "4A", ["REQ-022"],
          "Org wide labels that can be attached to bugs and managed in Settings.",
          ["Label model and migration", "Labels API", "Labels tab of Settings (shared with I-11)"],
          ["Attaching labels to bugs is part of I-03"], ["backend/app/modules/projects (labels live with projects)", "frontend/src/modules/settings"], [],
          rng("API-052", "API-054"), ["SCR-20"],
          ["org.read to list; label.manage (Org Admin, QA Lead) to create and delete"],
          ["Names unique per org, case insensitive (409)", "Colour must be a token name from design/TOKENS.md", "Deleting a label removes it from bugs"],
          STD_TESTS, ["Lead creates and deletes labels; QA Engineer gets 403"], "0003_labels"),
    Issue("I-03", "Bugs: model, create, edit, list, search and saved views", 4, "4B",
          ["REQ-017", "REQ-018", "REQ-020", "REQ-021", "REQ-026", "REQ-027", "REQ-029", "REQ-041", "REQ-062"],
          "The bug record and the list QA teams live in: create, edit, assign, filter, search, sort, page, save views.",
          ["Bug, BugLabel, SavedView models and migration with the indexes in NFR-PERF-04",
           "Per project key numbering (D-008) with a row lock on the project counter",
           "List filters, search (D-023), sort, page pagination (D-004), SLA flag (D-019)",
           "New bug form without AI (AI arrives in I-15), bug list screen with saved views"],
          ["Status changes (I-04), comments, attachments and activity (I-05)"],
          ["backend/app/modules/bugs", "frontend/src/modules/bugs"], ["I-01", "I-02"],
          [*rng("API-060", "API-064"), *rng("API-078", "API-080")], ["SCR-08", "SCR-11"],
          ["bug.create for all but Viewer; Developers cannot set severity or priority (D-032, 403 if sent)",
           "bug.update_fields: Developers only on bugs they reported (D-006)",
           "bug.assign: Developers may only assign an unassigned bug to themselves (D-006)",
           "bug.delete: Org Admin and QA Lead, soft delete (D-016)", "Audit: bug.created, bug.updated, bug.assigned, bug.deleted"],
          ["Assignee, component, environment, release and labels must belong to the same org and project (422)",
           "Two bugs created at once in one project never get the same number",
           "`bug_ref` accepts a UUID or a key like WEB-42; keys from another org return 404",
           "SLA: calendar time from creation to Fixed; Won't fix stops the clock; Reopened restarts it (D-019)",
           "Search matches key, title and description, case insensitive; page_size above 100 is 422"],
          STD_TESTS + STD_UI_TESTS + ["Performance: `GET /bugs` p95 under 300 ms on the baseline seed (NFR-PERF-01)"],
          ["QA Engineer files a bug and sees key WEB-1 in the list", "Developer files a bug: severity Medium and P3 forced",
           "Saved views are private to their owner"], "0004_bugs"),
    Issue("I-04", "Bug workflow, transitions and Kanban board", 4, "4C", ["REQ-019", "REQ-028"],
          "Enforce the nine status workflow on the server and let teams move bugs on a board.",
          ["State machine in `bugs/domain` from DOMAIN_MODEL section 4, with side effects (resolved_at, closed_at)",
           "Transitions endpoints and workflow definition", "Board endpoint and board screen with drag and the keyboard Move to menu",
           "Transition buttons on bug detail"],
          ["No configurable workflows (D-005)"], ["backend/app/modules/bugs/domain", "frontend/src/modules/board"], ["I-03"],
          rng("API-065", "API-068"), ["SCR-09", "SCR-10"],
          ["Org Admin and QA Lead: every allowed transition", "QA Engineer: triage, verify, reopen, close",
           "Developer: start, fix, hand back, ready for retest, only on bugs assigned to them or unassigned (self assign on start)",
           "Viewer: none", "Audit: bug.status_changed"],
          ["Transition not in the table: 409 invalid_transition with details.allowed",
           "Optimistic board move rolls back with a message when the server refuses (D-025)",
           "Reopened clears resolved_at and closed_at"],
          [*STD_TESTS, "Unit tests for every row of the transition table and every role (table driven)", *STD_UI_TESTS],
          ["Developer cannot drag a bug assigned to someone else; the card returns with a message"]),
    Issue("I-05", "Bug detail: comments, attachments and activity", 4, "4C", ["REQ-018", "REQ-023", "REQ-024", "REQ-025"],
          "The bug detail page with its conversation, files and full history.",
          ["Comment, Attachment, BugActivity models and migration", "Local volume storage with type sniffing and size limits (D-009)",
           "Authenticated, tenant checked download", "Bug detail screen"],
          ["AI triage panel (I-16)"], ["backend/app/modules/bugs", "frontend/src/modules/bugs"], ["I-03"],
          rng("API-069", "API-077"), ["SCR-10"],
          ["comment.create for every role including Viewer (D-007); edit and delete own; Org Admin deletes any",
           "attachment.upload for all but Viewer; delete own for QA Engineer and Developer",
           "Audit: attachment.uploaded, attachment.deleted, comment.deleted"],
          ["413 file_too_large over 10 MB, 415 unsupported_type by extension or magic bytes, 409 too_many_files over 10",
           "Download sends Content-Disposition attachment and nosniff; never served from a public path",
           "Activity records old and new values for every field change"],
          STD_TESTS + STD_UI_TESTS, ["Viewer comments; Viewer cannot upload"], "0005_bug_detail"),
    Issue("I-06", "Test suites and test cases", 4, "4B", ["REQ-030", "REQ-031"],
          "QA organises cases into suites with ordered steps and expected results.",
          ["TestSuite and TestCase models (steps as JSON list, D-031) and migration", "Suites screen and case editor without AI",
           "Bulk create endpoint used later by the generator (I-17)"],
          ["AI generation (I-17)"], ["backend/app/modules/testing", "frontend/src/modules/testing"], ["I-01"],
          rng("API-090", "API-100"), ["SCR-12", "SCR-13"],
          ["test.read for all; suite.manage and case.manage for Org Admin, QA Lead, QA Engineer", "Audit: suite.deleted, case.deleted"],
          ["At least one step; at most 50 steps; step reorder keeps ids", "Bulk create at most 50 cases, all or nothing"],
          STD_TESTS + STD_UI_TESTS, ["QA Engineer writes a case with 4 steps; Developer sees it read only"], "0006_testing"),
    Issue("I-07", "Test runs, results and bug from a failed step", 4, "4C", ["REQ-032", "REQ-033", "REQ-034"],
          "Execute runs against an environment and turn a failed step into a prefilled bug in one click.",
          ["TestRun and TestRunResult models with case snapshots", "Run list, run execution screen", "Bug draft endpoint and prefilled new bug form"],
          ["Release linking UI (I-08)"], ["backend/app/modules/testing", "frontend/src/modules/testing"], ["I-06", "I-03"],
          rng("API-101", "API-106"), ["SCR-14", "SCR-15", "SCR-11"],
          ["run.create, run.execute, run.complete, run.bug_from_failure for QA roles", "Audit: run.created, run.completed"],
          ["Editing a case after a run starts does not change the run (snapshot)", "Completed runs are read only (409 run_completed)",
           "Bug draft only for failed results (409 result_not_failed); saved bug links back to the result"],
          STD_TESTS + STD_UI_TESTS, ["Fail TC-103 at step 3, create bug, bug shows run link and environment"], "0007_runs"),
    Issue("I-08", "Releases and readiness", 4, "4D", ["REQ-035", "REQ-036", "REQ-037"],
          "Release versions with linked bugs and runs and a server computed readiness status with reasons.",
          ["Release model and migration", "Readiness rules exactly as D-014 in `releases/domain`", "Releases list and release detail without AI"],
          ["AI summary (I-18)"], ["backend/app/modules/releases", "frontend/src/modules/releases"], ["I-03", "I-07"],
          rng("API-110", "API-119"), ["SCR-16", "SCR-17"],
          ["release.read for all; release.manage for Org Admin and QA Lead", "Audit: release.created, release.status_changed"],
          ["A bug or run from another project cannot be linked (422)", "Deleting a released release is refused (409 released)",
           "Readiness reasons list every rule that fired; no runs means At risk"],
          [*STD_TESTS, "Unit tests for each readiness rule and boundary (79, 80, 94, 95 percent)", *STD_UI_TESTS],
          ["WEB 2.4.0 seeded as Blocked with two reasons (release-blocked scenario)"], "0008_releases"),
    Issue("I-09", "Dashboard and reports", 4, "4E", ["REQ-038", "REQ-039", "REQ-040", "REQ-041"],
          "Server computed metrics for the dashboard and the reports screen, with CSV export.",
          ["Dashboard and report endpoints (aggregations in SQL, one round trip per widget at most)",
           "Charts from the locked prototype with the validated palette, tooltips and table view (dataviz rules)"],
          ["No real time updates (D-025)"], ["backend/app/modules/dashboard", "frontend/src/modules/dashboard"], ["I-03", "I-07", "I-08"],
          rng("API-130", "API-133"), ["SCR-05", "SCR-18"],
          ["dashboard.read, report.read, report.export for every role"],
          ["Empty org shows the empty state, never zero filled charts", "Date range over 366 days is 422",
           "CSV escapes formulas (cells starting with =, +, -, @)"],
          STD_TESTS + STD_UI_TESTS + ["Numbers match docs/SEED_MANIFEST.md for the baseline seed"],
          ["Dashboard p95 under 500 ms on baseline (NFR-PERF-02)"]),
    Issue("I-10", "Members and invitations screen", 4, "4A", ["REQ-006", "REQ-009"],
          "The members screen for the existing org, member and invitation APIs.",
          ["Members table with role select and remove, invite dialog showing the link once, pending invitations list"],
          ["Backend already done in Stage 3"], ["frontend/src/modules/members"], [],
          rng("API-024", "API-029"), ["SCR-19"],
          ["Org Admin manages; QA Lead reads; others have no menu entry and see the no access state"],
          ["Last admin controls disabled with an explanation (409 last_admin handled)", "Invite link shown once, copy button"],
          STD_UI_TESTS, ["Admin invites, copies link, a new user accepts it (Stage 3 accept screen)"]),
    Issue("I-11", "Settings: organization, AI switch, audit log and profile", 4, "4B", ["REQ-011", "REQ-012", "REQ-052", "REQ-053"],
          "One settings screen with tabs per role.",
          ["Organization tab (name, AI on or off, daily limit), Labels tab (from I-02), Audit log tab, My profile tab with password change"],
          ["AI usage numbers (I-19)"], ["frontend/src/modules/settings"], ["I-02", "I-10"],
          ["API-015", "API-016", "API-023", "API-150"], ["SCR-20"],
          ["Org Admin: all tabs; QA Lead: Labels and My profile; others: My profile"],
          ["Password change signs out other sessions (backend revokes refresh tokens)", "Turning AI off hides AI controls everywhere (D-027)"],
          STD_UI_TESTS, ["Viewer only sees My profile"]),
    Issue("I-12", "Seed data for every scenario", 4, "4E", ["REQ-060"],
          "Extend the seed so every scenario has realistic domain data, deterministic and idempotent.",
          ["baseline: 3 projects, about 60 bugs across every status and severity, 4 suites with about 40 cases, 5 runs, 3 releases (BUILD_PLAN 4)",
           "sla-breach: bugs past the confirmed SLA (D-019)", "release-blocked: a release blocked by Critical bugs and a low pass rate (D-014)",
           "multi-tenant: mirrored data in both orgs for isolation tests", "Manifest regenerated with the new counts"],
          ["Production seeding stays forbidden"], ["backend/app/seed"], ["I-03", "I-04", "I-05", "I-06", "I-07", "I-08"],
          [], [], ["Seeded ids stay in the seed namespace; reset never touches other records"],
          ["Running twice gives identical counts for every table", "Timestamps relative to a fixed anchor so SLA results are stable"],
          ["test_seed.py extended to every new table", "CI seeds twice and compares counts"], ["`docs/SEED_MANIFEST.md` lists counts per scenario and they match"]),
    Issue("I-13", "Stage 4 design parity and states pass", 4, "4F", ["REQ-055", "REQ-056", "REQ-057", "REQ-058"],
          "Check every built screen against the locked screenshots and close the gaps.",
          ["Parity captures for every Stage 4 screen", "Empty, loading, error and mobile states", "axe scan on key screens"],
          ["No redesign; differences are fixed or listed with a reason"], ["frontend", "e2e"],
          ["I-01", "I-02", "I-03", "I-04", "I-05", "I-06", "I-07", "I-08", "I-09", "I-10", "I-11", "I-12", "I-23", "I-24"],
          [], ["SCR-05", "SCR-06", "SCR-07", "SCR-08", "SCR-09", "SCR-10", "SCR-11", "SCR-12", "SCR-13", "SCR-14", "SCR-15", "SCR-16",
               "SCR-17", "SCR-18", "SCR-19", "SCR-20", "SCR-22"],
          [], ["Every screen at 320 to 1440 px with no sideways scroll and 44 px targets up to 1024 px (D-035)"],
          STD_UI_TESTS, ["Stage 4 review lists every parity difference"]),
    Issue("I-23", "Password reset with admin issued links", 4, "4B", ["REQ-010", "REQ-011"],
          "Let people who forgot their password get back in without email delivery (D-045).",
          ["PasswordReset model (token hash, expiry 1 hour, single use) and migration",
           "Endpoints: admin creates a reset link for a member; public preview; set new password with the token",
           "Forgot password page on sign in; reset link action on the members screen; set new password page"],
          ["Self service by email (BL-005)"], ["backend/app/modules/auth", "frontend/src/modules/auth", "frontend/src/modules/members"],
          ["I-10"], [], ["SCR-01", "SCR-19"],
          ["Only an Org Admin of an org the person belongs to can create a link (member.update_role level)",
           "Audit: auth.reset_link_created, auth.password_reset"],
          ["Used, expired or revoked links return 410; setting a password revokes every refresh token",
           "New endpoints added to API_INVENTORY.md (new API ids), Postman and OpenAPI",
           "No user enumeration: the forgot password page gives the same answer for any email"],
          STD_TESTS + STD_UI_TESTS, ["Admin creates a link, the person sets a new password, old sessions are signed out"],
          "0010_password_resets"),
    Issue("I-24", "Docker: no container left without a network", 4, "4A", ["REQ-059"],
          "Root cause fix for the Stage 3 incident: a failed first start (port taken) left the db container running without a network.",
          ["Preflight in scripts/dc.ps1 and a POSIX twin that refuses `up` when a host port is already taken, naming the process",
           "Reproduce the incident in a test script; confirm whether `restart: unless-stopped` causes the detached restart and switch to "
           "`on-failure` with healthcheck based dependencies if so",
           "Compose healthcheck for the backend that fails fast when `db` does not resolve, with a clear log line"],
          ["Changing the Docker engine itself"], ["docker-compose.yml", "scripts/"], [], [], [],
          [], ["Two stacks on the same ports; WSL restart in the middle of `up`"],
          ["Scripted reproduction before and after the fix, output in the stage review"],
          ["`up` with a taken port stops with a clear message and leaves no half started container"]),
    Issue("I-14", "AI provider, guardrails, usage log and limits", 5, "5A", ["REQ-042", "REQ-049", "REQ-050", "REQ-051", "REQ-052"],
          "The AI foundation every feature uses (AI_SPEC sections 1, 2 and 4).",
          ["AIProvider protocol, MockProvider (deterministic), AnthropicProvider (model from ANTHROPIC_MODEL)",
           "Prompt builder that wraps user content in labelled tags as data", "Pydantic validation, one retry, graceful fallback",
           "AIUsage model, per user rate limit (20 per minute) and org daily limit, ai_enabled switch", "Outcome endpoint for Accept, Edit, Discard"],
          ["Feature prompts (I-15 to I-18)"], ["backend/app/modules/ai"], [], ["API-146", "API-147", "API-148"], [],
          ["AI never grants more than the user's role (D-028); ai_disabled returns 403", "No prompt or response text stored (D-018)"],
          ["Provider timeout 30 s then fallback", "Anthropic selected without a key falls back to mock with a warning",
           "Prompt injection test from AI_SPEC 2.9"],
          [*STD_TESTS, "All AI tests run on the mock provider", "Live smoke per feature only when ANTHROPIC_API_KEY is set; key never logged"],
          ["Usage row written for every call with status ok, invalid_output, fallback, error or rate_limited"], "0009_ai_usage"),
    Issue("I-15", "AI Bug Writer, Explain log and Duplicate detector", 5, "5B", ["REQ-043", "REQ-044", "REQ-046"],
          "Turn rough notes into a structured bug and warn about duplicates before saving.",
          ["Bug writer and explain log prompts and schemas (AI_SPEC 3.1, 3.2)", "TF IDF duplicate search over open bugs in the project (D-013)",
           "New bug screen AI panel with the proof mark suggestion and duplicate warning"],
          ["Nothing is saved by AI; Save bug remains the user's action"], ["backend/app/modules/ai", "frontend/src/modules/bugs"], ["I-14", "I-03"],
          ["API-140", "API-141", "API-143"], ["SCR-11"],
          ["ai.bug_writer, ai.explain_log, ai.duplicates for all but Viewer"],
          ["Duplicate call debounced 600 ms and only when the title has 8 characters", "Mapped component and environment must exist in the project"],
          STD_TESTS + STD_UI_TESTS, ["Accept fills the form; Discard leaves it unchanged; outcome logged"]),
    Issue("I-16", "AI Triage", 5, "5B", ["REQ-045"], "Severity, priority and component suggestion with a reason on bug detail.",
          ["Triage prompt and schema (AI_SPEC 3.3)", "Triage panel on bug detail"], ["Auto apply is never allowed"],
          ["backend/app/modules/ai", "frontend/src/modules/bugs"], ["I-14", "I-05"], ["API-142"], ["SCR-10"],
          ["ai.triage for Org Admin, QA Lead, QA Engineer"], ["Apply uses the normal PATCH and its permission checks"],
          STD_TESTS + STD_UI_TESTS, ["Accept changes the three fields and writes activity entries"]),
    Issue("I-17", "AI Test Case Generator", 5, "5B", ["REQ-047"], "Generate positive, negative and edge cases from a story.",
          ["Generator prompt and schema (AI_SPEC 3.5)", "Generator panel on the case editor with pick list and bulk add"],
          ["Cases are created only through the bulk endpoint after the user picks them"],
          ["backend/app/modules/ai", "frontend/src/modules/testing"], ["I-14", "I-06"], ["API-144", "API-100"], ["SCR-13"],
          ["ai.test_cases for QA roles"], ["At least one case of each type when count is 3 or more, else one retry"],
          STD_TESTS + STD_UI_TESTS, ["Add 6 selected cases to Checkout"]),
    Issue("I-18", "AI Release Readiness Summary", 5, "5B", ["REQ-048"], "A plain English risk summary for stakeholders.",
          ["Summary prompt from server built data only (AI_SPEC 3.6)", "Summary panel on release detail; accepted text saved on the release"],
          ["Viewers never trigger AI"], ["backend/app/modules/ai", "frontend/src/modules/releases"], ["I-14", "I-08"],
          ["API-145", "API-113"], ["SCR-17"], ["ai.release_summary for Org Admin and QA Lead; everyone reads the accepted summary"],
          ["Recommendation must be consistent with readiness (blocked cannot become ship)"], STD_TESTS + STD_UI_TESTS,
          ["Accept and publish stores the summary and writes release.summary_accepted"]),
    Issue("I-19", "AI usage screen", 5, "5B", ["REQ-051"], "Show AI usage per feature and the request log.",
          ["AI usage screen from the locked design"], [], ["frontend/src/modules/ai"], ["I-14"], ["API-146", "API-147"], ["SCR-21"],
          ["ai.usage_read for Org Admin and QA Lead"], ["Mock provider shows estimated tokens with a note"], STD_UI_TESTS,
          ["Totals match the usage rows"]),
    Issue("I-20", "End to end tests, accessibility and responsive checks", 6, "6A", ["REQ-055", "REQ-056", "REQ-057", "REQ-058"],
          "Playwright suite for the critical journeys plus axe and width checks.",
          ["Login per role; report a bug with AI; triage and move it on the board; run a test and create a bug from a failed step; "
           "release summary; viewer cannot edit; org A cannot see org B", "axe on key screens; keyboard pass for forms and dialogs",
           "Widths 320, 360, 375, 390, 412, 430, 768, 1024, 1440"],
          [], ["e2e"], ["I-13", "I-15", "I-16", "I-17", "I-18", "I-19"], [], [], [], [], ["Suite runs in CI against compose"],
          ["All journeys green; no serious or critical axe findings"]),
    Issue("I-21", "Security, tenancy review and performance", 6, "6A", ["REQ-008", "REQ-062", "REQ-063"],
          "Prove the security and performance targets before release.",
          ["Review every query for org_id scoping", "Upload limits, rate limits, headers", "npm audit and pip-audit; fix or record",
           "Bug list under 1 s with seeded data; indexes where needed"],
          [], ["backend", "frontend"], ["I-20"], [], [], [], [], ["Findings and fixes recorded in the Stage 6 review"],
          ["No high or critical dependency findings left unexplained"]),
    Issue("I-22", "Docs, parity report and final QA report", 6, "6B", ["REQ-059", "REQ-060", "REQ-061"],
          "Release documentation and the go or no go recommendation.",
          ["README with a 5 command Windows quick start and seeded logins", "docs/USER_GUIDE.md", "CHANGELOG.md",
           "docs/reviews/PARITY.md with built screens next to locked ones", "docs/reviews/FINAL_QA_REPORT.md with requirement traceability"],
          [], ["docs"], ["I-21"], [], [], [], [], [], ["Every REQ marked Verified, Partial or Not done with evidence"]),
]


def render(i: Issue) -> str:
    deps = ", ".join(f"[{d}]({next(x.file for x in ISSUES if x.id == d)})" for d in i.deps) or "None"
    lines = [f"# {i.id} {i.title}", "",
             f"**Stage:** {i.stage} | **Batch:** {i.batch} (see [DAG](DAG.md)) | **Status:** Planned", "",
             "## Goal / requirement IDs", "", i.goal, "", "Requirements: " + ", ".join(i.reqs), "",
             "## Scope and exclusions", "", *[f"* {s}" for s in i.scope], *([""] + [f"* Not in this issue: {e}" for e in i.exclusions] if i.exclusions else []), "",
             "## Module ownership / dependencies", "", *[f"* `{m}`" for m in i.modules], f"* Depends on: {deps}",
             *([f"* Migration: `{i.migration}`"] if i.migration else []), ""]
    if i.screens:
        lines += ["## UI states and committed screenshots", "",
                  "Locked design: `design/reference/approved.html`. Screenshots are committed on `main` (merge 73d7fcc, tag `stage-2-approved`).", ""]
        for s in i.screens:
            files = [f for f in SHOT_FILES if f.startswith(slug_of(s) + "-")]
            lines.append(f"* **{s}**: " + ", ".join(f"[`{f}`](../../design/screenshots/{f})" for f in files))
        lines.append("")
    if i.apis:
        lines += ["## API contract", "", "Copied from `docs/requirements/API_INVENTORY.md` (`{O}` = `/api/v1/orgs/{org_id}`; standard errors apply).", "",
                  API_HEADER, *[API_ROWS[a] for a in i.apis], ""]
    lines += ["## Authorization, audit, data and edge cases", "", *[f"* {r}" for r in i.rules], *[f"* {e}" for e in i.edge],
              "* Every query filters by `org_id`; ids from another org return 404 (D-003)", "",
              "## Tests", "", *[f"* {t}" for t in i.tests], "",
              "## Acceptance checklist", "", *[f"- [ ] {a}" for a in i.accept],
              "- [ ] Implementation and tests", "- [ ] Negative and tenant permission tests", "- [ ] Docker and CI pass",
              "- [ ] OpenAPI, Postman, seed or screenshot references updated", "- [ ] Evidence in the stage review; no automatic merge", ""]
    return "\n".join(lines)


def dag() -> str:
    batches: dict[str, list[Issue]] = {}
    for i in ISSUES:
        batches.setdefault(i.batch, []).append(i)
    lines = ["# Issue DAG for Stages 4 to 6", "",
             "Generated by `scripts/build_issues.py`; edit that file, not this one. Status is updated as issues are done.", "",
             "Issues in the same batch can run in parallel; a batch starts when the issues it depends on are done.", "",
             "```mermaid", "flowchart LR"]
    for i in ISSUES:
        lines.append(f'    {i.id.replace("-", "")}["{i.id} {i.title}"]')
    for i in ISSUES:
        for d in i.deps:
            lines.append(f"    {d.replace('-', '')} --> {i.id.replace('-', '')}")
    lines += ["```", "", "## Batches", "", "| Batch | Stage | Issues (parallel) | Depends on |", "|---|---|---|---|"]
    for b, items in batches.items():
        deps = sorted({d for i in items for d in i.deps} - {i.id for i in items})
        lines.append(f"| {b} | {items[0].stage} | " + ", ".join(f"[{i.id}]({i.file}) {i.title}" for i in items)
                     + f" | {', '.join(deps) or 'Stage 3 foundations'} |")
    lines += ["", "## Status", "", "| Issue | Status | Commit |", "|---|---|---|", *[f"| {i.id} | Planned | |" for i in ISSUES], "",
              "## Requirement coverage", ""]
    covered = sorted({r for i in ISSUES for r in i.reqs})
    lines.append(f"{len(covered)} requirements are referenced by Stage 4 to 6 issues: " + ", ".join(covered) + ".")
    lines += ["Requirements fully delivered in Stage 3 (auth, orgs, invitations API, audit API, platform) are verified in the Stage 3 review.", ""]
    return "\n".join(lines)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("I-*.md"):
        old.unlink()
    for i in ISSUES:
        missing = [a for a in i.apis if a not in API_ROWS]
        assert not missing, (i.id, missing)
        (OUT / i.file).write_text(render(i), encoding="utf-8")
    (OUT / "DAG.md").write_text(dag(), encoding="utf-8")
    print(f"Wrote {len(ISSUES)} issues and DAG.md")
