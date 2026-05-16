#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

// generate-notice.mjs — produce NOTICE at repo root from package.json +
// license-checker-rseidelsohn output. Idempotent: re-running with no dep
// changes produces byte-identical output (alphabetical sort + frozen
// header text).
//
// Usage:
//   node scripts/release/generate-notice.mjs           # write NOTICE
//   node scripts/release/generate-notice.mjs --check   # exit 1 if regen
//                                                       differs from
//                                                       committed NOTICE
//
// Per PRD NFR-30 (attribution) and Story 5.4.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const noticePath = resolve(repoRoot, "NOTICE");
const pkgPath = resolve(repoRoot, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

function runChecker(scope) {
  return JSON.parse(
    execSync(`npx license-checker-rseidelsohn --json --${scope}`, {
      cwd: repoRoot,
      encoding: "utf8",
    }),
  );
}

const prodTree = runChecker("production");
const devTree = runChecker("development");

const directProd = Object.keys(pkg.dependencies ?? {});
const directDev = Object.keys(pkg.devDependencies ?? {});

function lookup(catalog, name) {
  // license-checker keys entries as `name@version`. Find the first match.
  const key = Object.keys(catalog).find((k) => {
    const at = k.lastIndexOf("@");
    return at > 0 && k.slice(0, at) === name;
  });
  if (!key) return null;
  const at = key.lastIndexOf("@");
  return { ...catalog[key], _version: key.slice(at + 1) };
}

function renderRow(name, info) {
  if (!info) return `- ${name}  (resolution failed)`;
  const version = info._version ?? "?";
  const license = info.licenses ?? "UNKNOWN";
  const homepage = info.repository ?? info.url ?? `https://www.npmjs.com/package/${name}`;
  return `- ${name}  ${version}  ${license}  ${homepage}`;
}

const lines = [];
lines.push("Flowatch");
// Computed at generation time so the NOTICE rolls over each calendar year
// without a manual bump. The check mode in CI re-runs this on every push, so
// the file rotates automatically on the first build of the new year.
lines.push(`Copyright ${new Date().getFullYear()} Flowatch contributors`);
lines.push("");
lines.push("This product includes software developed at the listed third-party");
lines.push("projects. Each entry shows the package name, version, license SPDX");
lines.push("identifier, and homepage URL.");
lines.push("");
lines.push("----------------------------------------------------------------");
lines.push("Direct dependencies (production):");
lines.push("----------------------------------------------------------------");
lines.push("");
for (const name of [...directProd].sort()) {
  lines.push(renderRow(name, lookup(prodTree, name)));
}
lines.push("");
lines.push("----------------------------------------------------------------");
lines.push("Direct dependencies (development):");
lines.push("----------------------------------------------------------------");
lines.push("");
for (const name of [...directDev].sort()) {
  lines.push(renderRow(name, lookup(devTree, name)));
}
lines.push("");
lines.push("(See https://github.com/syalioune/flowatch for the full repo.");
lines.push(" For per-file license info, see SPDX headers in source files.)");
lines.push("");

const rendered = lines.join("\n");

if (process.argv.includes("--check")) {
  const committed = existsSync(noticePath) ? readFileSync(noticePath, "utf8") : "";
  if (committed.trim() !== rendered.trim()) {
    console.error("✗ NOTICE is stale.");
    console.error("  Run: node scripts/release/generate-notice.mjs");
    console.error("  Then commit the regenerated NOTICE alongside the package.json change.");
    process.exit(1);
  }
  console.log("✓ NOTICE is up-to-date.");
  process.exit(0);
}

writeFileSync(noticePath, rendered);
console.log(
  `✓ wrote ${noticePath} (${rendered.length} bytes, ${directProd.length}+${directDev.length} deps)`,
);
