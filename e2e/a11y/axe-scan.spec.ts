// SPDX-License-Identifier: Apache-2.0
/**
 * Story 32.1 — automated axe-core accessibility matrix scan.
 *
 * Per NFR-15 (keyboard), NFR-16 (WCAG AA contrast across every look × theme),
 * NFR-17 (form-control labels + aria-*). This spec owns the AUTOMATED
 * RULE-ENGINE dimension of the a11y suite (contrast, ARIA validity, accessible
 * names, roles, duplicate ids, …). It COMPLEMENTS — does not duplicate —
 * keyboard.spec.ts (NFR-15 hand-authored Tab traversal) and aria.spec.ts
 * (NFR-17 hand-authored landmark/label checks). All three share the canonical
 * route registry in `./screens` (Task 2).
 *
 * Matrix = every top-level route × 3 looks (editorial/terminal/industrial)
 * × 2 themes (light/dark) = 6 look×theme combos. (The epic title's "8 combos /
 * 11 screens" are stale planning-era numbers — the real matrix is derived from
 * src/styles/tokens.css and src/routes/. See the Story 32.1 spec preamble.)
 *
 * The look/theme is seeded BEFORE first paint via `page.addInitScript`, writing
 * BOTH the `flowatch.tweaks.v1` localStorage key (Pattern P-007, owned by
 * `useTweaks` in src/tweaks-panel.tsx) AND the `<html data-look/data-theme>`
 * attributes directly — belt-and-braces so axe's contrast rules evaluate
 * against the actually-rendered tokens regardless of mount timing.
 *
 * ── GATE DEFERRAL (AC #9, placeholder-then-real) ──────────────────────────
 * This story MEASURES; it does NOT enforce. The per-cell violation assertion
 * here is ADVISORY: each test asserts only that the scan RAN for its cell
 * (matrix completeness). Existing violations are accumulated and written to a
 * machine-readable artifact (`e2e/a11y/.axe-results.json`) which Task 4
 * consumes to author `docs/a11y-audit-1.0.0.md`. Story 32.2 is the story that
 * flips the blocking findings to a hard `expect(violations).toEqual([])` gate.
 *
 * ── MODELER CANVAS EXCLUSION (AC #8) ──────────────────────────────────────
 * `/bpmn` and `/dmn` embed vanilla bpmn-js / dmn-js canvases (Pattern P-006).
 * Those SVG internals are out-of-tree (Flowatch does not theme them — see
 * docs/a11y-audit-2026-05.md). The scan is scoped to the Flowatch chrome by
 * excluding `.djs-container`; findings inside the canvas never surface.
 *
 * Chromium-only per playwright.config.ts. Live-stack: the webServer block
 * auto-spawns the engine + Vite (reuse-if-running). Many screens render their
 * loading/empty/error states without seeded data — that is in-scope; error
 * boxes must themselves be accessible. The report notes the rendered state.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { SCREEN_LIST, type ScreenEntry } from "./screens";

const LOOKS = ["editorial", "terminal", "industrial"] as const;
const THEMES = ["light", "dark"] as const;

type Look = (typeof LOOKS)[number];
type Theme = (typeof THEMES)[number];

/** One axe violation, tagged with the matrix cell it was found in. */
interface CellViolation {
  screen: string;
  path: string;
  look: Look;
  theme: Theme;
  ruleId: string;
  impact: string;
  wcagTags: string[];
  help: string;
  helpUrl: string;
  nodes: string[];
}

const RESULTS_PATH = resolve(__dirname, ".axe-results.json");

// Module-scoped accumulator. playwright.config.ts runs the a11y suite with
// `workers: 1` + `fullyParallel: false`, so every cell test in this file
// executes sequentially in one worker process and shares this array; the
// `test.afterAll` hook below flushes it to disk for Task 4.
const collected: CellViolation[] = [];
let cellsScanned = 0;

/**
 * Seed Pattern P-007 look/theme before first paint. Writes the persisted
 * tweaks key (merged over any existing value) AND the live data-attributes.
 */
async function seedLookTheme(page: Page, look: Look, theme: Theme): Promise<void> {
  await page.addInitScript(
    ({ look, theme }) => {
      try {
        const raw = window.localStorage.getItem("flowatch.tweaks.v1");
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        window.localStorage.setItem(
          "flowatch.tweaks.v1",
          JSON.stringify({ ...parsed, look, theme }),
        );
      } catch {
        // private mode / quota — the data-attributes below still apply.
      }
      document.documentElement.dataset.look = look;
      document.documentElement.dataset.theme = theme;
    },
    { look, theme },
  );
}

async function waitForScreen(page: Page, screen: ScreenEntry): Promise<void> {
  // Resolve on the screen's ready selector OR an error box (error states are
  // valid, in-scope axe targets — they must themselves be accessible).
  await page
    .waitForSelector(`${screen.ready}, [data-testid='error-box']`, {
      state: "attached",
      timeout: 15_000,
    })
    .catch(() => {
      // Don't abort the scan if the readiness selector never appears — axe
      // still audits whatever rendered, and the empty result is itself a
      // (recorded) data point. The completeness assertion below covers it.
    });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
}

test.describe("Story 32.1 — axe-core matrix scan (advisory; gate lands in 32.2)", () => {
  for (const screen of SCREEN_LIST) {
    for (const look of LOOKS) {
      for (const theme of THEMES) {
        test(`axe — ${screen.label} [${look}/${theme}]`, async ({ page }) => {
          await seedLookTheme(page, look, theme);
          await page.goto(screen.path);
          await waitForScreen(page, screen);

          // Confirm the look/theme actually took effect on <html> before axe
          // reads computed styles — otherwise contrast findings would be for
          // the wrong palette.
          const applied = await page.evaluate(() => ({
            look: document.documentElement.dataset.look,
            theme: document.documentElement.dataset.theme,
          }));
          expect(applied.look, `look not applied on ${screen.path}`).toBe(look);
          expect(applied.theme, `theme not applied on ${screen.path}`).toBe(theme);

          let builder = new AxeBuilder({ page }).withTags([
            "wcag2a",
            "wcag2aa",
            "wcag21a",
            "wcag21aa",
          ]);
          if (screen.excludeCanvas) {
            // AC #8 — out-of-tree bpmn-js / dmn-js canvas internals.
            builder = builder.exclude(".djs-container");
          }
          const results = await builder.analyze();

          for (const v of results.violations) {
            for (const node of v.nodes) {
              collected.push({
                screen: screen.label,
                path: screen.path,
                look,
                theme,
                ruleId: v.id,
                impact: v.impact ?? "unknown",
                wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
                help: v.help,
                helpUrl: v.helpUrl,
                nodes: node.target.map((t) => String(t)),
              });
            }
          }

          cellsScanned += 1;

          // ADVISORY (AC #9): assert only that the scan RAN for this cell —
          // NOT that violations are empty. 32.2 flips this to a hard gate.
          expect(
            Array.isArray(results.violations),
            `axe did not return a violations array for ${screen.path} [${look}/${theme}]`,
          ).toBe(true);
        });
      }
    }
  }

  test.afterAll(() => {
    const payload = {
      generatedBy: "e2e/a11y/axe-scan.spec.ts (Story 32.1)",
      matrix: {
        looks: LOOKS,
        themes: THEMES,
        screens: SCREEN_LIST.map((s) => s.path),
        cellsExpected: SCREEN_LIST.length * LOOKS.length * THEMES.length,
        cellsScanned,
      },
      violations: collected,
    };
    mkdirSync(dirname(RESULTS_PATH), { recursive: true });
    writeFileSync(RESULTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    // eslint-disable-next-line no-console
    console.log(
      `[axe-scan] ${collected.length} violation-nodes across ${cellsScanned} cells → ${RESULTS_PATH}`,
    );
  });
});
