#!/usr/bin/env sh
# Runs the Postman collection with Newman inside Docker, on the Compose network, so the whole run is one WSL session
# (I-24, D-048). Node is not installed in WSL on the build machine, so Newman runs in a throwaway container built from the
# frontend image (which has Node). Pinned: newman@6.2.3. Needs the stack up and the baseline seed.
#
#   sh scripts/newman.sh            (inside WSL, or anywhere Docker is available)
#   powershell -File scripts/newman.ps1   (from Windows)
# Reads SEED_USER_PASSWORD from the environment or .env and never prints it. The exit code is Newman's.
set -eu
cd "$(dirname "$0")/.."
PW="${SEED_USER_PASSWORD:-}"
if [ -z "$PW" ] && [ -f .env ]; then
  PW="$(grep -E '^SEED_USER_PASSWORD=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')"
fi
if [ -z "$PW" ]; then
  echo "SEED_USER_PASSWORD is missing: set it in .env or the environment" >&2
  exit 2
fi
export PW
exec docker compose run --rm --no-deps --no-TTY -e PW -v "$PWD/postman:/postman:ro" --entrypoint sh frontend -c \
  'npx --yes newman@6.2.3 run /postman/qa-pilot.postman_collection.json -e /postman/local.postman_environment.json --working-dir /postman --env-var "baseUrl=http://backend:8000" --env-var "password=$PW" --reporters cli --color off'
