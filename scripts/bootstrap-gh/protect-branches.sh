#!/usr/bin/env bash
# Protect the main branch of the Flowatch repo.
#
# Flowatch uses a single-branch model (just `main`) since it's pre-alpha
# with a single maintainer. If a develop/release flow is adopted later,
# extend this script to protect those branches too.
#
# Usage:  bash scripts/bootstrap-gh/protect-branches.sh <owner/repo> [main_approvals]
# Defaults: main requires 1 approving review.

set -euo pipefail
repo="${1:-}"; main_appr="${2:-1}"
[ -n "$repo" ] || { echo "Usage: $0 <owner/repo> [main_approvals]"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }

checks_file=".github/protection/required_checks.json"
[ -f "$checks_file" ] || { echo "Missing $checks_file"; exit 1; }
mapfile -t ctxs < <(jq -r '.[]' "$checks_file")

echo "Setting default branch to main on $repo…"
gh repo edit "$repo" --default-branch main

echo "Protecting main…"
args=( -X PUT "repos/$repo/branches/main/protection"
       -H "Accept: application/vnd.github+json"
       -F required_status_checks.strict=true )
for c in "${ctxs[@]}"; do args+=( -F "required_status_checks.contexts[]=$c" ); done
args+=( -F enforce_admins=true
        -F required_linear_history=true
        -F allow_force_pushes=false
        -F allow_deletions=false
        -F restrictions='null'
        -F required_pull_request_reviews.dismiss_stale_reviews=true
        -F required_pull_request_reviews.require_code_owner_reviews=true
        -F required_pull_request_reviews.required_approving_review_count="$main_appr" )

gh api "${args[@]}" >/dev/null || { echo "Failed to protect main"; exit 1; }

# Require signed commits on main (best-effort; existing protection is preserved if this fails).
gh api -X POST \
       -H "Accept: application/vnd.github+json" \
       "repos/$repo/branches/main/protection/required_signatures" >/dev/null || true

echo "Done."
