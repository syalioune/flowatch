#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Self-test for scripts/ci/check-fetch-funnel.sh.
#
# Builds a minimal src/ layout in a tempdir with one allowlisted call
# (src/api.ts) and one offending call (src/screens.tsx), runs the real
# check script with cwd=tempdir, and asserts:
#   Phase 1 — script exits non-zero AND names src/screens.tsx.
#   Phase 2 — after appending `// p-001-allow` to the offender, script
#             exits zero.
#
# Per Pattern P-001 (architecture.md §371) and Story 8.4 AC-3.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
script="${repo_root}/scripts/ci/check-fetch-funnel.sh"

if [ ! -x "$script" ]; then
  echo "✗ check-fetch-funnel.sh not found or not executable at ${script}" >&2
  exit 1
fi

# Portable form: GNU mktemp's `-t TEMPLATE` flag is rejected by BSD/macOS
# mktemp (which treats `-t` as "use TMPDIR with this prefix"). The full-
# path form works identically on both — review patch.
tmpdir="$(mktemp -d "${TMPDIR:-/tmp}/check-fetch-funnel-test.XXXXXX")"
trap 'rm -rf "$tmpdir"' EXIT

# The script computes `repo_root` from its own location and `cd`s there,
# so we copy it into the tempdir's `scripts/ci/` so it acts on the tempdir
# rather than the real repo.
mkdir -p "${tmpdir}/scripts/ci"
cp "$script" "${tmpdir}/scripts/ci/check-fetch-funnel.sh"
chmod +x "${tmpdir}/scripts/ci/check-fetch-funnel.sh"
test_script="${tmpdir}/scripts/ci/check-fetch-funnel.sh"

# Minimal git repo so the script's `git ls-files` branch is exercised
# (otherwise it would fall back to `find`, which would also work but
# wouldn't test the primary code path).
cd "$tmpdir"
git init -q
git config user.email "test@test"
git config user.name "test"

mkdir -p src
cat > src/api.ts <<'EOF'
// Allowlisted file — the fetch( call here MUST pass.
export async function probe(url: string): Promise<Response> {
  return await fetch(url);
}
EOF

cat > src/screens.tsx <<'EOF'
// Offender — direct fetch outside the funnel.
export async function leaky(url: string): Promise<Response> {
  return await fetch(url);
}
EOF

git add -A
git commit -q -m "fixture"

# Phase 1 — script must fail and name the offender.
set +e
phase1_out=$(bash "$test_script" 2>&1)
phase1_code=$?
set -e

if [ "$phase1_code" -eq 0 ]; then
  echo "✗ Phase 1 expected non-zero exit; got 0" >&2
  echo "stdout:" >&2
  echo "$phase1_out" >&2
  exit 1
fi

if ! echo "$phase1_out" | grep -q "src/screens.tsx"; then
  echo "✗ Phase 1 expected output to mention 'src/screens.tsx'; got:" >&2
  echo "$phase1_out" >&2
  exit 1
fi

# Match the `src/api.ts:` violation format (filename:line:) to distinguish
# real findings from the trailing summary message that names the file as
# the allowlisted home of fetch().
if echo "$phase1_out" | grep -qE '^✗ src/api\.ts:[0-9]+:'; then
  echo "✗ Phase 1 unexpectedly flagged the allowlisted src/api.ts as a violation:" >&2
  echo "$phase1_out" >&2
  exit 1
fi

# Phase 2 — add the escape hatch; script must pass.
# sed inserts ` // p-001-allow` before the closing paren (just before EOL).
sed -i.bak 's|return await fetch(url);|return await fetch(url); // p-001-allow|' src/screens.tsx
rm -f src/screens.tsx.bak
git add -A
git commit -q -m "escape hatch"

set +e
phase2_out=$(bash "$test_script" 2>&1)
phase2_code=$?
set -e

if [ "$phase2_code" -ne 0 ]; then
  echo "✗ Phase 2 expected exit 0 after escape-hatch comment; got ${phase2_code}" >&2
  echo "stdout:" >&2
  echo "$phase2_out" >&2
  exit 1
fi

echo "✓ check-fetch-funnel.sh self-test passed (phase 1 + phase 2)."
