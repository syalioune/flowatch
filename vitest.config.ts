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
      //   src/components.tsx: 51/72/38/51 (ratcheted by Story 8.3 from 49/70/33/49
      //                                    when the (8.3) copy-as-curl browser-
      //                                    tier cases extended the drawer suite;
      //                                    8.2 had previously ratcheted from
      //                                    7/0/0/7 when ApiInspector.spec.tsx
      //                                    first exercised the drawer. Branch
      //                                    floor stays at 72 because the
      //                                    review-patch CopyAsCurlButton adds
      //                                    feature-detect + busy-state branches
      //                                    that aren't yet tested — kept above
      //                                    the 70 baseline 8.2 established.)
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
      // non-regression, not a race to 100%.
      //
      // ### Ratchet-down policy (Epic 8 retro A-2, 2026-05-24)
      //
      // The ratchet is monotonic-upward by default. A downward nudge is
      // allowed ONLY when ALL THREE conditions hold:
      //
      //   (a) The dropped coverage is from NEW code that isn't yet tested
      //       (not from regressing existing tests).
      //   (b) The gap is booked as a `deferred-work.md` entry with either a
      //       named follow-up story OR a "next story touching this file"
      //       tag, so the gap doesn't decay silently.
      //   (c) The downward nudge is ≤ 2 percentage points per metric.
      //
      // Larger nudges, multi-metric drops, or unexplained nudges BLOCK the
      // PR. The downward case must be called out explicitly in the story's
      // `## Completion Notes List` with the conditions evidenced — reviewers
      // gate on this comment, not on the diff alone. The ratchet's value as
      // a forcing function depends on it being a one-way ratchet by default.
      //
      // Precedent: Story 8.3 nudged `src/components.tsx` branches 73 → 72
      // for `CopyAsCurlButton`'s untested feature-detect + busy-state
      // branches (deferred-work entry filed, < 2pp drop, new code only).
      //
      // See story 6.5-1 for the baseline derivation.
      thresholds: {
        perFile: true,
        "src/lib/**": { lines: 60, branches: 60, functions: 60, statements: 60 },
        "src/api.ts": { lines: 96, branches: 92, statements: 96, functions: 93 },
        "src/components.tsx": { lines: 53, branches: 75, functions: 45, statements: 53 },
        "src/modeler.tsx": { lines: 0, branches: 0, functions: 0, statements: 0 },
        "src/screens.tsx": { lines: 1, branches: 0, functions: 0, statements: 1 },
      },
    },
  },
});
