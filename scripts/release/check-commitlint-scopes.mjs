#!/usr/bin/env node

// Drift gate: verifies that every scope in commitlint.config.cjs's
// `scope-enum` allow-list is mapped to a theme in release.config.mjs THEMES.
//
// Without this gate, a contributor can land a commit with a CC-valid scope
// that the release-notes generator silently dumps into 🧰 Other (catch-all).
// Run after editing either file, or any time CI checks for drift.
//
// Usage:
//   node scripts/release/check-commitlint-scopes.mjs
//
// Exits 0 if every commitlint scope is themed; 1 with a clear diff if any
// scope is missing from THEMES — OR if THEMES contains scopes missing from
// commitlint (one-way drift in either direction is a bug).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

// ── Extract THEMES from release.config.mjs (mirrored from check-scope.mjs)
const cfgText = readFileSync(resolve(repoRoot, "release.config.mjs"), "utf8");

function extractThemes() {
  const block = cfgText.match(/const\s+THEMES\s*=\s*\[([\s\S]*?)\n\];/m);
  if (!block) return null;
  const body = block[1];
  const nameRe = /\bname:\s*'([^']+)'|\bname:\s*"([^"]+)"/g;
  const scopesRe = /\bscopes:\s*\[([\s\S]*?)\]/g;
  const names = [];
  let m;
  while ((m = nameRe.exec(body))) names.push({ name: m[1] ?? m[2], at: m.index });
  const scopeBlocks = [];
  while ((m = scopesRe.exec(body))) scopeBlocks.push({ scopes: m[1], at: m.index });
  const entries = [];
  for (const n of names) {
    const sb = scopeBlocks.find((s) => s.at > n.at);
    if (!sb) continue;
    const scopes = sb.scopes
      .split(",")
      .map((s) => s.replace(/\/\/[^\n]*/g, ""))
      .map((s) => s.replace(/['"\s]/g, ""))
      .filter(Boolean);
    entries.push({ name: n.name, scopes });
  }
  return entries;
}

const themes = extractThemes();
if (!themes) {
  console.error("✗ Could not extract THEMES from release.config.mjs.");
  process.exit(2);
}

const themedScopes = new Set();
for (const t of themes) for (const s of t.scopes) themedScopes.add(s.toLowerCase());

// ── Load commitlint.config.cjs and read its scope-enum
const commitlintPath = resolve(repoRoot, "commitlint.config.cjs");
const commitlintCfg =
  (await import(`file://${commitlintPath}`)).default ?? (await import(`file://${commitlintPath}`));

const scopeEnumRule = commitlintCfg?.rules?.["scope-enum"];
if (!Array.isArray(scopeEnumRule) || !Array.isArray(scopeEnumRule[2])) {
  console.error("✗ commitlint.config.cjs has no rules['scope-enum'][2] array.");
  process.exit(2);
}
const commitlintScopes = new Set(scopeEnumRule[2].map((s) => s.toLowerCase()));

// ── Compare both directions
const missingFromThemes = [...commitlintScopes].filter((s) => !themedScopes.has(s)).sort();
const missingFromCommitlint = [...themedScopes].filter((s) => !commitlintScopes.has(s)).sort();

if (missingFromThemes.length === 0 && missingFromCommitlint.length === 0) {
  console.log(
    `✓ ${commitlintScopes.size} commitlint scopes aligned with ${themes.length} themes (${themedScopes.size} themed scopes).`,
  );
  process.exit(0);
}

if (missingFromThemes.length > 0) {
  console.error("✗ Scopes in commitlint.config.cjs but missing from release.config.mjs THEMES:");
  for (const s of missingFromThemes) console.error(`    - ${s}`);
}
if (missingFromCommitlint.length > 0) {
  console.error("✗ Scopes in release.config.mjs THEMES but missing from commitlint.config.cjs:");
  for (const s of missingFromCommitlint) console.error(`    - ${s}`);
}
console.error(
  "\nFix: edit the offending file so the two scope vocabularies match exactly. Single source of truth = release.config.mjs THEMES.",
);
process.exit(1);
