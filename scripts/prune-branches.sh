#!/usr/bin/env bash
# prune-branches.sh — identify and optionally delete stale remote branches.
#
# "Stale" = merged (regular or squash) into develop or main, excluding protected branches.
# Dependabot branches are included (they accumulate fast).
#
# Usage:
#   bash scripts/prune-branches.sh              # dry-run: list candidates
#   bash scripts/prune-branches.sh --delete     # actually delete from origin
#   bash scripts/prune-branches.sh --age 90     # also include unmerged branches
#                                               # with no commits in N days
#   bash scripts/prune-branches.sh --age 90 --delete

set -euo pipefail

REMOTE="origin"
PROTECTED=("main" "develop")
DELETE=false
AGE_DAYS=""

usage() {
  sed -n '3,12p' "$0" | sed 's/^# //'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --delete) DELETE=true ;;
    --age)    AGE_DAYS="$2"; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
  shift
done

# Refresh remote refs
git fetch --prune "$REMOTE" --quiet

is_protected() {
  local branch="$1"
  for p in "${PROTECTED[@]}"; do
    [[ "$branch" == "$p" ]] && return 0
  done
  return 1
}

# Returns 0 if the branch's changes are already in base_ref (squash merge)
is_squash_merged() {
  local ref="$1" base_ref="$2"
  local merge_base squash_commit result
  merge_base=$(git merge-base "$base_ref" "$ref" 2>/dev/null) || return 1
  squash_commit=$(git commit-tree "${ref}^{tree}" -p "$merge_base" -m "squash-test" 2>/dev/null) || return 1
  result=$(git cherry "$base_ref" "$squash_commit" 2>/dev/null)
  [[ "$result" == "-"* ]]
}

# Returns 0 if all commits in branch are already in base_ref by patch ID (rebase merge)
is_rebase_merged() {
  local ref="$1" base_ref="$2"
  local cherry_out
  cherry_out=$(git cherry "$base_ref" "$ref" 2>/dev/null)
  # non-empty (has commits ahead) but none marked "+" (unmerged)
  [[ -n "$cherry_out" ]] && ! echo "$cherry_out" | grep -q "^+"
}

# Collect all remote branches (excluding HEAD pseudo-ref)
ALL_REMOTE_BRANCHES=()
while IFS= read -r ref; do
  branch="${ref#"$REMOTE/"}"
  is_protected "$branch" && continue
  ALL_REMOTE_BRANCHES+=("$branch")
done < <(git branch -r | grep "^\s*$REMOTE/" | sed 's/^\s*//' | grep -v "HEAD")

# Collect merged branches (regular merge OR squash merge into develop or main)
declare -A STALE
for base in develop main; do
  # Fast path: regular merges
  while IFS= read -r ref; do
    branch="${ref#"$REMOTE/"}"
    is_protected "$branch" && continue
    STALE["$branch"]="merged into $base"
  done < <(git branch -r --merged "$REMOTE/$base" | grep "^\s*$REMOTE/" | sed 's/^\s*//')

  # Slow path: squash + rebase merges (check every branch not already tagged)
  for branch in "${ALL_REMOTE_BRANCHES[@]}"; do
    [[ -v "STALE[$branch]" ]] && continue
    if is_squash_merged "$REMOTE/$branch" "$REMOTE/$base"; then
      STALE["$branch"]="squash-merged into $base"
    elif is_rebase_merged "$REMOTE/$branch" "$REMOTE/$base"; then
      STALE["$branch"]="rebase-merged into $base"
    fi
  done
done

# Optionally collect unmerged branches with no commits in AGE_DAYS
if [[ -n "$AGE_DAYS" ]]; then
  cutoff_epoch=$(date -d "$AGE_DAYS days ago" +%s 2>/dev/null || date -v "-${AGE_DAYS}d" +%s)
  for branch in "${ALL_REMOTE_BRANCHES[@]}"; do
    [[ -v "STALE[$branch]" ]] && continue
    last_commit_epoch=$(git log -1 --format="%ct" "$REMOTE/$branch" 2>/dev/null || echo 0)
    if [[ "$last_commit_epoch" -lt "$cutoff_epoch" ]]; then
      STALE["$branch"]="unmerged, no commits in ${AGE_DAYS}d"
    fi
  done
fi

if [[ ${#STALE[@]} -eq 0 ]]; then
  echo "No stale branches found."
  exit 0
fi

echo "Stale branches on $REMOTE (${#STALE[@]} total):"
echo "---------------------------------------------------"
printf "%-55s  %s\n" "BRANCH" "REASON"
printf "%-55s  %s\n" "------" "------"
for branch in $(printf '%s\n' "${!STALE[@]}" | sort); do
  printf "%-55s  %s\n" "$branch" "${STALE[$branch]}"
done
echo

if [[ "$DELETE" == false ]]; then
  echo "Dry run — pass --delete to remove these from $REMOTE."
  exit 0
fi

echo "Deleting ${#STALE[@]} branch(es) from $REMOTE..."
FAILED=()
for branch in "${!STALE[@]}"; do
  if git push "$REMOTE" --delete "$branch" 2>/dev/null; then
    echo "  deleted: $branch"
  else
    echo "  FAILED:  $branch"
    FAILED+=("$branch")
  fi
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo ""
  echo "Failed to delete ${#FAILED[@]} branch(es): ${FAILED[*]}"
  exit 1
fi

echo "Done."
