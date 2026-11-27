# QA Pilot: Stand Out Build Prompts (Prompt 0 and Stages 7 to 11)

Owner: Tobi (Bilex95). Source plan: "QA Pilot: Product Audit and Roadmap to Stand Out" (27 November 2026).
This file is the single source of instructions for the next phase. Claude Code reads it, runs one prompt at a time, and stops at each gate.

---

## How to use this file

1. Save this file in the repo as `docs/roadmap/STAND_OUT_PROMPTS.md`.
2. Export the audit doc as Markdown and save it as `docs/reviews/PRODUCT_AUDIT.md`.
3. Commit both on a small docs branch (or let the agent do it in Prompt 0).
4. Paste the **Kickoff prompt** below into Claude Code in VS Code.
5. The agent runs Prompt 0, reports, then runs Stage 7 and stops for your design approval.
6. At every gate, read the review file, then reply `APPROVED, continue` (or give feedback). The agent then starts the next prompt in this file without waiting for a new brief.

---

## Kickoff prompt (paste this into Claude Code)

```text
Read docs/roadmap/STAND_OUT_PROMPTS.md in full, then docs/reviews/PRODUCT_AUDIT.md, PROGRESS.md and the qa-pilot-gates skill.
This file is the plan for the next phase. Follow its Global rules in every step.
Start with Prompt 0 now. When Prompt 0 is done, report and go straight on to Stage 7.
Stop only at the gates the file defines (end of Stage 7, then end of each later stage), or when something is genuinely important.
After each gate, when I reply "APPROVED, continue", start the next prompt in the file.
Keep "Resume here" in PROGRESS.md current after every issue, so a fresh session can pick up exactly where you stopped.
```

---

## Global rules (apply to every prompt)

1. **Gates:** each stage works on its own branch (`stage/7-product-uplift`, `stage/8-design-and-ai`, and so on), ends with `docs/reviews/STAGE_N_REVIEW.md`, opens a PR into main, and stops. Never merge without my approval. Tag `stage-N-approved` after merge.
2. **Issues:** plan each stage as issues in `docs/issues/` with a DAG. Build each issue with the issue-builder subagent. Update PROGRESS "Resume here" after every issue.
3. **Checks:** run `scripts/gate.ps1` locally for changed areas, push with `scripts/safe-push.sh`, and watch CI with `scripts/wait-ci.sh`. A stage is not done until CI is fully green on its last commit, with nothing cancelled or timed out.
4. **Never weaken a check to pass it.** If a test fails, find out whether the test or the app is wrong, with evidence from the requirements or the locked prototype. Fix the app when the app is wrong. No raised timeouts or blind retries. Flaky tests get a root cause.
5. **Free only:** every service, host, AI provider and tool used must be free and need no payment card. If something would cost money, stop and tell me with a free alternative.
6. **Security:** the repo is public. Never commit secrets, keys or `.env`. API keys stored by the app are encrypted at rest and never returned by any API. Every new endpoint gets role checks and a cross tenant test. AI output is a suggestion a person accepts; AI tools that change data require confirmation and are audited.
7. **Design:** every new or changed screen matches the locked prototype (`design/reference/approved-v2.html` once Stage 7 is approved). 44 px touch targets, WCAG AA contrast, keyboard access, reduced motion respected, layout checks at all widths, axe clean, accessibility tree check.
8. **Windows:** no `&` to join PowerShell commands; use `;` or separate commands. Keep WSL memory in mind; shut down heavy stacks when not needed.
9. **Writing style:** in docs and UI copy written for me, avoid dashes used as punctuation.
10. **Decisions:** record every product or technical decision in `docs/DECISIONS.md` (D-083 onward). Put anything deferred in `docs/BACKLOG.md`.

---

## Product decisions already made (do not ask again)

| Topic | Decision |
| --- | --- |
| Who it is for | All five audiences: freelance QA testers, freelance creators, small agencies, startup product teams, enterprise QA. First focus: small agencies and startup teams |
| Use your own AI | Two options: (1) QA Pilot as an MCP server that Claude, ChatGPT and any MCP capable AI can connect to; (2) bring your own API key (Anthropic, OpenAI, Gemini, any OpenAI compatible provider) |
| Default AI | QA Pilot's own AI on a free provider: Gemini free tier first, Groq or OpenRouter free models as fallback. Demo data only on free tiers |
| Integrations order | GitHub and Slack, then CI results import, then Jira |
| Brand colour | Chosen by me after Stage 7 from three switchable themes: indigo, deep teal, warm coral |
| Pricing | In app pricing page: Solo Flight (free), Co-Pilot ($8 per member a month), Flight Crew ($16 per member a month), Mission Control (talk to us). Paid plans show "Join the waitlist". No payment provider |
| Go live | Public demo after Stage 11, on free hosting with no card |

---

## Prompt 0: Make sure today's app works, and switch on free live AI

```text
Prompt 0: health check and free live AI. Branch: fix/health-and-live-ai. Goal: prove the current app works end to end before we build more.

1. Docs: commit docs/roadmap/STAND_OUT_PROMPTS.md and docs/reviews/PRODUCT_AUDIT.md if they are not committed yet.
2. Clean clone check: clone the repo fresh into a temp folder, follow the README quick start exactly, and confirm db, backend and frontend come up healthy and a seeded user can sign in. Fix the README or scripts if any step fails. Record the result in the final QA report (REQ-059).
3. Free AI providers: behind the existing AI provider interface, add
   a) a Gemini provider (Google AI Studio free tier), and
   b) one OpenAI compatible provider that works with Groq and OpenRouter base URLs.
   Configure with AI_PROVIDER, the model name and the key in .env only. Update .env.example with placeholders. Add unit tests with a fake HTTP server for both, including timeouts, invalid JSON, rate limit (429) handling and the existing validation, retry and fallback.
4. Tell me exactly how to get a free Gemini API key and which .env lines to set. Wait for me to say the key is in .env. Never print or log the key.
5. Live AI smoke test (BL-037): run e2e/scripts/smoke-live-ai.mjs against Gemini. Every AI feature must pass with a fresh usage row and no fallback. If outputs fail validation, fix the prompts or the parser, not the validation. Report pass or fail, response time and tokens per feature. Then repeat once on Groq or OpenRouter as the fallback.
6. Small fixes: BL-039 (undefined suite_id in the query string). Review open Dependabot PRs if any: list them, merge the green ones after showing me the list, and log any that need work.
7. Full gate: backend gates, frontend gates, Newman after a reseed, and CI fully green.
8. Give me a 10 minute manual click through checklist (sign in as each role, report a bug with AI, triage it, run a test run, fail a step into a bug, open a release summary) so I can confirm it myself.
9. Update FINAL_QA_REPORT.md: REQ-042 becomes Verified on a live provider (Gemini). Then set AI_PROVIDER back to the default the tests expect and confirm CI stays offline (mock).
10. Open a PR, merge it when green after showing me the result, and continue straight to Stage 7.
```

---

## Stage 7: Requirements and design lock

```text
Stage 7: Product uplift, requirements and design lock. Branch: stage/7-product-uplift. Write no product code in this stage.

1. Requirements: write docs/requirements/REQUIREMENTS_V2.md adding REQ-064 onward for every gap and decision in the audit:
   - the 12 area settings blueprint, per role (Workspace: General, Members and roles, Security, Audit log, Plan and usage; Work: Workflow, Fields and templates, SLAs and quality rules, AI; Connections: Integrations, API keys; Personal: Profile, notifications, appearance);
   - the AI front door: a bright AI icon in the top bar of every page (and Ctrl+K) opening "Ask QA Pilot", which chats, takes instructions and has a Setup tab; an AI home; why and confidence on every suggestion;
   - AI options: QA Pilot's default AI on a free provider, bring your own API key, and QA Pilot as an MCP server for Claude, ChatGPT and any MCP capable AI;
   - the written QA report (verdict, scope tested, results, every issue found, risks and gaps, recommendations, evidence appendix; PDF, share link, schedule) and the richer dashboard (defect trends by component, mean time to fix, reopen rate, coverage by requirement, flaky tests, readiness history, My work);
   - the guide centre, first run tours per role and a sample project;
   - integrations in this order: GitHub and Slack, then CI results import, then Jira; plus webhooks and scoped API keys;
   - bug capture (screenshot annotation, a browser extension capturing console and network logs), testing depth (test plans, milestones, exploratory sessions, automated results, flaky test detection) and in app notifications;
   - the pricing page with the four plans from the decisions table;
   - personas for all five audiences.
2. Update the domain model, API inventory, roles and permissions matrix, risks and DECISIONS.
3. Plan Stages 8 to 11 as issues in docs/issues/ with a DAG, following the scope of each stage in docs/roadmap/STAND_OUT_PROMPTS.md.
4. Design: build design/reference/approved-v2.html, a navigable prototype in the audit's visual direction. Show three brand themes (indigo, deep teal, warm coral) as a switch so I can choose. AI gradient only on AI surfaces; vivid severity scale with text labels; layered cards; full dark mode; modern sans type with tabular numbers; 150 to 250 ms motion that respects reduced motion; comfortable and compact density. Cover: dashboard, bug list, bug detail with AI panel, the AI icon and Ask QA Pilot panel with its Setup tab, AI home, every settings area per role including AI options and API keys, the QA report view, test plans and exploratory sessions, the guide centre, the pricing page, integrations, notifications, and empty, loading and error states.
5. Capture Playwright screenshots of every prototype screen at 1440 and 390 px in light and dark. Check WCAG AA contrast on every token pair in all three themes and report it.
6. Write docs/reviews/STAGE_7_REVIEW.md with links to the screenshots and a short list of what I must decide (brand theme first). Open the PR and STOP for my approval.
```

**Gate:** you approve the design and choose the brand theme. The agent then copies the chosen tokens into `design/reference/approved-v2.html` as the locked design.

---

## Stage 8: New design system and the AI front door

```text
Stage 8: design system and AI front door. Branch: stage/8-design-and-ai. Build to the locked design/reference/approved-v2.html with the theme I chose.

1. Design system: replace the frontend tokens with the new ones (colour per theme, dark mode, type scale, spacing, radius, shadows, motion). Add a theme switch (light, dark, system) and density (comfortable, compact). Restyle every existing screen to the new design without changing behaviour. Update parity screenshots to v2 and keep layout, axe and accessibility tree checks green at all widths in light and dark.
2. AI icon and Ask QA Pilot: a bright AI icon in the top bar on every page and Ctrl+K opens a side panel chat.
   - It answers questions about the workspace through server side tools that respect the user's role and organization (search bugs, read a bug, list runs, release readiness, dashboard numbers).
   - Actions that change data (create a bug, change status, generate test cases) are proposed as cards the person confirms; nothing changes without confirmation; every confirmed action is audited and marked as AI assisted.
   - A Setup tab shows which AI is active and links to Settings, AI.
   - Treat all workspace content as data, never instructions: add prompt injection tests.
3. AI home: what AI did this week, suggestions waiting for approval, acceptance rate, estimated time saved, usage against limits.
4. Explainable AI: every AI suggestion shows a short "why", what it looked at, and a confidence level.
5. AI options in Settings, AI (Org Admin):
   - Default: QA Pilot AI on the free provider configured on the server.
   - Bring your own API key: provider (Anthropic, OpenAI, Gemini, OpenAI compatible with base URL), model, key. "Test connection" button. Keys encrypted at rest with a server secret, shown only as the last 4 characters, never returned by any API, deletable. The workspace's key is used only for that workspace.
   - Per feature switches and daily limits; usage log shows which provider served each call.
   - A placeholder card for "Connect from Claude or ChatGPT (MCP)" that says it arrives in Stage 11.
6. Tests: unit, Newman for every new endpoint (including that keys are never returned and other orgs cannot use them), flows for the chat panel and settings, and the live smoke test on the free provider.
7. Review file, PR, STOP for approval.
```

---

## Stage 9: Admin settings and workspace controls

```text
Stage 9: settings and workspace controls. Branch: stage/9-settings.

Build all 12 settings areas from REQUIREMENTS_V2 and the locked design, each visible only to the roles that may use it, with the API enforcing the same rules:
1. General: name, logo, brand colour accent, time zone, date format, language.
2. Members and roles: invite, deactivate, transfer ownership, custom roles with a permission grid. The permission system becomes data driven; the existing five roles become built in roles; every endpoint keeps its forbidden and cross tenant tests.
3. Security: TOTP two factor sign in (optional per user, required by org policy), active sessions list with sign out, password policy, allowed email domains for invites.
4. Audit log: filters and CSV export.
5. Plan and usage: current plan (Solo Flight for everyone for now), members, AI usage against limits, storage used.
6. Workflow: bug statuses and allowed transitions, who may move what, required fields per status. Keep the default workflow as the seed.
7. Fields and templates: custom fields on bugs and test cases (text, number, select, date, user), labels, bug and test case templates, severity and priority scales.
8. SLAs and quality rules: SLA hours per severity, release readiness thresholds, auto reopen rules.
9. AI: already built in Stage 8; make sure it sits in the new settings layout.
10. Integrations and API keys: the screens and data model, with connectors marked "coming in Stage 11".
11. Personal: profile and password (existing), two factor setup, notification choices, appearance (theme, density), keyboard shortcuts list.
12. In app notifications: a bell with an inbox (assigned to me, mentions, status changes, SLA warnings, AI suggestions waiting), read and unread, per user choices. Email is optional through SMTP settings and uses Mailpit locally only; no paid email service.
Also: Data area with CSV import of bugs and test cases (with a preview and mapping step) and full workspace export (JSON and CSV).
Tests for every area: unit, Newman, flows, layout, axe. Migrations must keep existing data. Review file, PR, STOP for approval.
```

---

## Stage 10: Reporting, testing depth and guidance

```text
Stage 10: reporting, testing depth and guidance. Branch: stage/10-reporting-and-guidance.

1. Written QA report for a release and for a test run:
   - Sections: verdict (ship, ship with risks, do not ship) with the reason; scope tested; results with pass rate against the previous release; every issue found (severity, status, steps, screenshot, owner, open first); risks and gaps (untested areas, flaky tests, SLA breaches, reopened bugs); recommendations; evidence appendix with links.
   - AI drafts it from real data only (no invented numbers: every figure comes from the database and is checked against it in tests). A person edits and approves; versions are kept.
   - Export to PDF (server side, free tooling) and a share link with an expiry and a revoke button, readable without signing in, showing only that report.
   - Scheduled reports: weekly, in app now; Slack delivery is wired in Stage 11.
2. Richer dashboard: defect trends by component, mean time to fix, reopen rate, coverage by requirement, flaky tests, readiness history, a personal My work view. Hero metrics with sparklines. Each chart opens the matching filtered list. Fix BL-036 (dashboard query growth) with EXPLAIN ANALYZE and an index or pre-aggregation, and rerun the 20k latency check.
3. Testing depth: test plans and milestones (group runs toward a release), exploratory sessions (charter, timer, notes, screenshots, bugs raised during the session), and requirement links on test cases for coverage.
4. Bug capture in the app: screenshot upload with annotation (arrows, boxes, blur for private data) on bugs and comments.
5. Guidance:
   - A guide centre inside the app with articles: what QA Pilot is, a first hour walkthrough per role, how to test a web app with QA Pilot from plan to report, how AI works and what data it sees, how to use your own AI (API key and MCP), how to connect GitHub, Slack, CI and Jira.
   - First run tours per role, a "Sample project" that teaches by doing, and helpful empty states with the next step on every screen.
6. Tests for all of the above, including a test that the report's numbers match the database, PDF generation in CI, share link access rules, and the accessibility tree check at 390 and 1440 px (BL-038). Review file, PR, STOP for approval.
```

---

## Stage 11A: Integrations, MCP and capture

```text
Stage 11A: integrations, MCP server and capture. Branch: stage/11a-integrations.

Build in this order, each behind Settings, Integrations, with connection status, a test button, and disconnect:
1. GitHub: connect a repository (GitHub App, free). Link commits and pull requests to bugs by key (for example MOB-12 in a commit message), show them on the bug, optionally create a GitHub issue from a bug, and move a bug to Ready for Retest when a linked PR merges (configurable).
2. Slack: post chosen events to a channel (new critical bug, SLA breach, release verdict, scheduled report) and allow "create a bug" from a Slack message shortcut if it stays within free Slack app limits.
3. CI results import: an authenticated endpoint that accepts JUnit XML (and Playwright JSON), creates an automated test run linked to suites and cases by name or ID, shows results next to manual runs, and detects flaky tests (pass and fail on the same commit or alternating results). Ship a ready GitHub Actions step and docs. Fix BL-040 (heavy CI jobs skip on docs only changes) while in CI.
4. Jira: connect Jira Cloud (free developer instance for testing), link and sync bug status and comments both ways with clear conflict rules.
5. Webhooks: signed outgoing webhooks for bug, run and release events, with delivery log and retries.
6. Scoped API keys: create, scope (read, write, per project), rotate, revoke, last used; public API docs page generated from OpenAPI.
7. QA Pilot MCP server (option 1 of "use your own AI"):
   - Tools: search_bugs, get_bug, create_bug, update_bug_status, add_comment, list_test_runs, get_run_results, generate_test_cases (returns drafts), get_release_report, get_dashboard.
   - Transports: streamable HTTP for remote clients, and stdio for local use (Claude Desktop, Claude Code, Cursor).
   - Auth with a scoped API key (OAuth later); every call respects role and organization; write tools are marked so clients ask the user to confirm; every action is audited as "via MCP".
   - Docs and a Settings card: how to connect from Claude, ChatGPT, Cursor and other MCP clients, with copy buttons for the config.
   - Tests: contract tests for every tool, cross tenant tests, and an end to end test with an MCP client library.
8. Browser capture extension (Chrome, Manifest V3): screenshot with annotation, last minute console logs and network requests (with secrets masked), device and URL info, sent to QA Pilot as a new bug draft with the AI Bug Writer filling the text. Unpacked install docs; no paid store listing needed.
Tests for each integration with recorded fixtures (no live third party calls in CI). Review file, PR, STOP for approval.
```

---

## Stage 11B: Launch readiness and free public demo

```text
Stage 11B: launch readiness and free public demo. Branch: stage/11b-launch.

1. Pricing page (public and in app) with Solo Flight, Co-Pilot, Flight Crew and Mission Control, monthly and annual (two months free), a feature comparison table, and "Join the waitlist" buttons that store the email and plan of interest. No payment provider.
2. BL-034: general API rate limit with a shared store, per user and per API key, with clear 429 responses and tests.
3. Remaining backlog that affects quality: BL-041 follow up (datetime model guard), and anything Stage reviews marked as must fix.
4. Demo mode: a public demo workspace that resets nightly from the seed, sign in as any role with one click, AI on the free provider with tight limits, and a banner that it is a demo.
5. Free hosting: research current free hosting for the frontend, backend and PostgreSQL that needs no payment card, propose the cheapest reliable option with its limits, and wait for my OK before creating any account. Then deploy, with secrets in the host's secret store, HTTPS, health checks, and a deploy workflow from main.
6. Security pass on the deployed demo: headers, CORS, rate limits, secret scan, dependency audit, CodeQL on main with no open alerts.
7. Final QA report v2 for REQ-001 to the last REQ, with evidence, plus live smoke tests against the deployed demo (sign in, AI feature, MCP connect, CI import).
8. Update README (quick start, demo link, architecture, how to use your own AI) and CHANGELOG.
9. Review file, PR, STOP for my final approval. After approval: merge, tag v2.0.0, and give me a short launch checklist and a summary I can use for LinkedIn.
```

---

## Prediction: when this finishes

Estimate based on how Stages 4 to 6 went (about 11 days for three stages, with CI waits and fixes), working most days with quick approvals.

| Step | Expected length | Expected finish |
| --- | --- | --- |
| Prompt 0: health check and free live AI | 1 to 2 days | 29 November 2026 |
| Stage 7: requirements and design lock (your review included) | 2 to 3 days | 2 December 2026 |
| Stage 8: design system and AI front door | 4 to 5 days | 7 December 2026 |
| Stage 9: admin settings and workspace controls | 4 to 5 days | 12 December 2026 |
| Stage 10: reporting, testing depth and guidance | 4 to 5 days | 17 December 2026 |
| Stage 11A: integrations, MCP and capture | 5 to 7 days | 24 December 2026 |
| Stage 11B: launch readiness and free public demo | 3 to 4 days | 28 December 2026 |

**Target: public demo live around 28 December 2026.** Best case 23 December; realistic worst case mid January 2027.

What could slow it down:
- Claude Pro usage limits in Claude Code (long stages may pause until limits reset).
- Machine memory: Docker, WSL and VS Code together run short; close other apps during test runs.
- Slow reviews at the gates, especially the Stage 7 design choice.
- Free tier changes at AI or hosting providers.
- The holiday period.

The fastest lever is approving each gate the same day it arrives.
