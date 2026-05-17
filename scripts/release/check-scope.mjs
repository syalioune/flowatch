#!/usr/bin/env node

// Validates that a Conventional Commits `scope` is mapped to a theme
// in release.config.mjs (or covered by the subject heuristics). Use
// it whenever a plan / commit / PR introduces a new scope so the
// release notes don't silently fall into the "🧰 Other" catch-all.
//
// Usage:
//   node scripts/release/check-scope.mjs <scope> [subject]
//
//   $ node scripts/release/check-scope.mjs modeler
//   ✓ scope `modeler` → 🎨 Modelers (BPMN & DMN)
//
//   $ node scripts/release/check-scope.mjs gizmo
//   ✗ scope `gizmo` is not mapped to any theme.
//     The matching commit will fall under 🧰 Other (or whatever
//     fallback theme is configured) on the next release. Edit
//     release.config.mjs and add `gizmo` to the most appropriate
//     theme's `scopes` array, or define a new theme if no existing
//     one fits.
//   exit code 1
//
//   $ node scripts/release/check-scope.mjs ci "wire PIT mutation testing"
//   ✓ scope `ci` (subject hits Quality Gates heuristic) → 🛡️ Quality Gates
//
// Designed to be invoked from /implement, dev-backend, dev-frontend,
// pre-push hooks, or directly by contributors. Exits 0 on a mapped
// scope, 1 on an unmapped one.

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");

const [, , scopeArg, ...subjectParts] = process.argv;

if (!scopeArg) {
  console.error(`Usage: node scripts/release/check-scope.mjs <scope> [subject]

Examples:
  node scripts/release/check-scope.mjs modeler
  node scripts/release/check-scope.mjs ci "wire mutation testing"
  node scripts/release/check-scope.mjs gizmo "introduce a brand-new area"
`);
  process.exit(2);
}

const scope = scopeArg.trim().toLowerCase();
const subject = subjectParts.join(" ").trim();

// Load release.config.mjs and the project's `themeFor` resolver via
// dynamic import. Keep tooling and logic in one place.
const cfgUrl = pathToFileURL(resolve(repoRoot, "release.config.mjs")).href;
let cfg;
try {
  cfg = await import(cfgUrl);
} catch (err) {
  console.error(`✗ Could not load release.config.mjs: ${err.message}`);
  process.exit(2);
}

const rng = cfg.default.plugins.find(
  (p) => Array.isArray(p) && p[0] === "@semantic-release/release-notes-generator",
);
if (!rng || typeof rng[1]?.writerOpts?.transform !== "function") {
  console.error("✗ release.config.mjs is missing release-notes-generator or its transform.");
  process.exit(2);
}

// Re-implement the resolution path mirroring the config's themeFor
// rather than re-exporting it. We deliberately mirror because
// release.config.mjs runs side effects (gh issue list, git) at load
// time that we want to keep contained — and because the THEMES
// array isn't an export.
//
// Fish the THEMES array out of the file via a minimal regex parser.
// Robust enough for the current shape; falls back gracefully on
// parse failure.
import { readFileSync } from "node:fs";

const cfgText = readFileSync(resolve(repoRoot, "release.config.mjs"), "utf8");

function extractThemes() {
  // Locate the THEMES array literal, then pair each `name: '…'` line
  // with the next `scopes: […]` block. Tolerates `// comment` lines
  // and arbitrary whitespace between the two — the v1 regex required
  // them adjacent, which broke for any theme entry with a leading
  // comment (DevEx, Foundation, Dependencies, Other).
  const block = cfgText.match(/const\s+THEMES\s*=\s*\[([\s\S]*?)\n\];/m);
  if (!block) return null;
  const body = block[1];

  const nameRe = /\bname:\s*'([^']+)'/g;
  const scopesRe = /\bscopes:\s*\[([\s\S]*?)\]/g;

  const names = [];
  let m;
  while ((m = nameRe.exec(body))) {
    names.push({ name: m[1], at: m.index });
  }
  const scopeBlocks = [];
  while ((m = scopesRe.exec(body))) {
    scopeBlocks.push({ scopes: m[1], at: m.index });
  }

  // Pair each name with the first scopes block that follows it. The
  // `fallback: true` entries have an empty `[]` and still pair.
  const entries = [];
  for (const n of names) {
    const sb = scopeBlocks.find((s) => s.at > n.at);
    if (!sb) continue;
    const scopes = sb.scopes
      .split(",")
      .map((s) => s.replace(/\/\/[^\n]*/g, "")) // strip line comments
      .map((s) => s.replace(/['\s]/g, ""))
      .filter(Boolean);
    entries.push({ name: n.name, scopes });
  }
  return entries;
}

const themes = extractThemes();
if (!themes) {
  console.error("✗ Could not extract THEMES from release.config.mjs (regex parse failed).");
  process.exit(2);
}

const fallback = themes.find((t) => t.scopes.length === 0)?.name ?? "🧰 Other";

const scopeToTheme = new Map();
for (const t of themes) {
  for (const s of t.scopes) {
    scopeToTheme.set(s.toLowerCase(), t.name);
  }
}

// Mirror the QUALITY_GATES_CI_RE + SUBJECT_HEURISTICS regexes from
// release.config.mjs so the script's verdict matches what the
// release will emit.
const QUALITY_GATES_CI_RE =
  /\b(mutation|stryker|pit|pitest|playwright|e2e|axe|coverage|jacoco|codeql|sast|trivy)\b/i;
const SUBJECT_HEURISTICS = [
  {
    theme: "🌍 Help, i18n & Docs",
    re: /\b(README|DEVELOPERS|CLAUDE|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|user[- ]manual|documentation|docs?\b|README\.md|onboarding|i18n|l10n|translat)/i,
  },
  {
    theme: "📊 Observability & Performance",
    re: /\b(grafana|prometheus|alertmanager|otel|opentelemetry|observability|metric|trace|tracing|log|logging|slo|burn[- ]rate)\b/i,
  },
  {
    theme: "🛡️ Quality Gates",
    re: /\b(playwright|axe|stryker|pit|pitest|mutation|coverage|jacoco|e2e|spectral|codeql|sast|trivy)\b/i,
  },
];

function resolve_(scope, subject) {
  if (scope === "ci" && QUALITY_GATES_CI_RE.test(subject)) {
    return { theme: "🛡️ Quality Gates", via: "subject (ci → Quality Gates heuristic)" };
  }
  if (scope) {
    const direct = scopeToTheme.get(scope);
    if (direct) return { theme: direct, via: `scope mapping (\`${scope}\`)` };
  }
  if (subject) {
    for (const h of SUBJECT_HEURISTICS) {
      if (h.re.test(subject)) {
        return { theme: h.theme, via: "subject heuristic" };
      }
    }
  }
  return null;
}

const verdict = resolve_(scope, subject);
if (!verdict) {
  console.error(`✗ scope \`${scope}\` is not mapped to any theme.

  ${subject ? `Subject:    ${subject}\n  ` : ""}Will fall under: ${fallback} on the next release.

  Fix: edit release.config.mjs and either
    1. add \`${scope}\` to the most appropriate theme's \`scopes\` array, or
    2. define a new theme entry if no existing one fits.

  Themes currently defined:
${themes.map((t) => `    • ${t.name}${t.scopes.length ? "  — " + t.scopes.slice(0, 5).join(", ") + (t.scopes.length > 5 ? ", …" : "") : "  (catch-all)"}`).join("\n")}
`);
  process.exit(1);
}

console.log(`✓ scope \`${scope}\` → ${verdict.theme}  [via ${verdict.via}]`);
process.exit(0);
