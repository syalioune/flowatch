#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# check-dry-run.sh — parses a semantic-release --dry-run log and exits non-zero
# on the four explicit failure classes documented by story 6.5-3 AC-3:
#
#   (a) version       — no/malformed "next release version" line OR "no relevant changes"
#   (b) changelog     — @semantic-release/release-notes-generator plugin errors
#   (c) plugin        — any plugin emits SemanticReleaseError or "Error: …"
#   (d) tag-collision — computed next-version already exists as a git tag
#
# Check order is (b) → (c) → (a) → (d): a plugin crash usually suppresses the
# "next release version is …" line, so checking version-extraction first would
# misreport the category. Reading classes (b)/(c) first surfaces the root
# cause; (a) is the catch-all for benign "no release" cases; (d) is checked
# only after a valid version has been extracted.
#
# Verdict on stdout (final line, always exactly one of):
#   release-dryrun: PASS — next version X.Y.Z
#   release-dryrun: FAIL — <category> — <one-line reason>
#
# Exit 0 on PASS, 1 on any FAIL.

set -euo pipefail

LOG="${1:?usage: check-dry-run.sh <dry-run.log>}"

if [ ! -f "$LOG" ]; then
  echo "release-dryrun: FAIL — (c) plugin — log file missing: $LOG"
  exit 1
fi

# ---------------------------------------------------------------------------
# (b) Changelog generation errors
# ---------------------------------------------------------------------------
if grep -qE '(\[changelog\].*ERROR|Cannot read|TypeError.*release-notes-generator|Could not generate release notes)' "$LOG"; then
  reason=$(grep -oE '(TypeError.*release-notes-generator.*|Cannot read.*|Could not generate.*|\[changelog\].*ERROR.*)' "$LOG" | head -1 | tr -d '\r')
  echo "release-dryrun: FAIL — (b) changelog — ${reason:-generation error in log}"
  exit 1
fi

# ---------------------------------------------------------------------------
# (c) Plugin error — SemanticReleaseError or "Error: <CapitalLetter>…" line
# ---------------------------------------------------------------------------
if grep -qE '(SemanticReleaseError|^Error: [A-Z])' "$LOG"; then
  reason=$(grep -oE '(SemanticReleaseError.*|^Error: [A-Z].*)' "$LOG" | head -1 | tr -d '\r')
  echo "release-dryrun: FAIL — (c) plugin — ${reason:-plugin error in log}"
  exit 1
fi

# ---------------------------------------------------------------------------
# (a) Version: must contain "next release version is X.Y.Z" with valid SemVer
# ---------------------------------------------------------------------------
version_line=$(grep -oE 'next release version is [^[:space:]]+' "$LOG" | tail -1 || true)

if [ -z "$version_line" ]; then
  if grep -qE 'there are no relevant changes' "$LOG"; then
    echo "release-dryrun: FAIL — (a) version — no relevant changes; release would be silent"
    exit 1
  fi
  echo "release-dryrun: FAIL — (a) version — could not extract next version from log"
  exit 1
fi

version="${version_line##* }"
if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]]; then
  echo "release-dryrun: FAIL — (a) version — malformed: $version"
  exit 1
fi

# ---------------------------------------------------------------------------
# (d) Tag collision — log already reported it OR git tag list contains it
# ---------------------------------------------------------------------------
version_re=${version//./\\.}

if grep -qE "tag v?${version_re} already exists" "$LOG"; then
  echo "release-dryrun: FAIL — (d) tag-collision — log reports tag v${version} already exists"
  exit 1
fi

# Tag-list cross-check is only meaningful inside a git working tree.
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git tag --list | grep -qxE "v?${version_re}"; then
    echo "release-dryrun: FAIL — (d) tag-collision — git tag list contains v${version}"
    exit 1
  fi
fi

echo "release-dryrun: PASS — next version ${version}"
exit 0
