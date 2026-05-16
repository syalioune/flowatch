#!/usr/bin/env bash
set -euo pipefail
command -v gh >/dev/null 2>&1 || { echo "gh CLI is required." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required."   >&2; exit 1; }

repo="${1:-}"
[ -n "$repo" ] || { echo "Usage: $0 <owner/repo>"; exit 1; }

labels_file="scripts/bootstrap-gh/labels.json"
[ -f "$labels_file" ] || { echo "Missing $labels_file"; exit 1; }

jq -c '.[]' "$labels_file" | while read -r label; do
  name=$(jq -r '.name'        <<<"$label")
  color=$(jq -r '.color'       <<<"$label")
  desc=$(jq -r '.description' <<<"$label")
  name_enc=$(jq -rn --arg s "$name" '$s|@uri')

  echo "Upserting label: $name"

  # Try PATCH first (update existing); fall back to POST (create) on 404.
  gh api --method PATCH \
         -H "Accept: application/vnd.github+json" \
         "repos/$repo/labels/$name_enc" \
         -f new_name="$name" -f color="$color" -f description="$desc" \
         >/dev/null 2>&1 \
    || gh api --method POST \
              -H "Accept: application/vnd.github+json" \
              "repos/$repo/labels" \
              -f name="$name" -f color="$color" -f description="$desc" \
              >/dev/null
done

echo "Done."
