#!/usr/bin/env bash
set -euo pipefail
owner="${1:-}"; repo="${2:-}"
[ -n "$owner" ] && [ -n "$repo" ] || { echo "Usage: $0 <owner> <repo>"; exit 1; }
find . -type f \
  -not -path "./.git/*" \
  -exec sed -i "s#syalioune#$owner#g" {} + \
  -exec sed -i "s#flowatch#$repo#g" {} + \
  -exec sed -i "s#syalioune/flowatch#$owner/$repo#g" {} +
echo "Patched placeholders with $owner/$repo"