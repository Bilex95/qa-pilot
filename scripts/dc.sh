#!/usr/bin/env sh
# POSIX twin of scripts/dc.ps1: runs "docker compose <args>" from the repo root and, for `up`, checks the host ports first
# (scripts/dc-preflight.sh, I-24). Set QAP_SKIP_PREFLIGHT=1 to skip the check.
#   sh scripts/dc.sh up -d --wait
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-}" = "up" ] && [ "${QAP_SKIP_PREFLIGHT:-0}" != "1" ]; then
  sh scripts/dc-preflight.sh
fi
exec docker compose "$@"
