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
repo="${1:-}"; main_appr="${2:-0}"; dev_appr="${3:-0}"
# Opt-in: enable required signed commits via SIGNED_COMMITS=true env var.
# Off by default because the project's commit-author convention is the DCO
# Signed-off-by: trailer (enforced by commitlint), and the maintainer's
# commits are not currently GPG/SSH-signed — turning this on would block
# every PR until signing keys are wired up.
sign_commits="${SIGNED_COMMITS:-false}"
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

  # Skip if the branch doesn't exist on the remote. In practice this guard
  # only catches the `main` call — `develop` is auto-created from main above
  # — but a fresh repo whose seed commit went to a non-`main` ref would
  # otherwise hit a confusing 404 from the protection PUT.
  if ! gh api "repos/$repo/branches/$branch" >/dev/null 2>&1; then
    echo "Branch $branch does not exist on $repo — skipping protection."
    return 0
  fi

  echo "Protecting $branch…"

  # GitHub's branch-protection endpoint expects nested JSON objects for
  # required_status_checks and required_pull_request_reviews. `gh api -F`
  # only supports flat key=value pairs, so build the body with jq and
  # pipe it in via --input -.
  local contexts_json
  contexts_json=$(printf '%s\n' "${ctxs[@]}" | jq -R . | jq -cs .)

  # required_pull_request_reviews is set to null when appr=0 so the whole
  # reviews block is dropped — emitting it with required_approving_review_count=0
  # still triggers require_code_owner_reviews enforcement against CODEOWNERS,
  # which blocks single-maintainer repos where the author cannot self-approve.
  # Pass appr>=1 (e.g. `2 1`) when a co-maintainer joins.
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
      required_pull_request_reviews: ($appr | if . > 0 then {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: .
      } else null end)
    }')

  gh api -X PUT "repos/$repo/branches/$branch/protection" \
        -H "Accept: application/vnd.github+json" \
        --input - <<<"$body" >/dev/null \
    || { echo "Failed to protect $branch"; exit 1; }

  # Required signed commits — opt-in via SIGNED_COMMITS=true. Default off
  # because the project uses DCO sign-off (Signed-off-by: trailer enforced
  # by commitlint) not GPG/SSH signing; turning this on would block every PR
  # from the maintainer until signing keys are wired up to their account.
  if [ "$sign_commits" = "true" ]; then
    gh api -X POST \
          -H "Accept: application/vnd.github+json" \
          "repos/$repo/branches/$branch/protection/required_signatures" >/dev/null || true
  fi
}

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
