#!/usr/bin/env bash
# bmad-sync.sh — commit + push the private BMAD companion repo.
#
# The private repo location is **derived from the `_bmad` symlink at runtime**
# — never hardcoded. Re-run scripts/setup-bmad.sh if you move the private
# repo's checkout (which recreates the symlink with a fresh absolute path).
#
# Usage:
#   bash scripts/bmad-sync.sh -m "feat(prd): tighten FR-19 ACs"
#   bash scripts/bmad-sync.sh --no-push -m "..."
#   bash scripts/bmad-sync.sh --status-only         # reminder mode (hook-friendly)
#
# Intended callers:
#   - BMad-skill `on_complete` directives — pass a precise -m message that
#     reflects the artefact just produced.
#   - The Claude Code Stop hook — invoked with --status-only; never commits,
#     just prints a one-line reminder if the private repo is dirty.
#   - Maintainers, by hand, for ad-hoc edits to flowatch-conventions.md etc.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BMAD_LINK="$REPO_ROOT/_bmad"

# --- Resolve the private repo from the symlink (never hardcode) --------------
if [ ! -L "$BMAD_LINK" ]; then
  echo "ℹ $BMAD_LINK is not a symlink — BMAD is not wired into this checkout." >&2
  echo "  Run \`bash scripts/setup-bmad.sh\` to set it up, or ignore this if you" >&2
  echo "  are a code-only contributor." >&2
  exit 0
fi

BMAD_TARGET="$(realpath "$BMAD_LINK" 2>/dev/null || true)"
if [ -z "$BMAD_TARGET" ] || [ ! -d "$BMAD_TARGET" ]; then
  echo "✗ $BMAD_LINK is a broken symlink (target missing)." >&2
  echo "  Re-run \`bash scripts/setup-bmad.sh\` to repair." >&2
  exit 1
fi

PRIVATE_REPO="$(dirname "$BMAD_TARGET")"
if [ ! -d "$PRIVATE_REPO/.git" ]; then
  echo "✗ $PRIVATE_REPO is not a git repo — refusing to sync." >&2
  exit 1
fi

# --- CLI parsing -------------------------------------------------------------
MESSAGE=""
DO_PUSH=true
STATUS_ONLY=false

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message)  shift; MESSAGE="${1:-}" ;;
    --no-push)     DO_PUSH=false ;;
    --status-only) STATUS_ONLY=true ;;
    -h|--help)
      cat <<EOF
Usage: $(basename "$0") [-m <msg>] [--no-push] [--status-only] [-h]

  -m, --message <msg>  Commit message. Required for commit; ignored with
                       --status-only. If omitted in commit mode, a fallback
                       message is synthesised from changed-file basenames.
  --no-push            Commit but don't push.
  --status-only        Print a reminder if the private repo has uncommitted
                       changes; never mutates anything. Used by the Claude
                       Code Stop hook.
  -h, --help           Show this help.

Private repo location: derived from \`$BMAD_LINK\` at runtime.
EOF
      exit 0
      ;;
    *) echo "✗ Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# --- Status-only mode (hook-friendly: reminder, no mutation) -----------------
if [ "$STATUS_ONLY" = true ]; then
  changes="$(git -C "$PRIVATE_REPO" status --porcelain)"
  if [ -n "$changes" ]; then
    n=$(printf '%s\n' "$changes" | wc -l | tr -d ' ')
    echo "⚠ $(basename "$PRIVATE_REPO") has $n uncommitted change(s):" >&2
    printf '%s\n' "$changes" | head -5 | sed 's/^/   /' >&2
    if [ "$n" -gt 5 ]; then
      echo "   … ($((n - 5)) more)" >&2
    fi
    echo "  → bash scripts/bmad-sync.sh -m \"<message>\"" >&2
  fi
  exit 0
fi

# --- Commit + push -----------------------------------------------------------
git -C "$PRIVATE_REPO" add -A

# DAR-block discipline (Epic 18 retro AI-1): refuse to commit any story file
# that flipped Status to review|done while DAR / Senior Developer Review (AI)
# blocks still carry template placeholder strings. The skill-scoped lock in
# _bmad/custom/bmad-dev-story.toml covers the skill path; this covers the
# direct-commit path (see CLAUDE.md "Cross-story sequencing conventions").
staged_stories=()
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  case "$rel" in
    _bmad-output/implementation-artifacts/*.md) staged_stories+=("$PRIVATE_REPO/$rel") ;;
  esac
done < <(git -C "$PRIVATE_REPO" diff --cached --name-only --diff-filter=ACMR)

if [ ${#staged_stories[@]} -gt 0 ]; then
  if [ -x "$REPO_ROOT/scripts/ci/check-dar-blocks.sh" ]; then
    if ! bash "$REPO_ROOT/scripts/ci/check-dar-blocks.sh" "${staged_stories[@]}"; then
      echo "✗ Refusing to commit — fix the violations above (CLAUDE.md / Epic 18 retro AI-1)." >&2
      exit 1
    fi
  fi
fi

if git -C "$PRIVATE_REPO" diff --cached --quiet; then
  echo "✓ No staged changes in $(basename "$PRIVATE_REPO") — nothing to commit."
  exit 0
fi

if [ -z "$MESSAGE" ]; then
  # Fallback: list up to 3 changed basenames so the commit isn't a black box.
  files="$(git -C "$PRIVATE_REPO" diff --cached --name-only | head -3 | xargs -n1 basename 2>/dev/null | tr '\n' ' ' | sed 's/ $//')"
  MESSAGE="chore(bmad): update ${files:-artefacts}"
fi

git -C "$PRIVATE_REPO" commit -m "$MESSAGE"

if [ "$DO_PUSH" = true ]; then
  echo "🔄 Pushing $(basename "$PRIVATE_REPO")..."
  git -C "$PRIVATE_REPO" push
  echo "✅ Pushed."
else
  echo "✓ Committed (push skipped per --no-push)."
fi
