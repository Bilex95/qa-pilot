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
wsl -d Ubuntu --cd /mnt/c/Users/HP/qa-pilot -- docker compose up -d
wsl -d Ubuntu --cd /mnt/c/Users/HP/qa-pilot -- docker compose ps
```

Helper scripts in `scripts/*.ps1` (added in Stage 3) wrap this. On a machine with Docker Desktop the plain `docker compose ...` commands in `CLAUDE.md` work unchanged. See D-001.

## WSL idle shutdown (found in Stage 3)

WSL stops its virtual machine when no WSL process has run for a while, and Docker inside it stops too. The next `wsl` command starts it again and `restart: unless-stopped` brings the containers back, but anything talking to them in between fails (seen as "connection closed" on `localhost:8000`).

Options, from least to most invasive:
1. Keep any WSL terminal open while working (during the build a background `wsl -d Ubuntu -- sleep` keeps it alive and is stopped at the end of each stage).
2. Run `powershell -File scripts/dc.ps1 up -d` again after a pause; it waits for healthchecks.
3. Change the machine wide WSL settings in `%USERPROFILE%\.wslconfig`. That file is now managed as described in [Memory limits and working rules](#memory-limits-and-working-rules-set-before-stage-4-work-2026-11-18) below (8 GB memory, 4 GB swap, gradual memory reclaim). It does not set `vmIdleTimeout`, so WSL still stops when idle; add `vmIdleTimeout=-1` under `[wsl2]` only if the product owner decides to.

## Container left without a network (found in Stage 3)

If a container's first start fails (for example `Bind for 0.0.0.0:5433 failed: port is already allocated`) and the restart policy starts it later, Docker can leave it running with no network attached. Other services then fail with `failed to resolve host 'db'` and restart in a loop. Check with `docker inspect -f '{{.NetworkSettings.Networks}}' qa-pilot-db-1`; fix by recreating the containers, which keeps the data in the named volumes:

```
docker compose up -d --force-recreate --wait
```

## Bundler in the dev container (found in Stage 3)

The frontend container runs `next dev --webpack` with polling. Turbopack, the Next 16 default, did not see file changes on the WSL bind mount and served stale code (D-042).

## Memory limits and working rules (set before Stage 4 work, 2026-11-18)

The laptop has 16 GB of RAM (2 x 8 GB; Windows reports 15.7 GB). With Docker, the Next.js dev server and Playwright running together, Windows ran critically low on memory and Claude Code stopped a background process. WSL is now limited by `C:\Users\HP\.wslconfig` (created on 2026-11-18; no earlier file existed):

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
3. Do not start a WSL keepalive unless the product owner asks. When testing by hand, the product owner keeps a PowerShell window open with `wsl -d Ubuntu`.
4. If memory still runs short, stop the frontend container first (`dc.ps1 stop frontend`); backend tests and Newman do not need it.
