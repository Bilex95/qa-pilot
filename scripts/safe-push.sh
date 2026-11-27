#!/usr/bin/env bash
# Safe push gate used at the end of every stage (D-034).
# Pushes ONE branch or ONE tag to origin only if every check passes:
#   1. branch mode: branch is not main (main changes only through an approved PR merge)
#      tag mode: tag exists locally, points at a commit already on origin/main (approved work only),
#      and does not exist on origin yet (tags are never moved or overwritten)
#   2. origin is the repo Bilex95/qa-pilot (public since 2026-11-25, D-073)
#   3. git config user.email is a verified email on the GitHub account
#      (public profile email, or the verified list from gh api user/emails when the email is private)
#   4. no .env file in any commit
#   5. no secret patterns in any commit (matches are reported by commit and path only, never printed)
# Never force pushes.
#
# Usage:  bash scripts/safe-push.sh [branch] [--dry-run]
#         bash scripts/safe-push.sh --tag <tag> [--dry-run]
#   branch     defaults to the current branch
#   --tag      push one tag instead of a branch
#   --dry-run  run every check, skip the push
set -euo pipefail

REPO="Bilex95/qa-pilot"
DRY_RUN=0
BRANCH=""
TAG=""
fail() { echo "BLOCKED: $*"; exit 1; }
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --tag) shift; [ $# -gt 0 ] || fail "--tag needs a tag name"; TAG="$1" ;;
    -*) fail "unknown option $1" ;;
    *) BRANCH="$1" ;;
  esac
  shift
done
[ -z "$TAG" ] || [ -z "$BRANCH" ] || fail "give a branch or --tag, not both"

# 1. what is being pushed
if [ -n "$TAG" ]; then
  git rev-parse --verify --quiet "refs/tags/$TAG" >/dev/null || fail "local tag $TAG does not exist"
  git fetch --quiet origin main || fail "could not fetch origin/main"
  TAG_COMMIT="$(git rev-parse "refs/tags/$TAG^{commit}")"
  git merge-base --is-ancestor "$TAG_COMMIT" origin/main || fail "tag $TAG points at ${TAG_COMMIT:0:7}, which is not on origin/main; tag only approved, merged work"
  set +e; git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; RC=$?; set -e
  [ "$RC" -eq 2 ] || { [ "$RC" -eq 0 ] && fail "tag $TAG already exists on origin; tags are never moved"; fail "could not list remote tags (exit $RC)"; }
  REF="refs/tags/$TAG"
  echo "ok   tag $TAG -> ${TAG_COMMIT:0:7} is on origin/main and new on origin"
else
  BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  [ "$BRANCH" != "main" ] || fail "refusing to push main directly; merge an approved PR instead"
  git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null || fail "local branch $BRANCH does not exist"
  REF="refs/heads/$BRANCH"
  echo "ok   branch $BRANCH"
fi

# 2. origin must be the expected repo
ORIGIN_URL="$(git remote get-url origin 2>/dev/null)" || fail "no origin remote"
case "$ORIGIN_URL" in
  *github.com/$REPO.git|*github.com/$REPO|*github.com:$REPO.git) ;;
  *) fail "origin is $ORIGIN_URL, expected $REPO" ;;
esac
VISIBILITY="$(gh repo view "$REPO" --json visibility --jq .visibility)" || fail "could not read repo visibility"
case "$VISIBILITY" in
  PRIVATE|PUBLIC) ;;
  *) fail "$REPO visibility is $VISIBILITY, expected PRIVATE or PUBLIC" ;;
esac
echo "ok   origin $REPO visibility is $VISIBILITY (the repository is public since 2026-11-25, D-073; every other check below still applies)"

# 3. commit email must be verified on the account
LOCAL_EMAIL="$(git config user.email | tr '[:upper:]' '[:lower:]')"
[ -n "$LOCAL_EMAIL" ] || fail "git config user.email is empty"
PUBLIC_EMAIL="$(gh api user --jq '.email // ""' | tr '[:upper:]' '[:lower:]')" || fail "gh api user failed"
# the account's own GitHub noreply address (id+login@users.noreply.github.com) is always allowed (D-073)
NOREPLY_EMAIL="$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"' | tr '[:upper:]' '[:lower:]')" || fail "gh api user failed"
if [ "$LOCAL_EMAIL" = "$NOREPLY_EMAIL" ]; then
  echo "ok   git email is the account's GitHub noreply address"
elif [ -n "$PUBLIC_EMAIL" ]; then
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
if [ -n "$TAG" ]; then
  git push origin "$REF:$REF"
  echo "PUSHED tag $TAG"
else
  git push -u origin "$REF:$REF"
  echo "PUSHED $BRANCH"
fi
