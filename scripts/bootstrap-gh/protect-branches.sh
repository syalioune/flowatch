#!/usr/bin/env bash
# Apply repository rulesets for the long-lived branches of the Flowatch repo
# (`main` + `develop`). Replaces the older classic-branch-protection model.
#
# Rulesets vs. classic protection — why we switched (per maintainer decision
# 2026-05-17):
#   - bypass_actors is a top-level ruleset property, not per-rule. A single
#     entry exempts the actor from PR + status-check + linear-history rules
#     in one go, where classic protection's bypass_pull_request_allowances
#     only bypassed the PR rule and not status checks (the same actor would
#     still be blocked by strict mode).
#   - Multiple rulesets can coexist on a branch (organisation-wide + repo-
#     specific). Classic protection was a single monolithic rule per branch.
#   - bypass_mode lets us choose between "always" and "pull_request"
#     granularity. The Release Bot App needs "always" so semantic-release
#     can push the release commit directly.
#
# Flowatch uses a two-branch model (DEVELOPERS.md §3):
#   - `develop` is the integration branch; feature/fix branches PR into it,
#     and Dependabot targets it.
#   - `main` only receives releases (promoted from `develop` via `release/*`
#     branches per release.config.mjs). Currently main is an empty orphan
#     baseline carrying the v0.0.0 tag (no protection applied).
#
# Usage:
#   bash scripts/bootstrap-gh/protect-branches.sh <owner/repo> [main_approvals] [develop_approvals]
#
# Optional env vars:
#   SIGNED_COMMITS=true    enforce signed commits (off by default; project
#                          uses DCO Signed-off-by: trailer, not GPG signing)
#
# Optional config file:
#   .github/protection/release_bot.json    {"app_id": <int>} — the GitHub
#     App that bypasses the rulesets so semantic-release can push the
#     release commit. If missing or app_id=0, no bypass is configured
#     (every actor goes through PRs; semantic-release will fail until the
#     file is created and the script is re-run).

set -euo pipefail
repo="${1:-}"; main_appr="${2:-0}"; dev_appr="${3:-0}"
sign_commits="${SIGNED_COMMITS:-false}"

[ -n "$repo" ] || { echo "Usage: $0 <owner/repo> [main_approvals] [develop_approvals]"; exit 1; }
command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }

checks_file=".github/protection/required_checks.json"
[ -f "$checks_file" ] || { echo "Missing $checks_file"; exit 1; }
mapfile -t ctxs < <(jq -r '.[]' "$checks_file")

# Optional Release Bot App ID for bypass. Lives in
# .github/protection/release_bot.json — gitignored is wrong because the App
# ID is not a secret (only the private key is); committing it makes the
# bootstrap reproducible from a fresh clone.
bot_config=".github/protection/release_bot.json"
release_bot_app_id=""
if [ -f "$bot_config" ]; then
  release_bot_app_id=$(jq -r '.app_id // empty' "$bot_config")
fi

# Apply (or update) a ruleset to one branch.
# Args: branch_name, required_approving_review_count
apply_ruleset() {
  local branch="$1" appr="$2"
  local ruleset_name="protection: ${branch}"

  # Skip if the branch doesn't exist on the remote. Same guard as the
  # previous classic-protection script — useful for fresh repos where
  # the seed commit went to a non-`main` ref.
  if ! gh api "repos/$repo/branches/$branch" >/dev/null 2>&1; then
    echo "Branch $branch does not exist on $repo — skipping ruleset."
    return 0
  fi

  echo "Applying ruleset to $branch…"

  # Build the rules array. Order doesn't matter to GitHub but we keep
  # logical groupings for readability.
  #
  # integration_id 15368 = GitHub Actions' app ID. Without it, the ruleset
  # UI displays each required check's source as "Any Source", which means
  # GitHub matches by context name alone — any integration that happens to
  # emit a check named `check`/`unit`/`e2e`/`build` would satisfy the gate.
  # Pinning to 15368 scopes the requirement to GitHub-Actions-emitted check-
  # runs only, which is what the ci.yml jobs actually produce.
  local required_checks_json
  required_checks_json=$(printf '%s\n' "${ctxs[@]}" \
    | jq -R -c '{context: ., integration_id: 15368}' \
    | jq -cs .)

  local rules
  rules=$(jq -n \
    --argjson checks "$required_checks_json" \
    --argjson appr "$appr" \
    --argjson sign_commits "$([ "$sign_commits" = "true" ] && echo true || echo false)" \
    '
    # Always-present rules: prevent deletion + force-push + non-linear history.
    [
      { type: "deletion" },
      { type: "non_fast_forward" },
      { type: "required_linear_history" },
      {
        type: "pull_request",
        parameters: {
          dismiss_stale_reviews_on_push: true,
          # require_code_owner_review is gated on appr > 0 — single-maintainer
          # repos cannot self-approve, so emitting this with appr=0 would
          # deadlock every PR. When a co-maintainer joins, pass appr>=1.
          require_code_owner_review: ($appr > 0),
          required_approving_review_count: $appr,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
          allowed_merge_methods: ["rebase"]
        }
      },
      {
        type: "required_status_checks",
        parameters: {
          # strict mode: the head commit must have passing checks before
          # the push/merge lands. Bypass actors skip this; everyone else
          # waits for CI to go green.
          strict_required_status_checks_policy: true,
          required_status_checks: $checks
        }
      }
    ]
    + (if $sign_commits then [{type: "required_signatures"}] else [] end)
    ')

  # Build bypass_actors. The Release Bot App is the only entry we add —
  # bypass_mode: "always" lets it push directly (the semantic-release
  # release commit). Without an App ID configured, the bypass list is
  # empty and every actor must go through PRs (which means semantic-
  # release breaks; that's a deliberate fail-loud signal that the App
  # hasn't been wired yet).
  local bypass
  if [ -n "$release_bot_app_id" ] && [ "$release_bot_app_id" != "0" ]; then
    bypass=$(jq -n --argjson id "$release_bot_app_id" \
      '[{ actor_id: $id, actor_type: "Integration", bypass_mode: "always" }]')
  else
    bypass='[]'
    echo "  ⚠ No Release Bot App ID configured ($bot_config missing or app_id=0)."
    echo "     The bypass list is empty — semantic-release will be blocked until configured."
  fi

  # Assemble the ruleset body.
  local body
  body=$(jq -n \
    --arg name "$ruleset_name" \
    --arg ref "refs/heads/$branch" \
    --argjson rules "$rules" \
    --argjson bypass "$bypass" \
    '{
      name: $name,
      target: "branch",
      enforcement: "active",
      conditions: {
        ref_name: { include: [$ref], exclude: [] }
      },
      rules: $rules,
      bypass_actors: $bypass
    }')

  # Find existing ruleset by name; PUT if it exists, POST if it doesn't.
  # Rulesets are unique by ID, not name — but we use the name as the
  # idempotency key for re-running this script. Other rulesets on the
  # branch (org-wide ones, manually-created ones) are left untouched.
  local existing_id
  existing_id=$(gh api "repos/$repo/rulesets" \
    --jq ".[] | select(.name == \"$ruleset_name\") | .id" 2>/dev/null | head -1)

  if [ -n "$existing_id" ]; then
    echo "  Updating existing ruleset id=$existing_id"
    gh api -X PUT "repos/$repo/rulesets/$existing_id" \
      -H "Accept: application/vnd.github+json" \
      --input - <<<"$body" >/dev/null \
      || { echo "Failed to update ruleset on $branch"; exit 1; }
  else
    echo "  Creating new ruleset"
    gh api -X POST "repos/$repo/rulesets" \
      -H "Accept: application/vnd.github+json" \
      --input - <<<"$body" >/dev/null \
      || { echo "Failed to create ruleset on $branch"; exit 1; }
  fi
}

# `develop` may not exist yet on a freshly-created repo. Create it from
# `main` if missing so rulesets have something to bind to.
if ! gh api "repos/$repo/branches/develop" >/dev/null 2>&1; then
  echo "Creating develop branch from main…"
  main_sha=$(gh api "repos/$repo/branches/main" --jq '.commit.sha')
  gh api -X POST "repos/$repo/git/refs" \
         -f ref="refs/heads/develop" \
         -f sha="$main_sha" >/dev/null
fi

gh repo edit "$repo" --default-branch develop

apply_ruleset main    "$main_appr"
apply_ruleset develop "$dev_appr"

echo "Done."
