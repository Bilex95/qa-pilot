#!/usr/bin/env bash
# Backend checks inside the running backend container: ruff, mypy, pytest. Run in WSL from any folder.
# Windows side: powershell -File scripts/with-wsl.ps1 -Up powershell -File scripts/py-checks.ps1
cd "$(dirname "$0")/.." || exit 1
# Tests always run on the mock AI provider through exec -e flags, so the dev backend container keeps its .env settings (D-086).
sh scripts/ai-mock.sh guard-env || exit 3
docker compose exec -T backend ruff check . || exit 1
docker compose exec -T backend mypy app || exit 1
docker compose exec -T -e QAP_TEST_MODE=1 -e AI_PROVIDER=mock -e AI_FALLBACK_PROVIDER= -e ANTHROPIC_API_KEY= -e GEMINI_API_KEY= \
  -e OPENAI_COMPAT_API_KEY= backend pytest -q 2>&1 | tail -15
exit "${PIPESTATUS[0]}"
