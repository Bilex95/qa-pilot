# Clarifications

Questions a client meeting would raise, answered autonomously for the 3 day MVP. Each answer is recorded in `docs/DECISIONS.md`. Change any answer by sending feedback at the Stage 1 gate.

| # | Question | Answer | Decision |
|---|---|---|---|
| C-01 | Can one person belong to several organizations, with different roles? | Yes. Roles are per membership; the header has an org switcher. | D-021, D-022 |
| C-02 | What happens right after someone registers? | They create their first organization and become its Org Admin, unless they arrived through an invitation. | D-021 |
| C-03 | How are teammates invited without email delivery? | The admin creates an invite and copies a single use link valid for 7 days. | D-011 |
| C-04 | What exactly is the bug workflow and who can move bugs? | Nine statuses with a fixed transition table. QA verifies and closes; developers start, fix and hand back for retest on bugs assigned to them. | D-005, D-006 |
| C-05 | Can developers report bugs? Can they set severity? | They can report bugs but not set severity or priority; those wait for triage. | D-032 |
| C-06 | Can stakeholders comment? | No. Viewers are read only. | D-007 |
| C-07 | What do bug ids look like? | Project key plus number, for example `WEB-42`. | D-008 |
| C-08 | Which files can be attached and how big? | Images, PDF, text, logs, JSON, CSV, ZIP, MP4 and WEBM up to 10 MB each, 10 per bug. | D-009 |
| C-09 | Is the workflow or SLA configurable per team? | Not in v1. Fixed workflow; SLA thresholds are a stated assumption shown on the dashboard. | D-005, D-019 |
| C-10 | How is release readiness decided? | Server rules: Critical open bugs or pass rate under 80% means Blocked; High open bugs, pass rate under 95%, runs in progress or no runs means At risk; otherwise Ready. | D-014 |
| C-11 | Can a bug belong to more than one release? | No. One target release per bug and per run. | D-015 |
| C-12 | Does AI ever change data by itself? | Never. Every AI output is a suggestion the user accepts, edits or discards. | D-028, REQ-049 |
| C-13 | What do we send to the AI provider, and do we keep it? | Only the fields a feature needs. We keep usage metadata, not the text. Admins can switch AI off. | D-018, D-027 |
| C-14 | How do we stop runaway AI cost? | Per user and per org limits, token caps per feature, usage screen. | D-012 |
| C-15 | How are duplicates found? Do we need a vector database? | No vector database. Text similarity inside the app over open bugs in the same project. | D-013 |
| C-16 | Who can see the AI usage screen? | Org Admin and QA Lead. | D-028 |
| C-17 | Is anything deleted permanently? | Projects are archived; bugs, suites and cases are soft deleted; everything is audited. | D-016 |
| C-18 | How fresh is the data on screen? Is there real time collaboration? | Data refreshes on focus and after changes. No live push in v1. | D-025 |
| C-19 | Will users get notifications? | Not in v1; it is in the backlog. | D-026 |
| C-20 | Which languages and time zones? | English UI; times stored in UTC and shown in local time. | D-024 |
| C-21 | Are saved views shareable? | Private per user in v1. | D-017 |
| C-22 | How does tenant isolation behave when someone guesses another org's id? | They get a 404, as if it does not exist. | D-002, D-003 |
| C-23 | What is the password policy? | At least 10 characters with a letter and a number; login throttled after 10 failures. | D-020 |
| C-24 | How do we run Docker on the build machine? | Through the Docker Engine inside WSL Ubuntu. | D-001 |
