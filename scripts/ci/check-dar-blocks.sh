#!/usr/bin/env bash
# check-dar-blocks.sh — fail when a story file at Status: review|done still
# carries placeholder strings in its Dev Agent Record / Senior Developer
# Review (AI) / Change Log blocks.
#
# Background: the Epic 13 retro A-3 (option b) populated-content lock is
# skill-scoped (`_bmad/custom/bmad-dev-story.toml`). Direct-commit paths
# bypass the skill entirely (Epic 18 retro §3.1 / F-3). This script is the
# git-scoped enforcement, invoked from `scripts/bmad-sync.sh` (the single
# chokepoint for private-repo commits) so the discipline holds regardless
# of which dev path produced the change.
#
# Usage:
#   scripts/ci/check-dar-blocks.sh <story-file> [<story-file> ...]
#   scripts/ci/check-dar-blocks.sh --all -d <repo-root>   # scan every story
#
# Exits 0 if no violations; 1 with a per-file report otherwise.

set -euo pipefail

PLACEHOLDERS=(
  "(Populated by the dev agent during implementation.)"
  "_To be populated by the reviewer after implementation._"
  "_To be populated by dev agent._"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") <story-file> [<story-file> ...]
       $(basename "$0") --all -d <repo-root>

Fails when a story file's Status is 'review' or 'done' but the Dev Agent
Record / Senior Developer Review (AI) / Change Log blocks still carry the
template placeholder strings.

Placeholders that disqualify a populated block:
  - (Populated by the dev agent during implementation.)
  - _To be populated by the reviewer after implementation._
  - _To be populated by dev agent._
EOF
}

# --- Parse args --------------------------------------------------------------
ALL_MODE=false
SCAN_ROOT=""
FILES=()

while [ $# -gt 0 ]; do
  case "$1" in
    --all)   ALL_MODE=true ;;
    -d)      shift; SCAN_ROOT="${1:-}" ;;
    -h|--help) usage; exit 0 ;;
    --)      shift; while [ $# -gt 0 ]; do FILES+=("$1"); shift; done; break ;;
    -*)      echo "✗ Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)       FILES+=("$1") ;;
  esac
  shift
done

if [ "$ALL_MODE" = true ]; then
  if [ -z "$SCAN_ROOT" ] || [ ! -d "$SCAN_ROOT" ]; then
    echo "✗ --all requires -d <existing-repo-root>" >&2
    exit 2
  fi
  story_dir="$SCAN_ROOT/_bmad-output/implementation-artifacts"
  if [ ! -d "$story_dir" ]; then
    echo "ℹ $story_dir does not exist — nothing to check."
    exit 0
  fi
  # Story files match <epic>-<num>-<slug>.md (digit-leading); excludes
  # epic-*-retro-*.md / sprint-status.yaml / deferred-work.md / spec-*.md /
  # milestone-*.md by virtue of not starting with a digit.
  while IFS= read -r f; do
    FILES+=("$f")
  done < <(find "$story_dir" -maxdepth 1 -type f -name '[0-9]*.md' 2>/dev/null | sort)
fi

if [ ${#FILES[@]} -eq 0 ]; then
  exit 0
fi

# --- Per-file check ----------------------------------------------------------
# A file is a "story file" only if it carries `## Dev Agent Record`. This is
# the structural guard — retros, sprint-status, spec-*, milestone-* won't.
violations=()

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  # Cheap guard: skip non-story markdown.
  if ! grep -q '^## Dev Agent Record' "$f" 2>/dev/null; then
    continue
  fi

  # Extract Status: <value> from the first 10 lines (cheap; the field
  # always lives just under the H1).
  status_line=$(head -n 10 "$f" | grep -m1 -E '^Status:[[:space:]]*' || true)
  status_value=$(printf '%s' "$status_line" | sed -E 's/^Status:[[:space:]]*//' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')

  case "$status_value" in
    review|done) ;;
    *) continue ;;  # backlog | ready-for-dev | in-progress | empty → block is allowed to be a placeholder
  esac

  # At Status: review|done, no placeholder string may remain.
  hits=()
  for p in "${PLACEHOLDERS[@]}"; do
    if grep -F -q -- "$p" "$f"; then
      hits+=("$p")
    fi
  done

  if [ ${#hits[@]} -gt 0 ]; then
    violations+=("$f|$status_value|$(IFS=¶; echo "${hits[*]}")")
  fi
done

if [ ${#violations[@]} -eq 0 ]; then
  exit 0
fi

# --- Report ------------------------------------------------------------------
echo "" >&2
echo "✗ DAR-block discipline violation — story files at Status: review|done still carry template placeholders." >&2
echo "" >&2
for v in "${violations[@]}"; do
  IFS='|' read -r file status hits <<< "$v"
  echo "  • $file (Status: $status)" >&2
  IFS='¶' read -r -a hit_arr <<< "$hits"
  for h in "${hit_arr[@]}"; do
    echo "      — placeholder still present: $h" >&2
  done
done
echo "" >&2
echo "Fix: populate Dev Agent Record (Debug Log References, Completion Notes List, File List, Change Log)" >&2
echo "     and Senior Developer Review (AI) blocks BEFORE flipping Status to review or done." >&2
echo "     See CLAUDE.md \"Cross-story sequencing conventions\" + Epic 18 retro AI-1." >&2
exit 1
