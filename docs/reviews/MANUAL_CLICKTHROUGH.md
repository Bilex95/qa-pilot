# Manual click through (about 10 minutes)

Use this after Prompt 0 to confirm the app yourself. Everything runs on seed data. All accounts share your `SEED_USER_PASSWORD`.

Before you start: the stack is up (`docker compose up -d --wait`), the baseline seed is loaded (`docker compose exec backend python -m app.seed --scenario baseline`), and you open http://localhost:3000. For the live AI parts, `AI_PROVIDER` in `.env` is `gemini` (or `openai_compatible`) with its key set, and the backend was restarted. With `AI_PROVIDER=mock` the same steps work offline.

Tick each line. Note anything that looks wrong, with the screen name and the account you used.

## 1. Sign in as each role (3 minutes)

Sign out between accounts. Check the left menu and the Settings tabs change with the role.

| Account | Role | What to see |
| --- | --- | --- |
| `amara@lumenfreight.test` | Org Admin | Settings shows Organization, Labels, Audit log, My profile. The menu has AI usage |
| `lukas@lumenfreight.test` | QA Lead | Can create and edit bugs, suites, runs, releases. No AI usage page |
| `priya@lumenfreight.test` | QA Engineer | Can report bugs and run tests. Settings shows My profile only. She also has a workspace switcher (Harbor Clinics, as Viewer) |
| `diego@lumenfreight.test` | Developer | Can work on bugs and comment. Compare the create buttons with the roles matrix in `docs/requirements/` |
| `hana@lumenfreight.test` | Viewer | Read only: no create or edit buttons anywhere |

- [ ] Wrong password shows a clear error and does not say which part was wrong
- [ ] Each role lands on the dashboard with numbers that are not empty

## 2. Report a bug with AI (2 minutes)

Sign in as Priya.

- [ ] Open Bugs, then New bug
- [ ] Type a rough note into the AI panel, for example: `checkout button does nothing on iPhone after applying a coupon`
- [ ] The AI suggests a title, steps, severity and component. Nothing is saved yet
- [ ] Accept the suggestion, edit one field, save the bug
- [ ] The duplicate warning appears if you type a title close to an existing bug
- [ ] Open AI usage as Amara and see a new row for this call: provider, model, tokens, no fallback mark

## 3. Triage it (1 minute)

Sign in as Lukas (QA Lead).

- [ ] Open the bug you just created
- [ ] Use the AI triage panel: it suggests severity, priority and an assignee with a reason
- [ ] Press Accept. The bug changes and the timeline shows who changed it
- [ ] Move the bug to the next status and see the entry in the timeline

## 4. Run a test run and fail a step into a bug (2 minutes)

Still as Lukas or Priya.

- [ ] Open Test runs, then New test run, pick a project and one or two suites
- [ ] Open the run and press Fail on one case, enter the failed step and the actual result
- [ ] Use the bug draft for the failed case: the title, steps up to the failed step and the actual result are filled in
- [ ] Save the bug. It opens with "Found in R-n, TC-n"
- [ ] Complete the run and check the counts

## 5. Open a release summary (1 minute)

Still as Lukas.

- [ ] Open Releases, then a release such as WEB 2.4.0
- [ ] The readiness verdict and its reasons are shown
- [ ] Use the AI summary panel. It writes a short summary from the real numbers, you can edit it, and nothing is saved until you accept
- [ ] The numbers in the summary match the numbers on the page

## 6. Quick extras if you have time

- [ ] Resize the window to phone width: the menu collapses and buttons stay easy to press
- [ ] Open the AI usage page as Amara and check the per feature counts against what you just did

## What to send back

Reply with "all good" or a short list: screen, account, what you expected, what happened.
