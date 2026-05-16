#!/usr/bin/env bash
# Protect the long-lived branches of the Flowatch repo (`main` + `develop`).
#
# Flowatch uses a two-branch model (DEVELOPERS.md §3):
#   - `develop` is the integration branch; feature/fix branches PR into it,
#     and Dependabot targets it.
#   - `main` only receives releases (promoted from `develop` via `release/*`
#     branches per release.config.mjs).
#
# Usage:  bash scripts/bootstrap-gh/protect-branches.sh <owner/repo> [main_approvals] [develop_approvals]
# Defaults: main requires 1 approving review; develop requires 1.

set -euo pipefail
repo="${1:-}"; main_appr="${2:-1}"; dev_appr="${3:-1}"
[ -n "$repo" ] || { echo "Usage: $0 <owner/repo> [main_approvals] [develop_approvals]"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }

checks_file=".github/protection/required_checks.json"
[ -f "$checks_file" ] || { echo "Missing $checks_file"; exit 1; }
mapfile -t ctxs < <(jq -r '.[]' "$checks_file")

# Apply the same protection ruleset to one branch.
# Args: branch_name, required_approving_review_count
protect_branch() {
  local branch="$1" appr="$2"
  echo "Protecting $branch…"

  # GitHub's branch-protection endpoint expects nested JSON objects for
  # required_status_checks and required_pull_request_reviews. `gh api -F`
  # only supports flat key=value pairs, so build the body with jq and
  # pipe it in via --input -.
  local contexts_json
  contexts_json=$(printf '%s\n' "${ctxs[@]}" | jq -R . | jq -cs .)

  local body
  body=$(jq -n \
    --argjson contexts "$contexts_json" \
    --argjson appr "$appr" \
    '{
      required_status_checks: { strict: true, contexts: $contexts },
      enforce_admins: true,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      restrictions: null,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: $appr
      }
    }')

  gh api -X PUT "repos/$repo/branches/$branch/protection" \
         -H "Accept: application/vnd.github+json" \
         --input - <<<"$body" >/dev/null \
    || { echo "Failed to protect $branch"; exit 1; }

  # Require signed commits (best-effort; existing protection is preserved if this fails).
  gh api -X POST \
         -H "Accept: application/vnd.github+json" \
         "repos/$repo/branches/$branch/protection/required_signatures" >/dev/null || true
}

echo "Setting default branch to main on $repo…"
gh repo edit "$repo" --default-branch main

# `develop` may not exist yet on a freshly-created repo. Create it from
# `main` if missing so protection rules have something to bind to.
if ! gh api "repos/$repo/branches/develop" >/dev/null 2>&1; then
  echo "Creating develop branch from main…"
  main_sha=$(gh api "repos/$repo/branches/main" --jq '.commit.sha')
  gh api -X POST "repos/$repo/git/refs" \
         -f ref="refs/heads/develop" \
         -f sha="$main_sha" >/dev/null
fi

gh repo edit "$repo" --default-branch develop

protect_branch main    "$main_appr"
protect_branch develop "$dev_appr"

echo "Done."
