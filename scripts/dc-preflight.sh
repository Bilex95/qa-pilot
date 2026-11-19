#!/usr/bin/env sh
# Refuses `docker compose up` when a host port the stack needs belongs to something else (I-24, D-048).
#
# Why: if a first start fails because a port is taken, the restart policy can start the container later and leave it
# running without a network (Stage 3 incident). Refusing up front leaves nothing half started.
#
# A port that belongs to this same Compose project (default qa-pilot) is fine: `up` is then a no-op for that service.
# A port that belongs to anything else, including another clone under a different project name, is a refusal that
# names the owner. Exit 0 = go ahead, exit 1 = refused, nothing was started.
#
# Run where Docker is available (inside WSL on the build machine). Environment:
#   COMPOSE_PROJECT_NAME  project that may own the ports (default qa-pilot)
#   QAP_PREFLIGHT_PORTS   ports to check (default: 3000 8000 and DB_HOST_PORT, from the environment, .env or 5433)
set -eu
cd "$(dirname "$0")/.."

PROJECT="${COMPOSE_PROJECT_NAME:-qa-pilot}"
if [ -z "${DB_HOST_PORT:-}" ] && [ -f .env ]; then
  DB_HOST_PORT="$(grep -E '^DB_HOST_PORT=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')"
fi
PORTS="${QAP_PREFLIGHT_PORTS:-3000 8000 ${DB_HOST_PORT:-5433}}"

refused=""
for port in $PORTS; do
  # 1. Containers publishing the port: ours is fine, anyone else's is a refusal
  owners="$(docker ps --filter "publish=$port" --format '{{.Names}}|{{.Label "com.docker.compose.project"}}' 2>/dev/null || true)"
  if [ -n "$owners" ]; then
    foreign=""
    for line in $owners; do
      name="${line%%|*}"
      proj="${line#*|}"
      [ "$proj" = "$PROJECT" ] && continue
      foreign="$foreign ${name} (Compose project ${proj:-none})"
    done
    if [ -n "$foreign" ]; then
      refused="$refused
  port $port is published by container${foreign}"
    fi
    continue
  fi
  # 2. Any other listener on the port
  listener="$(ss -ltnpH "( sport = :$port )" 2>/dev/null | head -n 1 || true)"
  if [ -n "$listener" ]; then
    proc="$(printf '%s' "$listener" | sed -n 's/.*users:(("\([^"]*\)",pid=\([0-9]*\).*/\1 (pid \2)/p')"
    refused="$refused
  port $port is in use by ${proc:-a program that could not be named (run with sudo to see it)}"
  fi
done

if [ -n "$refused" ]; then
  echo "Refusing to start: the stack needs ports it cannot have.$refused" >&2
  echo "Nothing was started. Stop the program or stack that owns the port (or change DB_HOST_PORT in .env for the database), then run up again." >&2
  exit 1
fi
echo "Preflight ok: ports $PORTS are free or already belong to project $PROJECT."
