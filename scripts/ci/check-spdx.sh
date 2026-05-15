#!/usr/bin/env bash
# check-spdx.sh — verify every covered source file carries an
# `SPDX-License-Identifier: Apache-2.0` header.
#
# Per PRD NFR-28 and Story 5.3.
#
# Coverage:
#   - .ts, .tsx, .js, .jsx, .css, .html under src/, branding/, repo root
#   - .svg under branding/ (XML comment form)
#
# Exclusions:
#   - Generated files (*.gen.*, routeTree.gen.*, vite-env.d.ts)
#   - Build / test output (dist/, coverage/, node_modules/)
#   - Minified bundles (*.min.*)
#   - Test fixtures (*.bpmn, *.bpmn20.xml, *.dmn, *.bar, *.xml)
#   - Markdown / JSON / YAML / TOML (out of scope per AC-7)
#
# Exit codes:
#   0 — all covered files have the header
#   1 — at least one covered file is missing the header (paths printed)

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

# Enumerate covered files via git-tracked listing (respects .gitignore).
# Fall back to find(1) if git is unavailable.
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  candidates=$(git ls-files \
    'src/*.ts' 'src/*.tsx' 'src/*.js' 'src/*.jsx' 'src/*.css' 'src/*.html' \
    'src/**/*.ts' 'src/**/*.tsx' 'src/**/*.js' 'src/**/*.jsx' 'src/**/*.css' 'src/**/*.html' \
    'branding/*.svg' 'branding/**/*.svg' \
    'index.html' 'vite.config.js' 'vite.config.ts' 'vite.config.mjs')
else
  candidates=$(find src branding -type f \( \
    -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
    -o -name '*.css' -o -name '*.html' -o -name '*.svg' \) 2>/dev/null)
  [ -f index.html ] && candidates="$candidates"$'\n'"index.html"
  [ -f vite.config.js ] && candidates="$candidates"$'\n'"vite.config.js"
  [ -f vite.config.ts ] && candidates="$candidates"$'\n'"vite.config.ts"
fi

# Apply exclusions.
missing=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.gen.ts|*.gen.tsx|*.gen.js|*.gen.jsx) continue ;;
    *routeTree.gen.*|*vite-env.d.ts) continue ;;
    *.min.*) continue ;;
    dist/*|coverage/*|node_modules/*) continue ;;
    *.bpmn|*.bpmn20.xml|*.dmn|*.bar|*.xml) continue ;;
  esac
  if ! grep -q "SPDX-License-Identifier" "$f" 2>/dev/null; then
    missing+=("$f")
  fi
done <<< "$candidates"

if [ ${#missing[@]} -gt 0 ]; then
  for path in "${missing[@]}"; do
    echo "✗ MISSING SPDX header: $path" >&2
  done
  echo "" >&2
  echo "${#missing[@]} file(s) missing SPDX header. Add one of:" >&2
  echo "  // SPDX-License-Identifier: Apache-2.0           (.ts, .tsx, .js, .jsx)" >&2
  echo "  /* SPDX-License-Identifier: Apache-2.0 */        (.css)" >&2
  echo "  <!-- SPDX-License-Identifier: Apache-2.0 -->     (.html, .svg)" >&2
  exit 1
fi

echo "✓ SPDX headers present on all covered source files."
