#!/usr/bin/env sh
# I-24 reproduction: a host port that is already taken when the stack starts, before and after the fix.
# Run inside WSL (or anywhere Docker is available):   sh scripts/repro-i24.sh
#
# SAFETY: everything here runs in its OWN Compose project (qapilot-i24-repro), on its own host port (15433), with its own
# containers, network and volumes. The real stack (project qa-pilot, port 5433) is never touched. There are exactly two
# `down -v` lines in this file (one between the before and after runs, one in cleanup()); both are written as
# `docker compose -p "$P" down -v` and $P is checked above to be the throwaway project before anything runs.
set -eu
cd "$(dirname "$0")/.."

P=qapilot-i24-repro
PORT=15433
if [ "$P" = "qa-pilot" ]; then echo "refusing: the throwaway project must not be qa-pilot" >&2; exit 99; fi

# Dummy settings so compose can read the db service; the real .env is not used for these
export POSTGRES_USER=repro POSTGRES_PASSWORD=repro POSTGRES_DB=repro DB_HOST_PORT="$PORT"
DC="docker compose -p $P"

# Guard: compose must really resolve to the throwaway project name before anything is created or removed
if ! docker compose -p "$P" config --format json | grep -q "\"name\": \"$P\""; then
  echo "refusing: compose did not resolve to project $P" >&2
  exit 99
fi

LISTENER=""
cleanup() {
  [ -n "$LISTENER" ] && kill "$LISTENER" 2>/dev/null || true
  # Removes ONLY the throwaway project's containers, network and volumes (never qa-pilot)
  docker compose -p "$P" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

state() {
  echo "  containers of project $P:"
  ids="$(docker ps -aq --filter "label=com.docker.compose.project=$P")"
  if [ -z "$ids" ]; then echo "    none"; return; fi
  for id in $ids; do
    docker inspect -f '    {{.Name}} state={{.State.Status}} restarts={{.RestartCount}} networks=[{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}]' "$id"
  done
}
count() { docker ps -aq --filter "label=com.docker.compose.project=$P" | wc -l | tr -d ' '; }
fail=0
check() { if [ "$1" = "yes" ]; then echo "  PASS: $2"; else echo "  FAIL: $2"; fail=1; fi; }

echo "== Something else already owns host port $PORT"
python3 -m http.server "$PORT" --bind 0.0.0.0 >/dev/null 2>&1 &
LISTENER=$!
sleep 1

echo
echo "== BEFORE the fix: plain docker compose up (no preflight)"
set +e
out="$($DC up -d --no-deps db 2>&1)"
rc=$?
set -e
printf '%s\n' "$out" | tail -4
echo "  exit code of up: $rc"
state
echo "  waiting 20 s for the restart policy (restart: unless-stopped) to act..."
sleep 20
state
docker compose -p "$P" down -v --remove-orphans >/dev/null 2>&1 || true

echo
echo "== AFTER the fix: preflight refuses, nothing is started"
set +e
COMPOSE_PROJECT_NAME="$P" QAP_PREFLIGHT_PORTS="$PORT" sh scripts/dc-preflight.sh
rc=$?
set -e
echo "  exit code of preflight: $rc"
state
[ "$rc" = "1" ] && check yes "preflight refused with exit code 1" || check no "preflight refused with exit code 1"
[ "$(count)" = "0" ] && check yes "no container was left behind" || check no "no container was left behind"

echo
echo "== Same project owns the port: up is a no-op and the preflight passes"
kill "$LISTENER" 2>/dev/null || true
LISTENER=""
sleep 1
$DC up -d --wait --no-deps db 2>&1 | tail -3
set +e
COMPOSE_PROJECT_NAME="$P" QAP_PREFLIGHT_PORTS="$PORT" sh scripts/dc-preflight.sh
rc=$?
set -e
[ "$rc" = "0" ] && check yes "own project's port is accepted (exit 0)" || check no "own project's port is accepted (exit 0)"

echo
echo "== Another clone (different project name) owns the port: refused, owner named"
set +e
COMPOSE_PROJECT_NAME=qa-pilot-other-clone QAP_PREFLIGHT_PORTS="$PORT" sh scripts/dc-preflight.sh
rc=$?
set -e
[ "$rc" = "1" ] && check yes "another project's port is refused (exit 1)" || check no "another project's port is refused (exit 1)"

echo
if [ "$fail" = "0" ]; then echo "RESULT: PASS"; else echo "RESULT: FAIL"; exit 1; fi
