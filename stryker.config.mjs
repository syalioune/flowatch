// SPDX-License-Identifier: Apache-2.0

/**
 * Stryker mutation testing config.
 *
 * Scope: src/api.ts only (the most-tested file at 96% lines / 91%
 * branches). Mutation testing on low-coverage files is a noisy
 * exercise — the score just reflects the line-coverage gap, not
 * test-suite quality. Concentrating on the file with strong line
 * coverage gives a meaningful first-run mutation score that tells
 * us whether those line numbers reflect real fault-detection or
 * just exercise.
 *
 * Policy: no threshold gating in this initial wiring. `make mutate`
 * and the .github/workflows/mutate.yml workflow compute the score
 * and surface the HTML report (artifact + step summary) but do not
 * fail the build on it. A threshold lands once we have a baseline
 * number to anchor on. See _bmad-output/planning-artifacts/
 * sprint-change-proposal-2026-05-17-quality-gates.md §4.4.
 *
 * To broaden scope later, add files to the `mutate` array — Stryker
 * is per-file independent so concurrency scales linearly.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  mutate: ["src/api.ts"],
  reporters: ["html", "clear-text", "progress"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  tempDirName: ".stryker-tmp",
  cleanTempDir: true,
  concurrency: 2,
  timeoutMS: 60000,
  // Static mutants are mutations to module-top-level code that runs once
  // at import time. Each one forces Stryker to re-import + re-execute the
  // whole module tree per test — Stryker reported 76 static mutants (14%
  // of total) consuming ~96% of runtime. Skipping them keeps the active
  // mutation score honest (it still mutates every function body / branch
  // / operator) while cutting wall time roughly 20x. See the runner
  // warning at https://stryker-mutator.io/docs/mutation-testing-elements/static-mutants/
  ignoreStatic: true,
  // Stryker copies the working tree into a sandbox per worker; we must
  // skip locally-only paths (symlinks, build output, prior reports) and
  // any artefacts gitignored at the repo level. Without these, `make
  // mutate` fails locally with EISDIR on the `_bmad` symlink and
  // bloats the sandbox in CI with `coverage/` + `dist/`.
  ignorePatterns: [
    "node_modules",
    ".git",
    "_bmad",
    "_bmad-output",
    "dist",
    "coverage",
    ".coverage-stash-for-codeql",
    ".codeql-db",
    "codeql.sarif",
    "reports",
    ".stryker-tmp",
    "_site",
    "test-results",
    "e2e/test-results",
    "e2e/playwright-report",
    "e2e/.playwright-cache",
    "**/__screenshots__",
  ],
  // No `thresholds` block — gate-less by design. Adding one would
  // make Stryker exit non-zero below the cut-off, which the CI
  // workflow is NOT yet set up to handle.
};
