#!/usr/bin/env bash
# Helper for scripts/repro-i24-idle.ps1 (I-24). Runs inside WSL.
#   repro-i24-idle.sh                 bring the stack up and wait until it is healthy
#   repro-i24-idle.sh report "<time>" list docker.service stops and starts since <time> (WSL local time), then the stack health
cd "$(dirname "$0")/.."
if [ "${1:-}" = "report" ]; then
  since="$2"
  stops="$(journalctl -u docker.service --since "$since" --no-pager 2>/dev/null | grep -c 'Stopping docker.service' || true)"
  echo "docker.service stops since $since: $stops"
  journalctl -u docker.service --since "$since" --no-pager 2>/dev/null | grep -E 'Stopping docker.service|Started docker.service' | cut -c1-110
  if [ "$stops" = "0" ]; then echo "RESULT: Docker stayed up"; else echo "RESULT: Docker was stopped $stops time(s) while no WSL session was open"; fi
  exit 0
fi
docker compose up -d --wait 2>&1 | tail -4
