# Environment

Checked on 2026-11-16 during Stage 0.

| Tool | Version | Notes |
|---|---|---|
| OS | Windows 11 Pro 10.0.26200 | Primary shell PowerShell 5.1; Git Bash also available |
| git | 2.55.0.windows.2 | |
| Docker Engine | 29.4.0 | Runs inside WSL 2 (Ubuntu 24.04.1), not Docker Desktop. Daemon running. |
| Docker Compose | v5.1.1 (plugin, v2 CLI syntax) | Inside WSL Ubuntu |
| Node.js | v24.14.0 | Windows host |
| npm | 11.9.0 | Windows host |
| Python | 3.12.10 | Windows host; Docker is the primary runtime |
| WSL | Version 2, default distro Ubuntu | Limited to 8 GB memory and 4 GB swap by `%USERPROFILE%\.wslconfig` (see below) |

## How to call Docker on this machine

Docker is not on the Windows PATH. Run it through WSL from the project folder:

```powershell
wsl -d Ubuntu --cd /mnt/c/Users/<you>/qa-pilot -- docker compose up -d
wsl -d Ubuntu --cd /mnt/c/Users/<you>/qa-pilot -- docker compose ps
```

Helper scripts in `scripts/*.ps1` (added in Stage 3) wrap this. On a machine with Docker Desktop the plain `docker compose ...` commands in `CLAUDE.md` work unchanged. See D-001.

## WSL idle shutdown (found in Stage 3)

WSL ends the distro, and systemd stops the Docker Engine inside it, a few seconds after the last `wsl` session ends. Measured in Stage 4 (I-24, D-048): with no session open, `docker.service` was stopped 15 seconds after the last `wsl` call (13:15:56 to 13:16:11). The next `wsl` command starts Docker again and `restart: unless-stopped` brings the containers back, but anything talking to them in between fails. Tools that run on Windows (Playwright, the layout check) are not WSL sessions, so a run could lose the stack halfway: Newman showed 503 and 500 responses and then no responses at all (see the Stage 4 review, I-24).

What to do, in order:
1. **Use the wrappers.** `powershell -File scripts/with-wsl.ps1 <command>` holds one WSL session for exactly one Windows command and closes it in `finally`, for example `powershell -File scripts/with-wsl.ps1 -Up node scripts/check-app-layout.mjs` (`-Up` brings the stack up first, inside the held session, because the containers need about half a minute to come back after the distro was idle). `powershell -File scripts/newman.ps1` runs Newman inside Docker as one WSL session (Node is not installed in WSL), so it needs no hold. `scripts/dc.ps1` and `scripts/repro-i24-idle.ps1 [-Hold]` show the effect.
2. **Keep a WSL terminal open** while you work by hand (`wsl -d Ubuntu` in a PowerShell window). That is your own session and needs nothing from the build.
3. **Optional, applied by the product owner only:** WSL has a per distro idle timer. Community reports say it is `instanceIdleTimeout` under `[general]` in `%USERPROFILE%\.wslconfig` (default about 15 seconds, `-1` turns it off, applies to every distro, needs `wsl --shutdown` to take effect); one report also says `vmIdleTimeout=-1` under `[wsl2]` does not keep a distro up, so treat that one as unverified. Check the current Microsoft documentation for WSL 2.6.x before applying either. The build never edits `.wslconfig`.

## Container left without a network (found in Stage 3)

If a container's first start fails (for example `Bind for 0.0.0.0:5433 failed: port is already allocated`) and the restart policy starts it later, Docker can leave it running with no network attached. Other services then fail with `failed to resolve host 'db'` and restart in a loop. Since I-24 (D-048) this is prevented and diagnosed:
* `scripts/dc.ps1 up` and `sh scripts/dc.sh up` run `scripts/dc-preflight.sh` first. A host port owned by this Compose project (qa-pilot) is fine; a port owned by anything else, including another clone under a different project name, is refused with the owner named, and nothing is started.
* The backend runs `python -m app.core.db_preflight` before migrations. It retries resolving `db` for about 30 seconds, then exits with a message that says the container has no network and names the fix.
* `scripts/repro-i24.sh` reproduces the failed start in a throwaway project: the container is left in the `created` state with no network.

If it still happens, check with `docker inspect -f '{{.NetworkSettings.Networks}}' qa-pilot-db-1`; fix by recreating the containers, which keeps the data in the named volumes:

```
docker compose up -d --force-recreate --wait
```

## Tests use the mock AI provider (D-086)

Your `.env` may name a live AI provider and keys. Local test runs never use them and never edit `.env`: `scripts/py-checks.sh` runs pytest with the mock set through `docker compose exec -e`, and `scripts/newman.sh`, `scripts/run-flows.ps1` and `scripts/e2e.ps1` recreate only the backend with `docker-compose.test.yml` and restore it afterwards (a `trap` or `finally`, also on failure). A guard refuses to run when the backend is not on the mock. After an interrupted run, `docker compose up -d --wait backend` returns the backend to its `.env` settings.

## Bundler in the dev container (found in Stage 3)

The frontend container runs `next dev --webpack` with polling. Turbopack, the Next 16 default, did not see file changes on the WSL bind mount and served stale code (D-042).

## Memory limits and working rules (set before Stage 4 work, 2026-11-18)

The laptop has 16 GB of RAM (2 x 8 GB; Windows reports 15.7 GB). With Docker, the Next.js dev server and Playwright running together, Windows ran critically low on memory and Claude Code stopped a background process. WSL is now limited by `%USERPROFILE%\.wslconfig` (created on 2026-11-18; no earlier file existed):

```
[wsl2]
memory=8GB
swap=4GB

[experimental]
autoMemoryReclaim=gradual
```

Applied with `dc.ps1 stop`, `wsl --shutdown`, `dc.ps1 up -d --wait`. Measured afterwards: WSL total 7.8 GiB, about 2.0 GiB used with the stack running, swap 4 GiB (none used); Windows process `vmmemWSL` about 2.6 GB. Volume data was kept (rows the seed never creates were still present).

Rules for the build from now on:

1. Stop the dev stack when not testing (`powershell -File scripts/dc.ps1 stop`; data stays in the volumes) and start it only when needed with `powershell -File scripts/dc.ps1 up -d --wait`.
2. Run heavy tasks one after another, never at the same time: the full layout check (`check-app-layout.mjs`), the sign out check, the prototype checks (`validate-design.ps1`), screenshot capture, image builds and CI style runs.
3. No free running WSL keepalive. A WSL hold is allowed only inside `scripts/with-wsl.ps1`: scoped to one task, always closed in `finally`, capped at one hour (D-048). When testing by hand, the product owner keeps a PowerShell window open with `wsl -d Ubuntu`.
4. If memory still runs short, stop the frontend container first (`dc.ps1 stop frontend`); backend tests and Newman do not need it.
