#!/usr/bin/env bash
# Frontend gate in one off containers: lint, typecheck, next build, then a clean .next volume and a /login check.
# Run in WSL from any folder. Windows side (output to a file, exit code from the tool result):
#   & <repo>\scripts\with-wsl.ps1 -Up <repo>\scripts\frontend-gate.ps1 > <repo>\.gate\frontend-gate.txt 2>&1
cd "$(dirname "$0")/.." || exit 1
mkdir -p .gate
docker compose stop frontend 2>&1 | tail -2
echo "== lint and typecheck (one off container)"
timeout 300 docker compose run --rm --no-deps frontend sh -c 'npm run lint && echo LINT-OK && npm run typecheck && echo TYPECHECK-OK' > .gate/frontend-checks.txt 2>&1
checks=$?
grep -v "^$" .gate/frontend-checks.txt | grep -v "npm notice" | tail -30 | cut -c1-200
echo "checks exit $checks"
echo "== next build (one off container)"
timeout 500 docker compose run --rm --no-deps frontend npm run build > .gate/frontend-build.txt 2>&1
build=$?
grep -v "npm notice" .gate/frontend-build.txt | tail -45 | cut -c1-160
echo "build exit $build"
echo "== clear the .next cache volume so the dev server starts clean"
docker compose run --rm --no-deps frontend sh -c 'rm -rf /app/.next/* /app/.next/.[!.]* 2>/dev/null; ls -A /app/.next | wc -l'
docker compose up -d --wait frontend 2>&1 | tail -3
echo "== /login status"
curl -s -o /dev/null -w '%{http_code}\n' --max-time 120 http://localhost:3000/login
if [ "$checks" -ne 0 ] || [ "$build" -ne 0 ]; then exit 1; fi
