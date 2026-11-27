#!/usr/bin/env sh
# Keeps local test runs on the mock AI provider without touching .env (D-086). Run in WSL (or anywhere Docker is available).
#   sh scripts/ai-mock.sh on            recreate only the backend with docker-compose.test.yml, then check it is on the mock
#   sh scripts/ai-mock.sh off           restore the backend to its .env settings (plain compose file)
#   sh scripts/ai-mock.sh guard         check that the RUNNING backend is on the mock (exit 3 when it is not)
#   sh scripts/ai-mock.sh guard-env     the same check for the exec environment pytest uses (the -e flags of py-checks.sh)
# It never prints an environment value, only OK or a refusal.
set -u
cd "$(dirname "$0")/.."

CHECK='import sys
from app.core.config import get_settings
s = get_settings()
ok = s.ai_provider == "mock" and not s.ai_fallback_provider and not s.anthropic_api_key and not s.gemini_api_key and not s.openai_compat_api_key
sys.exit(0 if ok else 1)'

refuse() {
  echo "AI guard FAILED: the backend is not on the mock AI provider, so the tests were not run (no live provider may be reached by a test)." >&2
  exit 3
}

case "${1:-}" in
  on)
    docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --wait backend || exit 1
    docker compose exec -T backend python -c "$CHECK" || refuse
    echo "AI: mock (test mode, .env untouched)"
    ;;
  off)
    docker compose up -d --wait backend
    ;;
  guard)
    docker compose exec -T backend python -c "$CHECK" || refuse
    echo "AI: mock (test mode, .env untouched)"
    ;;
  guard-env)
    docker compose exec -T -e QAP_TEST_MODE=1 -e AI_PROVIDER=mock -e AI_FALLBACK_PROVIDER= -e ANTHROPIC_API_KEY= -e GEMINI_API_KEY= \
      -e OPENAI_COMPAT_API_KEY= backend python -c "$CHECK" || refuse
    echo "AI: mock (test mode, .env untouched)"
    ;;
  *)
    echo "usage: sh scripts/ai-mock.sh on|off|guard|guard-env" >&2
    exit 2
    ;;
esac
