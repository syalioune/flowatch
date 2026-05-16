#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

// scripts/release/update-readme-badges.mjs
//
// Single source of truth for the "Tested vs Flowable" README badge.
// Reads docs/compat.md frontmatter -> rewrites the Flowable badge in README.md.
//
// Run without args to update in place. Run with --check to fail on drift.
//
// Per Story 6.4 and ADR-012 (single SSoT for the Flowable version literal).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const COMPAT_PATH = join(REPO_ROOT, "docs", "compat.md");
const README_PATH = join(REPO_ROOT, "README.md");

// shields.io URL-encodes a single hyphen in the value as `--` to disambiguate
// from the trailing `-orange` color separator. The capture is non-greedy and
// anchored on the literal `-orange.svg` suffix so versions like `7.2.0-rc1`
// (rendered as `Flowable-7.2.0--rc1-orange.svg`) match cleanly.
const BADGE_RE =
  /^\[!\[Tested vs Flowable\]\(https:\/\/img\.shields\.io\/badge\/Flowable-(.+?)-orange\.svg\)\]\(docs\/compat\.md\)$/m;

const encodeShieldsValue = (v) => v.replace(/-/g, "--");
const decodeShieldsValue = (v) => v.replace(/--/g, "-");

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error("docs/compat.md is missing YAML frontmatter");
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*"?([^"]+?)"?\s*$/);
    if (kv) fm[kv[1]] = kv[2];
  }
  return fm;
}

const check = process.argv.includes("--check");

const compat = readFileSync(COMPAT_PATH, "utf8");
const fm = parseFrontmatter(compat);
if (!fm.testedVersion) {
  console.error("docs/compat.md frontmatter is missing required key: testedVersion");
  process.exit(2);
}
const wantVersion = fm.testedVersion;

const readme = readFileSync(README_PATH, "utf8");
const match = readme.match(BADGE_RE);
if (!match) {
  console.error(
    'README.md Flowable badge line not found (expected: "[![Tested vs Flowable](.../Flowable-VERSION-orange.svg)](docs/compat.md)").',
  );
  process.exit(2);
}
const haveVersion = decodeShieldsValue(match[1]);

if (haveVersion === wantVersion) {
  if (!check) {
    console.log(`✓ README badge already at Flowable-${haveVersion}; no change.`);
  }
  process.exit(0);
}

if (check) {
  console.error(
    `✗ Drift: README badge shows Flowable-${haveVersion}, docs/compat.md says testedVersion=${wantVersion}.`,
  );
  console.error("  Fix: node scripts/release/update-readme-badges.mjs");
  process.exit(1);
}

const encoded = encodeShieldsValue(wantVersion);
const updated = readme.replace(
  BADGE_RE,
  `[![Tested vs Flowable](https://img.shields.io/badge/Flowable-${encoded}-orange.svg)](docs/compat.md)`,
);
writeFileSync(README_PATH, updated);
console.log(`✓ Updated README Flowable badge: ${haveVersion} → ${wantVersion}`);
