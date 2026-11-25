#!/usr/bin/env bash
# Waits for the CI run of one commit on Bilex95/qa-pilot and prints only the result.
#   bash scripts/wait-ci.sh <commit> [max-minutes]      (default 90)
# Prints nothing until the run has finished, then: "run <id> <conclusion>" and the names of failed jobs.
# Exit codes: 0 all green, 1 the run did not succeed, 2 no run found or timed out.
# Meant to be started as a background monitor; it polls quietly, so it costs no conversation tokens.
set -u
SHA="${1:-}"
MAX="${2:-90}"
REPO="Bilex95/qa-pilot"
case "$SHA" in
  "" | *[!0-9a-fA-F]*) echo "usage: wait-ci.sh <commit hash, hex only> [max-minutes]" >&2; exit 2 ;;
esac
case "$MAX" in
  "" | *[!0-9]*) echo "max-minutes must be a number" >&2; exit 2 ;;
esac
deadline=$(( $(date +%s) + MAX * 60 ))

ID=""
while [ -z "$ID" ]; do
  ID="$(gh run list --repo "$REPO" --limit 30 --json databaseId,headSha \
    --jq "[.[] | select(.headSha | startswith(\"$SHA\"))][0].databaseId // empty")" || ID=""
  [ -n "$ID" ] && break
  if [ "$(date +%s)" -gt "$deadline" ]; then echo "no CI run found for $SHA"; exit 2; fi
  sleep 30
done

while [ "$(gh run view "$ID" --repo "$REPO" --json status --jq .status 2>/dev/null)" != "completed" ]; do
  if [ "$(date +%s)" -gt "$deadline" ]; then echo "run $ID still not finished after $MAX minutes"; exit 2; fi
  sleep 120
done

CONCLUSION="$(gh run view "$ID" --repo "$REPO" --json conclusion --jq .conclusion)"
echo "run $ID $CONCLUSION"
gh run view "$ID" --repo "$REPO" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | "failed: " + .name'
[ "$CONCLUSION" = "success" ]
