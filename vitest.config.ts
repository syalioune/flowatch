import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", "dist", "build", "e2e/**", ".husky/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      // Curated include set (the 2026-05-19 widening to add the three
      // large unmigrated screens). Scope: files with real runtime logic
      // worth covering — explicitly excludes routing (`src/routes/**`,
      // `src/app.tsx`, the generated route tree), UI primitives in
      // `src/components/`, the remaining large file pending a separate
      // test push (`tweaks-panel.tsx`), bootstrap (`main.tsx`),
      // ambient/static data (`vite-env.d.ts`, `data.ts`,
      // `lib/window-events.ts`), and tests themselves.
      // Per-file thresholds with `perFile: true` so a single weakly-
      // covered file fails the gate; aggregate-only would let strong
      // files mask weak ones.
      include: [
        "src/api.ts",
        "src/lib/**/*.ts",
        "src/lib/**/*.tsx",
        "src/screens.tsx",
        "src/modeler.tsx",
        "src/components.tsx",
      ],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        "src/__tests__/**",
        "src/lib/**/__tests__/**",
        "src/lib/window-events.ts",
      ],
      // ## Coverage thresholds
      //
      // `perFile: true` means a single file dropping below its floor fails CI.
      // Aggregate-only thresholds would let strong files (api.ts at 96%) mask
      // weak files (screens.tsx at 1.68%); we want per-file signal.
      //
      // Vitest 3.x semantics: glob-keyed thresholds are additive to global
      // ones (a file must satisfy BOTH). To set a true per-file floor we
      // skip the global lines/branches keys and express every floor as a
      // glob entry. See `node_modules/vitest/dist/chunks/coverage.*.js`
      // `resolveThresholds` — "Global threshold is for all files, even if
      // they are included by glob patterns".
      //
      // Floors:
      //   src/lib/**:         60/60/60/60 — core tier baseline (was global)
      //   src/api.ts:         96/92/96/93 (lines/branches/statements/functions) — raised by Story 7.1 (loadCfg + saveCfg coverage)
      //   src/screens.tsx:    1/0/0/1     (calibrated floor as of 2026-05-19)
      //   src/modeler.tsx:    0/0/0/0     (calibrated floor as of 2026-05-19)
      //   src/components.tsx: 49/70/33/49 (ratcheted by Story 8.2 from 7/0/0/7
      //                                    when the new ApiInspector.spec.tsx
      //                                    browser-tier suite exercised the
      //                                    drawer for the first time)
      //
      // ### Ratchet schedule (Milestone 0.0.2)
      //
      // Mid-milestone-0.0.2 (after epics 7-12 land): each big file ≥ 30%
      // End-milestone-0.0.2 (after epics 13-18 land): each big file ≥ 60%
      //
      // Each Milestone-0.0.2 story that touches one of these files SHOULD
      // raise the relevant per-file floor in this config in the same commit,
      // by the amount the new tests earn (re-measure: `npx vitest run
      // --coverage`). Don't outrun the schedule — the goal is monotonic
      // non-regression, not a race to 100%. Floors are NEVER lowered; a
      // story that needs to drop one must also delete tests and call that
      // out explicitly for reviewer.
      //
      // See story 6.5-1 for the baseline derivation.
      thresholds: {
        perFile: true,
        "src/lib/**": { lines: 60, branches: 60, functions: 60, statements: 60 },
        "src/api.ts": { lines: 96, branches: 92, statements: 96, functions: 93 },
        "src/components.tsx": { lines: 49, branches: 70, functions: 33, statements: 49 },
        "src/modeler.tsx": { lines: 0, branches: 0, functions: 0, statements: 0 },
        "src/screens.tsx": { lines: 1, branches: 0, functions: 0, statements: 1 },
      },
    },
  },
});
