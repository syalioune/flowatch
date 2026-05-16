#!/usr/bin/env bash
# from-bmad-epics.sh — shard _bmad-output/planning-artifacts/epics.md into
# per-story files under docs/specifications/user-stories/ + emit a
# flowatch_backlog.csv for the GitHub-issue importer.
#
# Invoked by the on_complete hook in
# _bmad/custom/bmad-create-epics-and-stories.toml after the BMad skill
# finishes writing epics.md. Can also be run manually.
#
# Pipeline this fits into:
#   bmad-create-epics-and-stories  →  epics.md
#                                      ↓ (THIS SCRIPT)
#   docs/specifications/user-stories/<AREA>-<PERSONA>-<SEQ>_<title>.md
#                                      ↓ (import_issues.py)
#   GitHub Issues
#
# Inputs:
#   _bmad-output/planning-artifacts/epics.md  (positional override: $1)
#
# Outputs:
#   docs/specifications/user-stories/<AREA>-<PERSONA>-<SEQ>_<title>.md  (one per story)
#   docs/specifications/user-stories/flowatch_backlog.csv               (Title, Body, Labels, Milestone)
#
# Conventions: see scripts/user-stories/README.md and the persistent_facts
# block in _bmad/custom/bmad-create-epics-and-stories.toml.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT="${1:-$REPO_ROOT/_bmad-output/planning-artifacts/epics.md}"
OUT_DIR="$REPO_ROOT/docs/specifications/user-stories"
CSV="$OUT_DIR/flowatch_backlog.csv"

[ -f "$INPUT" ] || { echo "✗ epics.md not found at $INPUT" >&2; exit 1; }
mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------------
# AREA inference — map an epic title to one of the canonical AREA codes.
# Ordered: first match wins, so put narrower patterns before broader ones.
# Keep this table in sync with the persistent_facts entry in the .toml override.
# ---------------------------------------------------------------------------
area_for_epic() {
  local title="${1,,}"  # lowercase
  case "$title" in
    # More specific multi-word patterns first so they don't get shadowed.
    *multi-connection*|*saved\ connection*)             echo "AUT" ;;
    *connection*|*engine*probe*|*engine\ version*)      echo "NAV" ;;
    # DPL before MDL so "BPMN Deployments + Definitions" matches DPL (the
    # deployments management screens), while pure modeler epics — "BPMN + DMN
    # Modelers", "Properties Panel", "Token Overlay" — still fall through to MDL.
    *deployment*|*definition*|*repository*|*migration*|*.bar*) echo "DPL" ;;
    *modeler*|*bpmn*|*dmn*|*cmmn*|*palette*|*diagram*|*overlay*) echo "MDL" ;;
    *runtime*|*task*|*form*|*attachment*|*claim*|*variable*) echo "RUN" ;;
    *job*|*batch*|*event*|*timer*|*dead-letter*|*dlq*) echo "JOB" ;;
    *history*|*audit*)                                  echo "HST" ;;
    *identity*|*idm*|*user*|*group*|*tenant*|*privilege*) echo "IDT" ;;
    *inspector*|*api*log*)                              echo "INS" ;;
    *auth*|*oidc*|*sso*|*bearer*)                       echo "AUT" ;;
    *design*|*theme*|*look*|*density*|*accent*|*styles*|*styling*|*branding*) echo "DSY" ;;
    *router*|*routing*|*navigation*|*sidebar*|*topbar*) echo "NAV" ;;
    *rest*|*api*|*bruno*|*compat*)                      echo "API" ;;
    *test*|*playwright*|*e2e*|*lint*|*biome*|*typecheck*|*quality*) echo "QGT" ;;
    *docker*|*vite*|*build*|*foundation*|*bootstrap*|*pages*|*nginx*) echo "FND" ;;
    *doc*|*readme*|*changelog*|*release*)               echo "DOC" ;;
    *i18n*|*l10n*|*a11y*|*accessibility*)               echo "I18N" ;;
    *)                                                  echo "DOC" ;; # safest fallback
  esac
}

# ---------------------------------------------------------------------------
# PERSONA inference — extract the persona from the "As <persona>" sentence.
# Returns trigram MIR / DAA / SAS / SYS. Patterns are case-insensitive
# (the body is already lowercased before matching).
# ---------------------------------------------------------------------------
persona_for_story() {
  local body="$1"
  local lc="${body,,}"
  # Order matters — most specific persona-name matches first.
  case "$lc" in
    *mira*|*flowable\ operator*|*the\ operator*|*air-gapped\ operator*|*screen-reader\ user*) echo "MIR" ;;
    *daan*|*tech-lead\ evaluator*|*tech\ lead\ evaluator*|*flowable\ evaluator*) echo "DAA" ;;
    *sasha*|*admin-script\ author*|*admin-tool\ author*|*internal\ admin*|*developer\ testing*) echo "SAS" ;;
    # Pure system-shaped stories (no human persona): CI, maintainer, agent, etc.
    *as\ ci*|*as\ a\ system*|*as\ a\ maintainer*|*as\ a\ contributor*|*as\ a\ developer*|*as\ an\ agent*) echo "SYS" ;;
    *) echo "SYS" ;;  # Fallback. Surfaces as an unmappable-persona warning.
  esac
}

# ---------------------------------------------------------------------------
# Title sanitisation — drop punctuation that breaks filenames, keep readability.
# ---------------------------------------------------------------------------
sanitise_title() {
  local s="$1"
  s="${s//\//-}"             # slash → dash
  s="${s//:/ }"              # colon → space
  s="$(printf '%s' "$s" | tr -s '[:space:]' '_')"  # whitespace → underscore
  s="${s#_}"; s="${s%_}"     # trim
  printf '%s' "$s"
}

# CSV escaping (double-quote any field with comma, quote, or newline)
csv_escape() {
  local v="$1"
  if [[ "$v" =~ [,\"$'\n'] ]]; then
    v="${v//\"/\"\"}"
    printf '"%s"' "$v"
  else
    printf '%s' "$v"
  fi
}

# ---------------------------------------------------------------------------
# Main pass — read epics.md, emit a JSONL stream "epic_num|epic_title|story_num|story_title|story_body"
# Use awk because bash multi-line block parsing is painful and awk handles state cleanly.
# ---------------------------------------------------------------------------
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

awk '
  # POSIX-compatible parser. Records are newline-terminated (one per story),
  # fields separated by TAB. Body newlines are encoded as the literal two-char
  # sequence "\n" (backslash + n) and decoded back on the bash side via printf %b.
  BEGIN {
    epic_num=""; epic_title=""; story_num=""; story_title=""; body=""; in_story=0
    # Default until the first `## Milestone X.Y.Z stories` divider is seen.
    milestone="0.0.1"
  }

  function emit_record() {
    # Encode any embedded backslash first, then encode newline. Use TAB as field sep.
    enc = body
    gsub(/\\/, "\\\\", enc)
    gsub(/\n/, "\\n", enc)
    printf "%s\t%s\t%s\t%s\t%s\t%s\n", epic_num, epic_title, story_num, story_title, enc, milestone
  }

  # Track milestone from `## Milestone X.Y.Z stories` H2 dividers in the body.
  # Each divider applies until the next one is encountered.
  /^## Milestone [0-9]+\.[0-9]+\.[0-9]+ stories/ {
    if (in_story) { emit_record(); in_story=0; body="" }
    line = $0
    sub(/^## Milestone /, "", line)
    sub(/ stories.*$/, "", line)
    milestone = line
    next
  }

  # Match both H2 (## Epic N:) and H3 (### Epic N:) — milestone-block epics
  # in epics.md use the H3 form, nested under `## Milestone X.Y.Z stories`.
  /^##+ Epic [0-9]+:/ {
    if (in_story) { emit_record(); in_story=0; body="" }
    line = $0
    sub(/^##+ Epic /, "", line)
    split(line, parts, ":")
    epic_num = parts[1]
    epic_title = parts[2]
    for (i = 3; i <= length(parts); i++) epic_title = epic_title ":" parts[i]
    sub(/^[[:space:]]+/, "", epic_title)
    sub(/[[:space:]]+$/, "", epic_title)
    next
  }

  /^### Story [0-9]+\.[0-9]+:/ {
    if (in_story) { emit_record() }
    line = $0
    sub(/^### Story /, "", line)
    split(line, parts, ":")
    story_num = parts[1]
    story_title = parts[2]
    for (i = 3; i <= length(parts); i++) story_title = story_title ":" parts[i]
    sub(/^[[:space:]]+/, "", story_title)
    sub(/[[:space:]]+$/, "", story_title)
    body=""; in_story=1
    next
  }

  in_story { body = body $0 "\n" }
  END { if (in_story) emit_record() }
' "$INPUT" > "$TMP"

stories_created=0
unmappable_area=0
unmappable_persona=0

# Initialize CSV with header
{ printf 'Title,Body,Labels,Milestone\n'; } > "$CSV"

# Per-area sequence counters
declare -A SEQ

# Read TAB-separated records, one per line. Body has newlines encoded as `\n`
# (literal two-char sequence) — decode with printf %b before use.
while IFS=$'\t' read -r epic_num epic_title story_num story_title body_enc milestone; do
  [ -n "$story_num" ] || continue

  # Decode `\n` → real newlines. printf %b interprets backslash escapes.
  body="$(printf '%b' "$body_enc")"
  # Default milestone if parser didn't emit one (older epics.md without dividers).
  milestone="${milestone:-0.0.1}"

  AREA="$(area_for_epic "$epic_title")"
  PERSONA="$(persona_for_story "$body")"
  # Only flag DOC as an unmapped AREA (it's the fallback bucket); but DOC is
  # also legitimate for documentation/release/changelog epics, so suppress
  # the warning when the epic title explicitly says so.
  if [ "$AREA" = "DOC" ]; then
    case "${epic_title,,}" in
      *doc*|*readme*|*changelog*|*release*|*announcement*) ;;  # legitimate DOC
      *) unmappable_area=$((unmappable_area + 1)) ;;
    esac
  fi
  # Flag SYS as an unmapped PERSONA only if the *As-clause itself* names a
  # human persona — i.e. "As an <adjective>* operator/user/admin/…, …".
  # Avoids false positives like "As CI, … the operator path" where the
  # persona keyword appears later in the body but the named subject is CI.
  if [ "$PERSONA" = "SYS" ] && echo "${body,,}" | grep -qE '^as an? [^,.]*\b(operator|user|admin|developer|tech\s*lead|evaluator)\b'; then
    unmappable_persona=$((unmappable_persona + 1))
  fi

  key="${AREA}-${PERSONA}"
  SEQ[$key]=$(( ${SEQ[$key]:-0} + 1 ))
  seq=$(printf "%03d" "${SEQ[$key]}")

  prefix="${AREA}-${PERSONA}-${seq}"
  safe_title="$(sanitise_title "$story_title")"
  filename="${prefix}_${safe_title}.md"
  filepath="$OUT_DIR/$filename"

  # Clobber any existing file at this slug. Hand-curated edits do not survive
  # re-emit; recover them via `git diff` or `git restore`. This avoids the
  # -v2/-v3/... accumulation that the previous non-destructive guard produced
  # whenever the same slug was regenerated across successive shard runs.

  # Write the story file with metadata header + verbatim body.
  cat > "$filepath" <<MD
# ${prefix}: ${story_title}

> **User Story ID**: ${prefix}
> **Persona**: ${PERSONA}
> **Epic**: ${epic_num} — ${epic_title}
> **Milestone**: ${milestone}
> **Source**: \`_bmad-output/planning-artifacts/epics.md\` (story ${story_num})
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:$(echo "$AREA" | tr '[:upper:]' '[:lower:]'), release:${milestone}

${body}
MD

  # Append a row to the CSV. Body is the story body verbatim (escaped).
  title_field="$(csv_escape "${prefix}: ${story_title}")"
  body_field="$(csv_escape "$body")"
  labels_field="$(csv_escape "type:user-story,state:backlog,area:$(echo "$AREA" | tr '[:upper:]' '[:lower:]'),release:${milestone}")"
  milestone_field="$(csv_escape "$milestone")"
  printf '%s,%s,%s,%s\n' "$title_field" "$body_field" "$labels_field" "$milestone_field" >> "$CSV"

  stories_created=$((stories_created + 1))
done < "$TMP"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo "✓ Sharded $stories_created stor$([ "$stories_created" = "1" ] && echo y || echo ies) from $INPUT"
echo "  → $OUT_DIR/"
echo "  → $CSV"
if [ "$unmappable_area" -gt 0 ]; then
  echo "⚠ $unmappable_area stor$([ "$unmappable_area" = "1" ] && echo y || echo ies) fell back to AREA=DOC — review epic titles or extend"
  echo "   the area_for_epic table in $0."
fi
if [ "$unmappable_persona" -gt 0 ]; then
  echo "⚠ $unmappable_persona stor$([ "$unmappable_persona" = "1" ] && echo y || echo ies) mentioned a persona keyword but inferred PERSONA=SYS —"
  echo "   review the As-<persona> sentence or extend the persona_for_story table in $0."
fi
echo ""
echo "Next: push the backlog to GitHub Issues:"
echo "  python scripts/user-stories/import_issues.py --repo syalioune/flowatch --token \$GITHUB_TOKEN"
