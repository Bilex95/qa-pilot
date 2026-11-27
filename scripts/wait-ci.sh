#!/usr/bin/env bash
# Waits for ALL workflow runs of one commit on Bilex95/qa-pilot and prints only the result.
#   bash scripts/wait-ci.sh <commit> [max-minutes]      (default 90)
# Prints nothing until every run for the commit has finished, then one line per run:
# "run <id> <workflow> <conclusion>", and "failed: <workflow> / <job>" for each failed job.
# Exit codes: 0 every run succeeded (skipped and neutral count as fine), 1 any run did not succeed,
# 2 no run found or timed out.
# Runs can start a little apart (CI, CodeQL, dependency graph), so after the first run appears the script
# waits a settle period and lists again, so a late workflow is not missed.
# Meant to be started as a background monitor; it polls quietly, so it costs no conversation tokens.
set -u
SHA="${1:-}"
MAX="${2:-90}"
REPO="Bilex95/qa-pilot"
SETTLE=60
case "$SHA" in
  "" | *[!0-9a-fA-F]*) echo "usage: wait-ci.sh <commit hash, hex only> [max-minutes]" >&2; exit 2 ;;
esac
case "$MAX" in
  "" | *[!0-9]*) echo "max-minutes must be a number" >&2; exit 2 ;;
esac
deadline=$(( $(date +%s) + MAX * 60 ))

# all run ids for this commit, one per line (every workflow, every event)
list_ids() {
  gh run list --repo "$REPO" --limit 100 --json databaseId,headSha \
    --jq ".[] | select(.headSha | startswith(\"$SHA\")) | .databaseId"
}

IDS=""
while [ -z "$IDS" ]; do
  IDS="$(list_ids)" || IDS=""
  [ -n "$IDS" ] && break
  if [ "$(date +%s)" -gt "$deadline" ]; then echo "no CI run found for $SHA"; exit 2; fi
  sleep 30
done

# let late starting workflows show up, then take the full list
sleep "$SETTLE"
MORE="$(list_ids)" || MORE=""
[ -n "$MORE" ] && IDS="$MORE"

# wait until every run is completed (re-list each round in case another one appears)
while :; do
  PENDING=0
  for ID in $IDS; do
    STATUS="$(gh run view "$ID" --repo "$REPO" --json status --jq .status 2>/dev/null)"
    [ "$STATUS" = "completed" ] || PENDING=1
  done
  [ "$PENDING" -eq 0 ] && break
  if [ "$(date +%s)" -gt "$deadline" ]; then echo "runs for $SHA still not finished after $MAX minutes"; exit 2; fi
  sleep 120
  MORE="$(list_ids)" || MORE=""
  [ -n "$MORE" ] && IDS="$MORE"
done

RESULT=0
for ID in $IDS; do
  NAME="$(gh run view "$ID" --repo "$REPO" --json workflowName --jq .workflowName)"
  CONCLUSION="$(gh run view "$ID" --repo "$REPO" --json conclusion --jq .conclusion)"
  echo "run $ID $NAME $CONCLUSION"
  case "$CONCLUSION" in
    success | skipped | neutral) ;;
    *)
      RESULT=1
      gh run view "$ID" --repo "$REPO" --json jobs --jq ".jobs[] | select(.conclusion == \"failure\") | \"failed: $NAME / \" + .name"
      ;;
  esac
done
exit "$RESULT"
