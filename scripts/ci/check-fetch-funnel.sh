#!/usr/bin/env bash
# check-fetch-funnel.sh — enforce Pattern P-001: every Flowable REST call
# must go through request() in src/api.ts. A literal `fetch(` in any other
# file makes the Inspector go blind (the funnel is what populates API_LOG
# and dispatches the api:log event).
#
# Per Pattern P-001 (architecture.md §371-392) and Epic 8 Story 8.4.
#
# Search scope:
#   - .ts, .tsx under src/
#
# Exclusions:
#   - Generated files (*.gen.*, routeTree.gen.*)
#   - Ambient type files (*.d.ts)
#   - Build / coverage output (dist/, coverage/, node_modules/)
#
# Allowlist:
#   - src/api.ts (the funnel file itself; also contains JSDoc text mentioning
#     `fetch()` which incidentally matches the regex)
#
# Per-line escape hatch:
#   - Append `// p-001-allow` (or `{/* p-001-allow */}` in JSX-text
#     contexts where // comments are not legal) on the same line as the
#     `fetch(` token. The script matches the substring `p-001-allow`, so
#     both comment styles work. The only legitimate uses today are
#     `buildFetchSnippet`'s template literal (string content, not a call)
#     and the "fetch()" tab label in the Inspector (JSX text content).
#
# Exit codes:
#   0 — no violations
#   1 — at least one violation (offending file:line printed)

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

# Enumerate covered files via git-tracked listing (respects .gitignore).
# `git rev-parse --is-inside-work-tree` works in both regular repos AND
# linked worktrees (where `.git` is a regular file, not a directory) —
# review patch. Falls back to find(1) when git is unavailable.
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  candidates=$(git ls-files 'src/*.tsx' 'src/*.ts' 'src/**/*.tsx' 'src/**/*.ts')
else
  candidates=$(find src -type f \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null)
fi

# Apply exclusions and run the fetch-funnel grep.
violations=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
    *.gen.ts|*.gen.tsx) continue ;;
    *routeTree.gen.*) continue ;;
    *.d.ts) continue ;;
    dist/*|coverage/*|node_modules/*) continue ;;
    */node_modules/*|*/dist/*|*/coverage/*) continue ;; # nested vendor dirs
    src/api.ts) continue ;; # allowlisted: the funnel file itself
  esac
  # `(^|[^A-Za-z0-9_])fetch[[:space:]]*\(` — POSIX-portable equivalent of
  # `\b`. BSD/macOS grep doesn't support `\b` as a word boundary in ERE,
  # so the GNU-style escape was a silent false-pass on local Mac runs of
  # `npm run check:p-001`. The character-class alternation works on both
  # GNU and BSD grep — review patch.
  #
  # Filter out lines whose escape-hatch comment carries the `p-001-allow`
  # token bounded by non-word chars (so a typo like `p-001-allowed` does
  # NOT bypass the rule — review patch).
  while IFS= read -r match; do
    if [[ "$match" =~ (^|[^A-Za-z0-9-])p-001-allow($|[^A-Za-z0-9-]) ]]; then
      continue
    fi
    lineno="${match%%:*}"
    body="${match#*:}"
    violations+=("${f}:${lineno}:${body}")
  done < <(grep -nE '(^|[^A-Za-z0-9_])fetch[[:space:]]*\(' "$f" 2>/dev/null || true)
done <<< "$candidates"

if [ ${#violations[@]} -gt 0 ]; then
  for v in "${violations[@]}"; do
    echo "✗ $v" >&2
  done
  echo "" >&2
  echo "${#violations[@]} violation(s) — every fetch() call must funnel through src/api.ts (Pattern P-001). See CONTRIBUTING.md." >&2
  exit 1
fi

echo "✓ All fetch() calls funnel through src/api.ts (Pattern P-001)."
