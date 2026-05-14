#!/usr/bin/env bash
set -euo pipefail
if ! command -v gh >/dev/null 2>&1; then echo "gh CLI is required." >&2; exit 1; fi
repo="${1:-}"
[ -n "$repo" ] || { echo "Usage: $0 <owner/repo>"; exit 1; }
labels_file="scripts/bootstrap-gh/labels.json"
[ -f "$labels_file" ] || { echo "Missing $labels_file"; exit 1; }
jq -c '.[]' "$labels_file" | while read -r label; do
  name=$(jq -r '.name' <<<"$label")
  color=$(jq -r '.color' <<<"$label")
  desc=$(jq -r '.description' <<<"$label")
  echo "Upserting label: $name"
  gh api --method PATCH -H "Accept: application/vnd.github+json"     "repos/$repo/labels/$(python -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1]))' "$name")"     -f new_name="$name" -f color="$color" -f description="$desc" >/dev/null ||   gh api --method POST -H "Accept: application/vnd.github+json" "repos/$repo/labels"     -f name="$name" -f color="$color" -f description="$desc" >/dev/null
done
echo "Done."
