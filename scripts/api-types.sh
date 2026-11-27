#!/usr/bin/env sh
# Regenerate the API contract after backend schema changes (docs/API_BOUNDARY.md rule 8).
#   1. export OpenAPI from the running backend container to frontend/openapi.json
#   2. generate frontend/src/lib/api/schema.d.ts from it
# Run where docker is available (on the build machine: wsl -d Ubuntu --cd /mnt/c/Users/<you>/qa-pilot -- sh scripts/api-types.sh)
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T backend python -m app.openapi_export > frontend/openapi.json
docker compose exec -T frontend npx openapi-typescript openapi.json -o src/lib/api/schema.d.ts
echo "Contract regenerated: frontend/openapi.json and frontend/src/lib/api/schema.d.ts"
