#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Parse a semantic-release --dry-run log and exit non-zero on the four
# explicit failure classes documented in story 6.5-3 AC-3:
#
#   (a) version       — next version is missing/malformed or release would be silent
#   (b) changelog     — release-notes-generator or @semantic-release/changelog errored
#   (c) plugin        — any plugin or semantic-release itself errored
#   (d) tag-collision — computed next version already exists as a git tag
#
# Usage:
#   bash scripts/release/check-dry-run.sh <dry-run.log>
#
# Emits a final single-line verdict on stdout:
#   release-dryrun: PASS — next version X.Y.Z
#   release-dryrun: FAIL — <category> — <reason>

set -euo pipefail

LOG="${1:?usage: check-dry-run.sh <dry-run.log>}"

if [ ! -f "$LOG" ]; then
  echo "release-dryrun: FAIL — (c) plugin — log file missing"
  exit 1
fi

# Check categories in failure-precedence order: plugin/changelog errors are
# checked BEFORE version extraction, because a plugin crash usually
# suppresses the "next release version is" line — we want the real cause
# in the verdict, not the downstream "missing version" symptom.

# (b) Changelog generation errors
if grep -qE '(changelog.*ERROR|Cannot read|TypeError.*release-notes-generator|Could not generate)' "$LOG"; then
  echo "release-dryrun: FAIL — (b) changelog — generation error in log"
  exit 1
fi

# (c) Plugin error (heuristic: well-known error prefixes appear at column 0)
if grep -qE '^(SemanticReleaseError|Error: [A-Z])' "$LOG"; then
  echo "release-dryrun: FAIL — (c) plugin — error in log"
  exit 1
fi

# (a) Missing or malformed next version
if grep -qE 'there are no relevant changes' "$LOG"; then
  echo "release-dryrun: FAIL — (a) version — no relevant changes; release would be silent"
  exit 1
fi

version_line=$(grep -oE 'next release version is [^[:space:]]+' "$LOG" | tail -1 || true)
if [ -z "$version_line" ]; then
  echo "release-dryrun: FAIL — (a) version — could not extract next version from log"
  exit 1
fi
version="${version_line##* }"
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]]; then
  echo "release-dryrun: FAIL — (a) version — malformed: $version"
  exit 1
fi

# (d) Tag collision — log-side and git-side
escaped_version="${version//./\\.}"
if grep -qE "tag v?${escaped_version} already exists" "$LOG"; then
  echo "release-dryrun: FAIL — (d) tag-collision — log reports tag exists"
  exit 1
fi
if git tag --list 2>/dev/null | grep -qxE "v?${escaped_version}"; then
  echo "release-dryrun: FAIL — (d) tag-collision — git tag list contains $version"
  exit 1
fi

echo "release-dryrun: PASS — next version $version"
exit 0
