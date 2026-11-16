# QA Pilot starter kit: start here

This folder becomes your project. Claude Code builds the whole app inside it, stage by stage, using the Project Delivery method in `.claude/skills/project-delivery/`.

## What is in the kit
| File | Purpose |
|---|---|
| `MASTER_PROMPT.md` | The prompt you paste into Claude Code once |
| `CLAUDE.md` | Rules Claude Code reads automatically in every session |
| `docs/BUILD_PLAN.md` | Product scope, architecture, stages and the 3 day timeline |
| `.claude/settings.json` | Pre approves tools so Claude Code does not stop to ask |
| `.claude/skills/project-delivery/` | Your Project Delivery playbook, loaded as a Claude Code skill |
| `claude-setup/` | Same settings and skill files; the prompt copies them into `.claude/` automatically if that folder is missing |

## One time setup (about 15 minutes)
1. Install: Git, Docker Desktop (start it and wait until it says running), Node.js 20 LTS, VS Code, and the Claude Code extension.
2. Copy this whole folder somewhere short, for example `C:\dev\qa-pilot`, and open it in VS Code (File, Open Folder).
3. Optional for real AI: create an Anthropic API key. You will add it to `.env` after Stage 3. Without a key the app uses a built in mock AI so everything still works.

## Run without permission prompts
The VS Code chat panel has known bugs where it still asks for approval even with bypass settings, so the reliable way is the terminal inside VS Code:

1. In VS Code open Terminal, New Terminal (PowerShell).
2. Run:
   ```
   irm https://claude.ai/install.ps1 | iex
   claude --dangerously-skip-permissions
   ```
   (If you already have Claude Code installed, skip the first line. `npm install -g @anthropic-ai/claude-code` also works.)
3. Accept the one time warning.

If you prefer the chat panel instead, open VS Code settings (JSON) and add:
```
"claudeCode.allowDangerouslySkipPermissions": true,
"claudeCode.initialPermissionMode": "bypassPermissions"
```
then choose "Bypass permissions" in the mode picker for each new chat. The project file `.claude/settings.json` already pre approves the tools as a backup.

Note: skip permissions means Claude Code acts without asking. Keep this project in its own folder, keep real passwords and production keys out of it, and the rules in `CLAUDE.md` forbid pushing to GitHub or touching anything outside the folder.

## Start the build
1. Open `MASTER_PROMPT.md`, copy everything below the line, paste it into Claude Code, press Enter.
2. Walk away. It runs Stage 0 and Stage 1 on its own.
3. When it prints `STAGE 1 COMPLETE`, open `docs/reviews/STAGE_1_REVIEW.md`.
4. Reply `APPROVED` to move on, or type your feedback. Repeat at each stage.
5. After you lock the design in Stage 2 you can reply `APPROVED, CONTINUOUS` to let it run Stages 3 to 6 back to back.

## If something stops
* Context ran out or VS Code closed: start Claude Code again in the same folder and type `Resume from PROGRESS.md.`
* It reports a blocker: open `docs/BLOCKERS.md`, follow the steps it wrote for you, then type `Blocker fixed, continue.`

## Stages at a glance
| Stage | You review | Est. time |
|---|---|---|
| 1 Requirements and architecture | Requirement list, roles, screens | 30 to 45 min |
| 2 HTML prototype | Click through the prototype, lock the design | 1.5 to 2.5 h |
| 3 Foundations | `docker compose up -d`, log in | 2.5 to 3.5 h |
| 4 Core features | Bugs, Kanban, test runs, dashboard | 3.5 to 5 h |
| 5 AI layer | AI Bug Writer, triage, duplicates, test generator | 2 to 3 h |
| 6 QA and release | Final QA report | 1.5 to 2.5 h |

Estimate: 3 days including your reviews, 2 days if reviews are quick.
