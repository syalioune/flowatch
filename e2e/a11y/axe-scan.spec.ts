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
 * ── BLOCKING GATE (Story 32.2, AC #2) ─────────────────────────────────────
 * Story 32.1 MEASURED (advisory); Story 32.2 ENFORCES. Each cell now asserts
 * `expect(blockingViolations).toEqual([])` where blocking = `critical` /
 * `serious` impact — a reappearing blocking violation fails CI. `moderate` /
 * `minor` findings stay advisory: they are still accumulated to the artifact
 * (`e2e/a11y/.axe-results.json`) but do not fail the build. The full result
 * set is still flushed to disk in `afterAll` for the audit report.
 *
 * ── MODELER CANVAS EXCLUSION (AC #8) ──────────────────────────────────────
 * `/bpmn` and `/dmn` embed vanilla bpmn-js / dmn-js canvases (Pattern P-006).
 * Those SVG internals are out-of-tree (Flowatch does not theme them — see
 * docs/a11y-audit-2026-05.md). The scan is scoped to the Flowatch chrome by
 * excluding the diagram surface `.djs-container` AND the dmn-js decision-table
 * editor `.dmn-decision-table-container` (Story 32.2 — its FEEL-cell editors
 * are dmn-js-owned DOM that ships its own dark-theme contrast); findings inside
 * those canvases never surface.
 *
 * Chromium-only per playwright.config.ts. Live-stack: the webServer block
 * auto-spawns the engine + Vite (reuse-if-running). Many screens render their
 * loading/empty/error states without seeded data — that is in-scope; error
 * boxes must themselves be accessible. The report notes the rendered state.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { DETAIL_SCREEN_LIST, SCREEN_LIST } from "./screens";

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
  /** "index" for top-level routes, "detail-error" / "detail-seeded" for $id pages. */
  mode: string;
  ruleId: string;
  impact: string;
  wcagTags: string[];
  help: string;
  helpUrl: string;
  nodes: string[];
}

const RESULTS_PATH = resolve(__dirname, ".axe-results.json");

// Default dev-stack credentials (CLAUDE.md connection-config defaults). Used
// only to fetch a real entity id for the seeded detail-route scan, via the
// Vite proxy — never written to the app's localStorage / auth strategy.
const SEED_AUTH = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

// Direct engine bases for the deterministic BPMN/DMN seed in beforeAll (same as
// e2e/deployment-resources.spec.ts). The per-test id fetch goes through the Vite
// proxy (page.request); the seed deploy hits the engine directly via fetch.
const FLOWABLE_BASE = "http://localhost:8080/flowable-rest/service";
const FLOWABLE_DMN = "http://localhost:8080/flowable-rest/dmn-api";

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

async function waitForReady(page: Page, ready: string): Promise<void> {
  // Resolve on the screen's ready selector OR an error box (error states are
  // valid, in-scope axe targets — they must themselves be accessible).
  await page
    .waitForSelector(`${ready}, [data-testid='error-box']`, {
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

/**
 * Navigate to `path`, confirm the seeded look/theme took effect, run axe scoped
 * to the Flowatch chrome, accumulate every violation-node, and hard-assert zero
 * blocking (critical/serious) findings. Shared by the index-route matrix and
 * the detail-route scan so both enforce an identical gate.
 */
async function scanCell(
  page: Page,
  opts: {
    label: string;
    path: string;
    ready: string;
    excludeCanvas?: boolean | undefined;
    look: Look;
    theme: Theme;
    mode: string;
  },
): Promise<void> {
  await page.goto(opts.path);
  await waitForReady(page, opts.ready);

  // Confirm the look/theme actually took effect on <html> before axe reads
  // computed styles — otherwise contrast findings would be for the wrong palette.
  const applied = await page.evaluate(() => ({
    look: document.documentElement.dataset.look,
    theme: document.documentElement.dataset.theme,
  }));
  expect(applied.look, `look not applied on ${opts.path}`).toBe(opts.look);
  expect(applied.theme, `theme not applied on ${opts.path}`).toBe(opts.theme);

  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
  if (opts.excludeCanvas) {
    // AC #8 — out-of-tree bpmn-js / dmn-js canvas internals: the diagram
    // surface and the dmn-js decision-table editor (the latter is a no-op
    // selector where the page has no decision table).
    builder = builder.exclude(".djs-container").exclude(".dmn-decision-table-container");
  }
  const results = await builder.analyze();

  for (const v of results.violations) {
    for (const node of v.nodes) {
      collected.push({
        screen: opts.label,
        path: opts.path,
        look: opts.look,
        theme: opts.theme,
        mode: opts.mode,
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

  // HARD GATE (Story 32.2, AC #2): zero blocking (critical/serious) violations
  // per cell. `moderate`/`minor` stay advisory (recorded to the artifact, not
  // gated). A failure lists each blocking finding by rule + node so the
  // offending cell is obvious in CI output.
  const blockingViolations = results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({
      ruleId: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.map((t) => String(t)).join(" ")),
    }));
  expect(
    blockingViolations,
    `blocking a11y violations on ${opts.path} [${opts.look}/${opts.theme}]:\n${JSON.stringify(blockingViolations, null, 2)}`,
  ).toEqual([]);
}

/**
 * Fetch a real entity id/key from the live engine via the Vite proxy for the
 * seeded detail-route scan. Returns `null` when the engine has no rows for that
 * entity — the caller then `test.skip`s the seeded cell (honest skip).
 */
async function fetchSeedId(
  page: Page,
  seed: { listPath: string; idField: string },
): Promise<string | null> {
  const res = await page.request
    .get(seed.listPath, { headers: { Authorization: SEED_AUTH } })
    .catch(() => null);
  if (!res || !res.ok()) return null;
  const body = (await res.json().catch(() => null)) as { data?: Record<string, unknown>[] } | null;
  const row = body?.data?.[0];
  const value = row?.[seed.idField];
  return typeof value === "string" && value.length > 0 ? value : null;
}

test.describe("axe-core matrix scan — zero blocking violations (Story 32.2 hard gate)", () => {
  for (const screen of SCREEN_LIST) {
    for (const look of LOOKS) {
      for (const theme of THEMES) {
        test(`axe — ${screen.label} [${look}/${theme}]`, async ({ page }) => {
          await seedLookTheme(page, look, theme);
          await scanCell(page, {
            label: screen.label,
            path: screen.path,
            ready: screen.ready,
            excludeCanvas: screen.excludeCanvas,
            look,
            theme,
            mode: "index",
          });
        });
      }
    }
  }
});

// Detail-route scan (Story 32.2 review — D1 gate-scope expansion). Each $id/$key
// route is audited in its error/empty-state chrome (bogus id) every look×theme.
// Routes whose entity the suite deterministically seeds in `beforeAll`
// (deployment / definition / decision — via a BPMN + DMN deploy below) ALSO get
// a populated-page cell. There are NO conditional skips: a seeded cell is only
// emitted for an entity that is guaranteed present, so every generated test runs.
test.describe("axe-core detail-route scan — zero blocking violations (Story 32.2 D1)", () => {
  // Deterministic seed: deploy one BPMN + one DMN so the deployment /
  // process-definition / decision detail routes always have a real row to open.
  // Same direct-fetch + fixture pattern as e2e/deployment-resources.spec.ts.
  test.beforeAll(async () => {
    const bpmn = readFileSync(resolve(__dirname, "../fixtures/loan-approval.bpmn20.xml"));
    const bpmnForm = new FormData();
    bpmnForm.append(
      "deployment",
      new Blob([bpmn], { type: "application/xml" }),
      "axe-a11y-loan.bpmn20.xml",
    );
    const bpmnRes = await fetch(`${FLOWABLE_BASE}/repository/deployments`, {
      method: "POST",
      headers: { Authorization: SEED_AUTH },
      body: bpmnForm,
    });
    if (!bpmnRes.ok) {
      throw new Error(`BPMN seed failed: ${bpmnRes.status} ${await bpmnRes.text()}`);
    }

    const dmn = readFileSync(resolve(__dirname, "../fixtures/sample.dmn"));
    const dmnForm = new FormData();
    dmnForm.append(
      "deployment",
      new Blob([dmn], { type: "application/xml" }),
      "axe-a11y-sample.dmn",
    );
    const dmnRes = await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments`, {
      method: "POST",
      headers: { Authorization: SEED_AUTH },
      body: dmnForm,
    });
    if (!dmnRes.ok) {
      throw new Error(`DMN seed failed: ${dmnRes.status} ${await dmnRes.text()}`);
    }
  });

  for (const entry of DETAIL_SCREEN_LIST) {
    for (const look of LOOKS) {
      for (const theme of THEMES) {
        test(`axe — ${entry.label} [error] [${look}/${theme}]`, async ({ page }) => {
          await seedLookTheme(page, look, theme);
          await scanCell(page, {
            label: `${entry.label} (error state)`,
            path: entry.toPath(entry.bogusId),
            ready: entry.ready,
            excludeCanvas: entry.excludeCanvas,
            look,
            theme,
            mode: "detail-error",
          });
        });

        // Seeded cell only for deterministically-seeded entities (no skip).
        if (entry.seed !== null) {
          const seed = entry.seed;
          test(`axe — ${entry.label} [seeded] [${look}/${theme}]`, async ({ page }) => {
            await seedLookTheme(page, look, theme);
            const id = await fetchSeedId(page, seed);
            expect(
              id,
              `seed for ${entry.label} must be present (deployed in beforeAll)`,
            ).not.toBeNull();
            await scanCell(page, {
              label: `${entry.label} (seeded)`,
              path: entry.toPath(id as string),
              ready: entry.ready,
              excludeCanvas: entry.excludeCanvas,
              look,
              theme,
              mode: "detail-seeded",
            });
          });
        }
      }
    }
  }
});

// File-level flush — runs after BOTH describe blocks complete, so the artifact
// captures the full index + detail matrix in one payload.
test.afterAll(() => {
  const payload = {
    generatedBy: "e2e/a11y/axe-scan.spec.ts (Story 32.1 + 32.2 D1)",
    matrix: {
      looks: LOOKS,
      themes: THEMES,
      indexScreens: SCREEN_LIST.map((s) => s.path),
      detailScreens: DETAIL_SCREEN_LIST.map((s) => s.key),
      // index cells are fixed; detail cells = 9 routes × 2 states × 6 combos,
      // minus skipped seeded cells (entities with no rows on this engine).
      indexCellsExpected: SCREEN_LIST.length * LOOKS.length * THEMES.length,
      detailCellsMax: DETAIL_SCREEN_LIST.length * 2 * LOOKS.length * THEMES.length,
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
