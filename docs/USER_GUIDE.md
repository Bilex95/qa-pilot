# QA Pilot user guide

QA Pilot tracks bugs, test cases, test runs and releases for a team, and adds AI suggestions you can accept or discard. All demo data is fictional.

## Signing in and workspaces

* **Register** with name, email and password, then create a workspace (you become its Org Admin), or accept an **invitation link** from an Org Admin.
* Sessions refresh quietly; **Sign out** ends the session. After 10 failed sign ins in 15 minutes the account is locked for a while.
* **Forgot password** sends a reset link (single use).
* If you belong to several workspaces, use the workspace switcher in the header. The address shows the workspace (`/o/<slug>/...`) and all data changes with it.

## Roles

| Role | Can |
|---|---|
| Org Admin | Everything, including members, settings, audit log and AI usage |
| QA Lead | Projects, releases, bug deletion, reports, labels, test runs |
| QA Engineer | Report and edit bugs, write test cases, record run results |
| Developer | Work assigned bugs (status moves, comments, self assign). Cannot set severity or priority |
| Viewer | Read everything and comment |

The screen hides or disables what your role cannot do, and the server refuses it as well.

## Screens

* **Dashboard:** open bugs by severity, 30 day trend, test pass rate, top components, release readiness, SLA breaches.
* **Projects:** each has a short key (for example `WEB`), components and environments. The overview shows its open bugs, latest runs, components and environments.
* **Bugs:** list with filters, search, sort and saved private views. A bug has severity, priority, component, environment, labels, assignee, target release, comments, attachments and a full activity timeline.
* **Board:** Kanban by status. Drag a card to move it; a move the workflow does not allow is refused and the card returns. You can also move a card with the keyboard.
* **Tests:** suites hold cases with ordered steps. **Runs** snapshot the cases; record Pass, Fail, Blocked or Skipped per case. From a failed result, **Create bug** opens a prefilled report linked to that result. Complete the run to lock the results.
* **Releases:** name, target date, status and linked bugs and runs. Readiness (Ready, At risk, Blocked) is calculated on every view with the reasons listed.
* **Reports:** the dashboard figures with project and date filters, status distribution, workload per assignee and CSV export.
* **Members:** invite by copyable link, change roles, remove people (the last Org Admin cannot be removed).
* **Settings:** workspace name, AI on or off and the daily AI limit, labels, audit log, your profile and password.
* **AI usage:** requests, tokens, latency and outcome per feature, and the active provider.

## AI features

Every AI result is a suggestion. Nothing is saved until you click Accept (or edit it first); Discard drops it. The outcome is logged. Your text is sent as data, never as instructions.

* **Bug Writer** (New bug): turns rough notes or a pasted log into a structured report. **Explain this log** summarises a log in plain English.
* **Duplicate detector** (New bug): shows up to five similar open bugs while you type.
* **Triage** (bug page): suggests severity, priority and component.
* **Test case generator** (case editor): from a user story, creates positive, negative and edge cases; pick the ones to add.
* **Release summary** (release page): a plain English risk summary you can save on the release.

By default the **mock** provider is used, so everything works offline with fixed output. Set `AI_PROVIDER=anthropic`, an API key and `ANTHROPIC_MODEL` for real output, or use a free tier with `AI_PROVIDER=gemini` (`GEMINI_API_KEY`) or `AI_PROVIDER=openai_compatible` (`OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL`, for example Groq or OpenRouter). An Org Admin can turn AI off per workspace.

## Keyboard and small screens

Every dialog and form works by keyboard (Tab, Shift+Tab, Escape closes and returns focus). The app works from 320 to 2560 px wide; on a phone the navigation collapses into a menu and the board scrolls sideways inside its frame.
