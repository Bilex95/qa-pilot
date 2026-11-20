#!/usr/bin/env bash
# Backend checks inside the running backend container: ruff, mypy, pytest. Run in WSL from any folder.
# Windows side: powershell -File scripts/with-wsl.ps1 -Up powershell -File scripts/py-checks.ps1
cd "$(dirname "$0")/.." || exit 1
docker compose exec -T backend ruff check . || exit 1
docker compose exec -T backend mypy app || exit 1
docker compose exec -T backend pytest -q 2>&1 | tail -15
exit "${PIPESTATUS[0]}"
