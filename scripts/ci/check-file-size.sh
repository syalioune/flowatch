#!/usr/bin/env bash
# check-file-size.sh — enforce NFR-21 (no source file > 50 KB).
#
# Per PRD NFR-21 and Story 5.5.
#
# Coverage:
#   - .ts, .tsx, .js, .jsx, .css under src/
#
# Exclusions:
#   - Binary assets (.svg, .png, .jpg, .webp, .woff2, .ttf, .ico)
#     — the navigability rule applies only to source a human reads.
#   - Test fixtures (.bpmn, .bpmn20.xml, .dmn, .bar, .xml)
#   - Generated files (*.gen.*, vite-env.d.ts, routeTree.gen.*)
#   - Files with an in-file `size-exempt:` comment within the first 10 lines.
#
# Override:
#   MAX_SOURCE_FILE_BYTES=<int>  Raise/lower the threshold for an
#   emergency hotfix. Document the override in the PR description
#   and open a follow-up issue to split the offending file. The
#   override is NOT used in CI's normal run.
#
# Exempt one file:
#   Add at the top of the file:
#     // size-exempt: <reason>          (.ts, .tsx, .js, .jsx)
#     /* size-exempt: <reason> */      (.css)
#
# Exit codes:
#   0 — all covered files at or below the limit
#   1 — at least one file over the limit
#   2 — invalid configuration (e.g. malformed MAX_SOURCE_FILE_BYTES)

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

MAX_BYTES="${MAX_SOURCE_FILE_BYTES:-51200}"

# Validate the override is a positive integer.
if ! [[ "$MAX_BYTES" =~ ^[0-9]+$ ]] || [ "$MAX_BYTES" -le 0 ]; then
  echo "✗ MAX_SOURCE_FILE_BYTES must be a positive integer; got: $MAX_BYTES" >&2
  exit 2
fi

# Enumerate covered files. Prefer git ls-files (respects .gitignore).
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  candidates=$(git ls-files \
    'src/*.ts' 'src/*.tsx' 'src/*.js' 'src/*.jsx' 'src/*.css' \
    'src/**/*.ts' 'src/**/*.tsx' 'src/**/*.js' 'src/**/*.jsx' 'src/**/*.css')
else
  candidates=$(find src -type f \( \
    -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
    -o -name '*.css' \) 2>/dev/null)
fi

offenders=()
exempted=0

while IFS= read -r f; do
  [ -z "$f" ] && continue

  # Skip generated files defensively (in case .gitignore is incomplete).
  case "$f" in
    *.gen.ts|*.gen.tsx|*.gen.js|*.gen.jsx) continue ;;
    *routeTree.gen.*|*vite-env.d.ts) continue ;;
    *.min.*) continue ;;
  esac

  # Check for in-file size-exempt marker in the first 10 lines.
  if head -n 10 "$f" 2>/dev/null | grep -qE 'size-exempt:'; then
    reason=$(head -n 10 "$f" | grep -oE 'size-exempt:[^*/]+' | head -n1 | sed 's/^size-exempt: *//' | sed 's/[[:space:]]*$//')
    echo "↷ size-exempt: $f  (${reason:-no reason given})" >&2
    exempted=$((exempted + 1))
    continue
  fi

  # Cross-platform stat (Linux vs BSD/macOS).
  if size=$(stat -c '%s' "$f" 2>/dev/null); then :;
  elif size=$(stat -f '%z' "$f" 2>/dev/null); then :;
  else size=$(wc -c < "$f" | tr -d '[:space:]'); fi

  if [ "$size" -gt "$MAX_BYTES" ]; then
    offenders+=("$f|$size")
  fi
done <<< "$candidates"

limit_kb=$(awk "BEGIN { printf \"%.1f\", $MAX_BYTES / 1024 }")

if [ ${#offenders[@]} -gt 0 ]; then
  for entry in "${offenders[@]}"; do
    path="${entry%%|*}"
    size="${entry##*|}"
    size_kb=$(awk "BEGIN { printf \"%.1f\", $size / 1024 }")
    printf '✗ OVER LIMIT: %s — %s bytes (%s KB; limit %s KB)\n' "$path" "$size" "$size_kb" "$limit_kb" >&2
  done
  echo "" >&2
  echo "${#offenders[@]} file(s) over the ${limit_kb} KB navigability limit (NFR-21)." >&2
  echo "Suggestion: split the file by responsibility (one logical concern per file)." >&2
  echo "See _bmad-output/planning-artifacts/architecture.md §5 for the post-rebuild source tree shape." >&2
  exit 1
fi

echo "✓ All covered source files within ${limit_kb} KB navigability limit (NFR-21). Exempted: $exempted."
