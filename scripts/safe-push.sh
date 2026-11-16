#!/usr/bin/env bash
# Safe push gate used at the end of every stage (D-034).
# Pushes ONE branch to origin only if every check passes:
#   1. branch is not main (main changes only through an approved PR merge)
#   2. origin is the PRIVATE repo Bilex95/qa-pilot
#   3. git config user.email is a verified email on the GitHub account
#      (public profile email, or the verified list from gh api user/emails when the email is private)
#   4. no .env file in any commit
#   5. no secret patterns in any commit (matches are reported by commit and path only, never printed)
# Never force pushes.
#
# Usage:  bash scripts/safe-push.sh [branch] [--dry-run]
#   branch     defaults to the current branch
#   --dry-run  run every check, skip the push
set -euo pipefail

REPO="Bilex95/qa-pilot"
DRY_RUN=0
BRANCH=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -*) echo "BLOCKED: unknown option $arg"; exit 2 ;;
    *) BRANCH="$arg" ;;
  esac
done
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
fail() { echo "BLOCKED: $*"; exit 1; }

# 1. never push main directly
[ "$BRANCH" != "main" ] || fail "refusing to push main directly; merge an approved PR instead"
git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null || fail "local branch $BRANCH does not exist"
echo "ok   branch $BRANCH"

# 2. origin must be the private repo
ORIGIN_URL="$(git remote get-url origin 2>/dev/null)" || fail "no origin remote"
case "$ORIGIN_URL" in
  *github.com/$REPO.git|*github.com/$REPO|*github.com:$REPO.git) ;;
  *) fail "origin is $ORIGIN_URL, expected $REPO" ;;
esac
VISIBILITY="$(gh repo view "$REPO" --json visibility --jq .visibility)" || fail "could not read repo visibility"
[ "$VISIBILITY" = "PRIVATE" ] || fail "$REPO visibility is $VISIBILITY, must be PRIVATE"
echo "ok   origin $REPO is PRIVATE"

# 3. commit email must be verified on the account
LOCAL_EMAIL="$(git config user.email | tr '[:upper:]' '[:lower:]')"
[ -n "$LOCAL_EMAIL" ] || fail "git config user.email is empty"
PUBLIC_EMAIL="$(gh api user --jq '.email // ""' | tr '[:upper:]' '[:lower:]')" || fail "gh api user failed"
if [ -n "$PUBLIC_EMAIL" ]; then
  # GitHub only allows a verified address as the public profile email
  [ "$LOCAL_EMAIL" = "$PUBLIC_EMAIL" ] || fail "git email does not match the account's verified profile email; tell the owner before pushing"
  echo "ok   git email matches the verified public profile email"
else
  VERIFIED="$(gh api user/emails --jq '.[] | select(.verified) | .email' 2>/dev/null | tr '[:upper:]' '[:lower:]')" \
    || fail "profile email is private and gh api user/emails failed; run: gh auth refresh -h github.com -s user"
  printf '%s\n' "$VERIFIED" | grep -qxF "$LOCAL_EMAIL" || fail "git email is not in the account's verified emails; tell the owner before pushing"
  echo "ok   git email is in the account's verified email list"
fi

# 4. no .env file in history (only .env.example is allowed)
ENV_FILES="$(git log --all --name-only --pretty=format: | sort -u | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' || true)"
[ -z "$ENV_FILES" ] || fail "env file committed in history: $ENV_FILES"
echo "ok   no .env files in any commit"

# 5. secret scan over every commit; git grep exits 0 on a match, 1 on no match, >1 on error
PATTERN='sk-ant-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[abpr]-[A-Za-z0-9-]{10,}'
set +e
HITS="$(git grep -lIE "$PATTERN" $(git rev-list --all) -- . ':!*package-lock.json' 2>&1)"
RC=$?
set -e
if [ "$RC" -eq 0 ]; then
  echo "SECRET FOUND in (commit:path):"
  printf '%s\n' "$HITS" | sort -u | head -20
  fail "secret scan matched; remove the secret from history before pushing"
elif [ "$RC" -ne 1 ]; then
  fail "secret scan could not run (git grep exit $RC): $HITS"
fi
echo "ok   no secret patterns in $(git rev-list --all | wc -l | tr -d ' ') commits"

# all gates passed
if [ "$DRY_RUN" -eq 1 ]; then echo "DRY RUN: all checks passed, push skipped"; exit 0; fi
git push -u origin "refs/heads/$BRANCH:refs/heads/$BRANCH"
echo "PUSHED $BRANCH"
