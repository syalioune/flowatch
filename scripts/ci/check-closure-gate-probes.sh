#!/usr/bin/env bash
# check-closure-gate-probes.sh — fail when a story file at Status: review|done
# contains a closure-gate / N-path probe AC with unchecked probe paths that
# lack an explicit [N/A — <reason>] deferral marker.
#
# Background: Epic 26 retro AI-1 — the 4th enforcement layer.
#
# The existing three layers enforce skill-flow-artifact discipline:
#   1. scripts/ci/check-dar-blocks.sh — empty DAR / Senior Developer Review
#      (AI) blocks at Status: review|done.
#   2. _bmad/custom/bmad-dev-story.toml populated-content lock — same gap at
#      skill-flow level.
#   3. _bmad/custom/bmad-retrospective.toml cross-file flip override —
#      sprint-status flip-lag.
#
# None of those check SUBSTANTIVE CONTENT. Story 26.2's T-8 5-path probe
# transparently deferred 3 of 5 paths with Med severity in the Senior
# Developer Review block; the DAR-block hook passed because the block was
# POPULATED. The 3 deferred paths leaked into the 607849d polish commit
# (sizing + scrollbar + tab restructure all symptoms of un-probed paths).
#
# Spec-author contract enforced by this script:
#   When a story's Tasks/Subtasks section contains a closure-gate live-engine
#   probe AC (or an N-path probe AC), every individual probe path MUST be
#   represented by its own indented checkbox line. Each unchecked checkbox
#   MUST carry an inline [N/A — <reason>] deferral marker — bare narrative
#   in the Senior Developer Review block does NOT satisfy.
#
#   Anti-pattern (Story 26.2 T-8 shape — what the lock prevents going forward):
#     - [x] T-8.1 5-path probe:
#         1. Probe 1 — alive flow      <- numbered list inside ONE checkbox
#         2. Probe 2 — parallel-branch    blurs deferral with execution
#         3. Probe 3 — ended instance
#         ...
#
#   Required pattern (Epic 27+ contract):
#     - [ ] T-8 Closure-gate 5-path probe
#       - [x] T-8.1 Probe 1 — alive flow
#       - [x] T-8.2 Probe 2 — parallel-branch
#       - [x] T-8.3 Probe 3 — ended instance
#       - [ ] T-8.4 Probe 4 — redeployed-mid-instance [N/A — fixture deferred, see retro AI-7]
#       - [ ] T-8.5 Probe 5 — sub-process [N/A — fixture deferred, see retro AI-7]
#
# Usage:
#   scripts/ci/check-closure-gate-probes.sh <story-file> [<story-file> ...]
#
# Exits 0 if no violations; 1 with a per-file report otherwise.

set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") <story-file> [<story-file> ...]

Fails when a story file's Status is 'review' or 'done' but a closure-gate /
N-path probe AC contains unchecked probe paths without explicit [N/A — ...]
deferral markers.

Section markers (case-insensitive, anywhere in spec body):
  - "closure-gate ... probe"      (e.g., "closure-gate live-engine probe")
  - "<N>-path probe"              (e.g., "5-path probe", "3-path probe")

Deferral marker (must be on the same line as the unchecked checkbox):
  [N/A — <reason>]                em-dash variant; canonical
  [N/A - <reason>]                hyphen variant; tolerated
  [N/A <reason>]                  bare variant; tolerated
EOF
}

FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    -*) echo "✗ Unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) FILES+=("$1") ;;
  esac
  shift
done

if [ ${#FILES[@]} -eq 0 ]; then
  exit 0
fi

violations=()

for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue

  # Structural guard: only scan story files (carrying ## Dev Agent Record).
  # Retros / sprint-status / spec-* / milestone-* won't trip the check.
  if ! grep -q '^## Dev Agent Record' "$f" 2>/dev/null; then
    continue
  fi

  # Status gate — only enforce at review|done.
  status_line=$(head -n 10 "$f" | grep -m1 -E '^Status:[[:space:]]*' || true)
  status_value=$(printf '%s' "$status_line" | sed -E 's/^Status:[[:space:]]*//' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
  case "$status_value" in
    review|done) ;;
    *) continue ;;
  esac

  # Find lines that introduce a closure-gate / N-path probe section.
  # Match against the literal text — the section heading itself is the
  # anchor. We use case-insensitive grep -n to capture line numbers.
  probe_section_lines=$(grep -niE 'closure[- ]gate.*probe|[0-9]+-path.*probe' "$f" \
                       | cut -d: -f1 \
                       || true)

  if [ -z "$probe_section_lines" ]; then
    continue  # no probe section → nothing to enforce
  fi

  # For each probe section, scan forward until the next section boundary
  # and collect any indented `- [ ]` checkbox lines that lack [N/A ...].
  hits=()
  while IFS= read -r start_ln; do
    [ -z "$start_ln" ] && continue
    # awk scans from start_ln+1; stops at:
    #   - next markdown heading (^#)
    #   - next top-level (non-indented) checkbox starting a new task family
    #   - next ## Dev Notes / ## Dev Agent Record / ## Senior Developer Review
    # within the section, an indented unchecked checkbox without [N/A is a hit.
    while IFS= read -r hit; do
      [ -n "$hit" ] && hits+=("$hit")
    done < <(awk -v start="$start_ln" '
      NR <= start { next }
      /^## / { exit }                   # next H2 ends the section scope
      /^- \[[ xX]\]/ { exit }           # next top-level checkbox ends the section
      /^[[:space:]]+- \[ \]/ {
        # Unchecked indented checkbox. Does the line carry an [N/A...] marker?
        if ($0 ~ /\[N\/A/) next
        printf("%d: %s\n", NR, $0)
      }
    ' "$f")
  done <<< "$probe_section_lines"

  if [ ${#hits[@]} -gt 0 ]; then
    violations+=("$f|$status_value|$(IFS=¶; echo "${hits[*]}")")
  fi
done

if [ ${#violations[@]} -eq 0 ]; then
  exit 0
fi

echo "" >&2
echo "✗ Closure-gate-probe discipline violation — story files at Status: review|done" >&2
echo "  have unchecked probe paths without explicit [N/A — <reason>] deferral markers." >&2
echo "" >&2
for v in "${violations[@]}"; do
  IFS='|' read -r file status hits <<< "$v"
  echo "  • $file (Status: $status)" >&2
  IFS='¶' read -r -a hit_arr <<< "$hits"
  for h in "${hit_arr[@]}"; do
    echo "      — line $h" >&2
  done
done
echo "" >&2
echo "Fix: either execute the probe path (flip [ ] → [x]) or add an inline" >&2
echo "     [N/A — <reason>] marker on the same line. Bare narrative in the" >&2
echo "     Senior Developer Review (AI) block does NOT satisfy the contract." >&2
echo "" >&2
echo "     See CLAUDE.md / Epic 26 retro AI-1." >&2
exit 1
