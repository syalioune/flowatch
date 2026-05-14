#!/usr/bin/env bash
set -euo pipefail
repo="${1:-}"; file="${2:-scripts/bootstrap-gh/milestones.json}"
[ -n "$repo" ] || { echo "Usage: $0 <owner/repo> [milestones.json]"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }
existing="$(gh api -H 'Accept: application/vnd.github+json' "repos/$repo/milestones?state=all")"
jq -c '.[]' "$file" | while read -r m; do
  title=$(jq -r '.title' <<<"$m")
  echo "Managing $title"
  state=$(jq -r '.state // "open"' <<<"$m")
  desc=$(jq -r '.description // ""' <<<"$m")
  number=$(jq -r --arg t "$title" '.[] | select(.title==$t) | .number' <<<"$existing" || true)
  if [[ -n "$number" ]]; then
    echo "Updating $title"
    gh api -X PATCH -H 'Accept: application/vnd.github+json' "repos/$repo/milestones/$number"       -f title="$title" -f state="$state" -f description="$desc" >/dev/null
  else
    echo "Creating $title"
    gh api -X POST -H 'Accept: application/vnd.github+json' "repos/$repo/milestones"       -f title="$title" -f state="$state" -f description="$desc" >/dev/null
  fi
done
echo "Milestones synced."