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
      // Curated include set (the 2026-05-17 quality-gates tightening
      // raised the bar from "src/api.ts only" to "core logic tier").
      // Scope: files with real runtime logic worth covering — explicitly
      // excludes routing (`src/routes/**`, `src/app.tsx`, the generated
      // route tree), UI primitives in `src/components/`, big screens
      // pending a separate test push (`src/screens.tsx`, `modeler.tsx`,
      // `components.tsx`, `tweaks-panel.tsx`), bootstrap (`main.tsx`),
      // ambient/static data (`vite-env.d.ts`, `data.ts`,
      // `lib/window-events.ts`), and tests themselves.
      // Per-file thresholds with `perFile: true` so a single weakly-
      // covered file fails the gate; aggregate-only would let strong
      // files mask weak ones.
      include: ["src/api.ts", "src/lib/**/*.ts", "src/lib/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        "src/__tests__/**",
        "src/lib/**/__tests__/**",
        "src/lib/window-events.ts",
      ],
      thresholds: {
        perFile: true,
        lines: 60,
        branches: 60,
        // Keep the existing higher bar for the most-tested file —
        // dropping it to 60 would silently regress signal.
        "src/api.ts": {
          lines: 70,
          statements: 70,
          functions: 70,
        },
      },
    },
  },
});
