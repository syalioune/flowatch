#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# sync-user-stories.sh — keep docs/specifications/user-stories/ aligned with
# GitHub issues labelled `type:user-story`.
#
# Modes:
#   check       — default. Report drift; exit 1 if any drift detected.
#                 Suitable for CI gating.
#   bootstrap   — Create stub files for issues whose expected file is
#                 missing. Never overwrites or deletes existing files.
#   prune-list  — List local files that have no matching issue (orphans).
#                 Does not delete; emits a removal command for each.
#
# Filename convention (Flowatch — see scripts/user-stories/README.md):
#   <AREA>-<PERSONA>-<SEQ>_<Title_With_Underscores>.md
#   - AREA = MDL / DPL / RUN / JOB / HST / IDT / INS / AUT / DSY /
#            NAV / API / QGT / FND / DOC / I18N (see release.config.mjs themes)
#   - PERSONA = MIR (Mira) / DAA (Daan) / SAS (Sasha) / SYS
#   - SEQ = zero-padded 3-digit sequence (001, 002, ...)
#   - The general regex is ^[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+ for
#     compatibility with any imported stories that don't follow the
#     AREA-PERSONA-SEQ pattern (e.g. plain DOC-001 for system docs).
#   - Title-after-prefix has whitespace replaced by `_`, `/` by `-`.
#   - Other punctuation kept (parentheses, dashes, ampersands, ...).
#
# Many-to-many: a single PREFIX can legitimately map to multiple issues —
# e.g. RUN-MIR-001 can produce a frontend ticket, an integration-test ticket,
# and a docs ticket. Each issue gets its own user-story file.
#
# Sources of truth:
#   - GitHub issues are the source of truth for *which* stories exist and
#     what their canonical title is.
#   - Local files are the source of truth for the *summarised content*
#     (refined hand-curated story format that does not mirror the issue
#     body verbatim).
#
# Out of scope:
#   - Pushing local file changes back to GitHub issues.
#   - Regenerating existing local files from issue content (would clobber
#     hand-curated edits).
#
# Requirements: gh, jq, bash 4+.
#
# Examples:
#   bash scripts/user-stories/sync-user-stories.sh
#   bash scripts/user-stories/sync-user-stories.sh check
#   bash scripts/user-stories/sync-user-stories.sh bootstrap
#   bash scripts/user-stories/sync-user-stories.sh prune-list
#
# ----------------------------------------------------------------------------

set -euo pipefail

MODE="${1:-check}"

case "$MODE" in
  check|bootstrap|prune-list) ;;
  --help|-h|help)
    sed -n '/^# sync-user-stories.sh/,/^# ----------------------------------------------------------------------------$/p' "$0" | sed 's/^# \?//'
    exit 0
    ;;
  *)
    cat >&2 <<EOF
unknown mode: $MODE
usage: $0 [check|bootstrap|prune-list]
  check       (default) Report drift; exit 1 if any drift detected.
  bootstrap   Create stub files for issues whose expected file is missing.
  prune-list  List local files that have no matching issue.
EOF
    exit 2
    ;;
esac

# --- preflight -------------------------------------------------------------
command -v gh >/dev/null 2>&1 || { echo "✗ gh CLI required" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "✗ jq required" >&2; exit 2; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STORIES_DIR="$REPO_ROOT/docs/specifications/user-stories"
[[ -d "$STORIES_DIR" ]] || { echo "✗ stories dir not found: $STORIES_DIR" >&2; exit 2; }

# Allow alphanumeric segments and 2+ hyphens, terminating in a numeric segment.
# Rejects placeholders (XXX, TBD) and 2-segment prefixes are accepted.
PREFIX_RE='^[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+'

# --- helpers ---------------------------------------------------------------

# Extract the PREFIX from an issue title or filename.
# `|| true` swallows grep's no-match exit code under pipefail+set -e.
extract_prefix() {
  local s="$1"
  printf '%s' "$s" | { grep -oE "$PREFIX_RE" || true; } | head -n1
}

# Strip the prefix plus any leading separator from a title. Handles
# `PREFIX: Title`, `PREFIX:Title`, `PREFIX :  Title`, and `PREFIX  Title`
# uniformly — the separator is optional whitespace, an optional colon,
# and at least one trailing whitespace character.
strip_prefix() {
  local s="$1"
  printf '%s' "$s" | sed -E "s/${PREFIX_RE}[[:space:]]*:?[[:space:]]+//"
}

# Sanitise a title for use as a filename segment.
# - `/` -> `-` (with optional surrounding spaces collapsed)
# - whitespace runs -> `_`
# - trim leading/trailing underscores
# Keeps parens, dashes, ampersands, dots — produces filenames like
# RUN-MIR-002_Deploy_BPMN_from_"new_from_scratch".md
sanitise_title() {
  local s="$1"
  s="${s//\//-}"
  s="$(printf '%s' "$s" | tr -s '[:space:]' '_')"
  s="${s##_}"; s="${s%%_}"
  printf '%s' "$s"
}

expected_filename() {
  local prefix="$1" title="$2"
  printf '%s_%s.md' "$prefix" "$(sanitise_title "$title")"
}

# --- fetch all type:user-story issues --------------------------------------
echo "▶ Fetching GitHub issues with label type:user-story (open + closed)…" >&2
ISSUES_JSON="$(gh issue list --label "type:user-story" --state all --limit 500 \
  --json number,title,state,milestone,labels,url \
  --jq 'sort_by(.number)')"
ISSUE_COUNT=$(jq 'length' <<<"$ISSUES_JSON")
echo "  → $ISSUE_COUNT issues fetched" >&2

# --- build issue index -----------------------------------------------------
# We track each issue independently. A prefix may map to multiple issues.
# ISSUE_NUMBERS, ISSUE_STATES, ISSUE_TITLES, ISSUE_URLS, ISSUE_MILESTONES,
# ISSUE_LABELS, ISSUE_PREFIXES, ISSUE_EXPECTED are parallel arrays indexed by i.
ISSUE_NUMBERS=()
ISSUE_STATES=()
ISSUE_TITLES=()
ISSUE_URLS=()
ISSUE_MILESTONES=()
ISSUE_LABELS=()
ISSUE_PREFIXES=()
ISSUE_EXPECTED=()

# Set of expected filenames (for fast "is this a known issue file?" lookup)
declare -A EXPECTED_FILE_TO_INDEX
# Set of all prefixes referenced by at least one issue
declare -A PREFIXES_WITH_ISSUE
# Issues with an unrecognised prefix (do not contribute to drift, just flagged)
ISSUES_WITHOUT_PREFIX=()

while IFS=$'\t' read -r number state title url milestone labels; do
  prefix="$(extract_prefix "$title")"
  if [[ -z "$prefix" ]]; then
    ISSUES_WITHOUT_PREFIX+=("$number :: $title")
    continue
  fi
  pure_title="$(strip_prefix "$title")"
  expected="$(expected_filename "$prefix" "$pure_title")"

  i=${#ISSUE_NUMBERS[@]}
  ISSUE_NUMBERS+=("$number")
  ISSUE_STATES+=("$state")
  ISSUE_TITLES+=("$title")
  ISSUE_URLS+=("$url")
  ISSUE_MILESTONES+=("$milestone")
  ISSUE_LABELS+=("$labels")
  ISSUE_PREFIXES+=("$prefix")
  ISSUE_EXPECTED+=("$expected")

  EXPECTED_FILE_TO_INDEX["$expected"]="$i"
  PREFIXES_WITH_ISSUE["$prefix"]="1"
done < <(jq -r '.[] | [.number, .state, .title, .url,
                       (.milestone.title // ""),
                       ([.labels[].name] | join(","))] | @tsv' <<<"$ISSUES_JSON")

# --- scan local files ------------------------------------------------------
declare -A LOCAL_FILES   # filename -> 1

while IFS= read -r -d '' file; do
  base="$(basename "$file")"
  # README.md is the directory's own index, not a user-story file — never drift.
  [[ "$base" == "README.md" ]] && continue
  LOCAL_FILES["$base"]="1"
done < <(find "$STORIES_DIR" -maxdepth 1 -type f -name '*.md' -print0)

# --- diff ------------------------------------------------------------------
MISSING_FILES=()  # issues whose expected file is missing
ORPHAN_FILES=()   # local files unmatched by any issue's expected filename

for ((i=0; i<${#ISSUE_NUMBERS[@]}; i++)); do
  expected="${ISSUE_EXPECTED[$i]}"
  if [[ -z "${LOCAL_FILES[$expected]:-}" ]]; then
    MISSING_FILES+=("$i")
  fi
done

for filename in "${!LOCAL_FILES[@]}"; do
  if [[ -z "${EXPECTED_FILE_TO_INDEX[$filename]:-}" ]]; then
    prefix="$(extract_prefix "$filename")"
    if [[ -n "$prefix" && -n "${PREFIXES_WITH_ISSUE[$prefix]:-}" ]]; then
      ORPHAN_FILES+=("stale|$filename|$prefix")
    else
      ORPHAN_FILES+=("orphan|$filename|$prefix")
    fi
  fi
done

# --- bootstrap stub generator ---------------------------------------------
# Fetches the GitHub issue body and embeds it verbatim under a metadata
# header. Falls back to a minimal scaffold when the issue has no body.
# Subsequent sync runs never overwrite the file — bootstrap is one-shot.
generate_stub() {
  local prefix="$1" number="$2" title="$3" milestone="$4" labels="$5" url="$6" state="$7"
  local pure_title; pure_title="$(strip_prefix "$title")"
  local persona_hint
  case "$prefix" in
    *-MIR-*) persona_hint="Mira (Flowable operator — primary, P1 in PRD)" ;;
    *-DAA-*) persona_hint="Daan (tech-lead evaluator — P2 in PRD)" ;;
    *-SAS-*) persona_hint="Sasha (admin-script author — P3 in PRD)" ;;
    *-SYS-*) persona_hint="System (no human persona — tooling / CI / docs)" ;;
    *)       persona_hint="TBD — see _bmad-output/planning-artifacts/prd.md §5 for canonical personas" ;;
  esac

  # Fetch issue body. `// ""` makes jq emit empty string when body is null;
  # `|| true` swallows network/auth errors so the caller can decide how to
  # react (we just fall back to the empty-body branch below).
  local body
  body="$(gh issue view "$number" --json body --jq '.body // ""' 2>/dev/null || true)"

  cat <<HEADER
# $prefix: $pure_title

> **User Story ID**: $prefix
> **Persona**: $persona_hint
> **Issue**: $url
> **State**: $state
> **Milestone**: ${milestone:-TBD}
> **Labels**: $labels

<!--
  Imported by scripts/user-stories/sync-user-stories.sh from issue $url.
  The body below is the issue body verbatim at import time. Hand-edits are
  welcome and will NOT be overwritten by subsequent \`make user-stories-bootstrap\`
  runs — bootstrap only creates files for issues that have no local file yet.
-->

HEADER

  if [[ -n "$body" ]]; then
    printf '%s\n' "$body"
  else
    cat <<EMPTY
> _Issue has no body content. Replace this scaffold with the curated story (Persona / Story / Problem / Acceptance Criteria / Definition of Done)._

As $persona_hint,
I want <capability>,
So that <benefit>.

## Acceptance Criteria
- AC1: TBD

## Definition of Done
- TBD
EMPTY
  fi
}

# --- reporting -------------------------------------------------------------
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

drift=0

if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
  section "▼ Issues without a local file (${#MISSING_FILES[@]}):"
  for i in "${MISSING_FILES[@]}"; do
    printf '  • %s #%s [%s] → expected: %s\n' \
      "${ISSUE_PREFIXES[$i]}" "${ISSUE_NUMBERS[$i]}" "${ISSUE_STATES[$i]}" "${ISSUE_EXPECTED[$i]}"
    printf '       %s\n' "${ISSUE_TITLES[$i]}"
  done
  drift=1
fi

if [[ ${#ORPHAN_FILES[@]} -gt 0 ]]; then
  # Split into two buckets: stale-title (prefix exists in issues) vs true orphan
  STALE=()
  TRUE_ORPHANS=()
  for entry in "${ORPHAN_FILES[@]}"; do
    IFS='|' read -r kind file prefix <<<"$entry"
    if [[ "$kind" == "stale" ]]; then
      STALE+=("$prefix|$file")
    else
      TRUE_ORPHANS+=("$file")
    fi
  done

  if [[ ${#STALE[@]} -gt 0 ]]; then
    section "▼ Local files whose title may be stale relative to the issue (${#STALE[@]}):"
    echo "  These files have a prefix that *does* match some open/closed issue, but the"
    echo "  current filename doesn't match any of that prefix's issues' canonical filenames."
    echo "  Either the issue title changed in GitHub (rename the file) or the file is"
    echo "  derived from an older title that no longer matches any issue."
    for entry in "${STALE[@]}"; do
      IFS='|' read -r prefix file <<<"$entry"
      printf '  • %s → %s\n' "$prefix" "$file"
    done
    drift=1
  fi

  if [[ ${#TRUE_ORPHANS[@]} -gt 0 ]]; then
    section "▼ Local files with no matching issue at all (${#TRUE_ORPHANS[@]}):"
    for file in "${TRUE_ORPHANS[@]}"; do
      printf '  • %s\n' "$file"
    done
    drift=1
  fi
fi

if [[ ${#ISSUES_WITHOUT_PREFIX[@]} -gt 0 ]]; then
  section "▼ Issues whose title does not begin with a recognized PREFIX (${#ISSUES_WITHOUT_PREFIX[@]}):"
  for entry in "${ISSUES_WITHOUT_PREFIX[@]}"; do
    printf '  • #%s\n' "$entry"
  done
  echo "  (Not counted as drift — fix the title in GitHub if these should follow the convention.)"
fi

# --- mode dispatch ---------------------------------------------------------
case "$MODE" in
  check)
    if [[ "$drift" == "0" ]]; then
      section "✓ user-stories/ is in sync with GitHub issues."
      exit 0
    fi
    section "✗ Drift detected. Run with 'bootstrap' to create missing stubs, or fix manually."
    exit 1
    ;;

  bootstrap)
    if [[ ${#MISSING_FILES[@]} -eq 0 ]]; then
      section "✓ No missing files to bootstrap."
      exit 0
    fi
    section "▶ Creating stub files for missing issues…"
    created=0
    for i in "${MISSING_FILES[@]}"; do
      target="$STORIES_DIR/${ISSUE_EXPECTED[$i]}"
      if [[ -e "$target" ]]; then
        echo "  ⚠ skip (already exists): ${ISSUE_EXPECTED[$i]}" >&2
        continue
      fi
      generate_stub \
        "${ISSUE_PREFIXES[$i]}" \
        "${ISSUE_NUMBERS[$i]}" \
        "${ISSUE_TITLES[$i]}" \
        "${ISSUE_MILESTONES[$i]}" \
        "${ISSUE_LABELS[$i]}" \
        "${ISSUE_URLS[$i]}" \
        "${ISSUE_STATES[$i]}" >"$target"
      printf '  ✓ %s\n' "${ISSUE_EXPECTED[$i]}"
      created=$((created+1))
    done
    section "Created $created stub file(s). Edit each to refine persona / ACs / DoD before committing."
    exit 0
    ;;

  prune-list)
    if [[ ${#ORPHAN_FILES[@]} -eq 0 ]]; then
      section "✓ No orphan files."
      exit 0
    fi
    section "▶ Files with no matching issue (review before deleting):"
    for entry in "${ORPHAN_FILES[@]}"; do
      IFS='|' read -r kind file prefix <<<"$entry"
      if [[ "$kind" == "stale" ]]; then
        printf '  # stale title (prefix %s has issues, filename does not match any)\n' "$prefix"
      else
        printf '  # orphan (no issue uses prefix %s)\n' "${prefix:-<no-prefix>}"
      fi
      printf '  rm "docs/specifications/user-stories/%s"\n' "$file"
    done
    section "Run the listed commands manually after review."
    exit 0
    ;;
esac
