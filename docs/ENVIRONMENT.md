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
| WSL | Version 2, default distro Ubuntu | |

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
3. Set `vmIdleTimeout=-1` under `[wsl2]` in `%USERPROFILE%\.wslconfig` (machine wide setting; not changed by this project).
