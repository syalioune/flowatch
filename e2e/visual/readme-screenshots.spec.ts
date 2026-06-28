// SPDX-License-Identifier: Apache-2.0
/**
 * README per-look Dashboard screenshots (Story 33.1, DOC-DAA-001).
 *
 * This is NOT a snapshot-diff test. It WRITES three PNGs to
 * branding/screenshots/ via page.screenshot({ path }) — the committed assets
 * the README embeds (and a follow-up back-fills into landing/).
 *
 * Re-capture (one command):
 *   npm run e2e -- readme-screenshots
 *
 * Captured combos (epic-verbatim — AC-1), all at a fixed 1440×900 viewport:
 *   1. editorial / light / regular   → dashboard-editorial-light.png
 *   2. terminal  / dark  / compact   → dashboard-terminal-dark.png
 *   3. industrial/ dark  / regular   → dashboard-industrial-dark.png
 *
 * Mock-vs-live (AC-2): MOCKED. The four Dashboard engine fetches are
 * fulfilled at the page.route(...) layer with non-empty totals — reusing the
 * exact donor shape from e2e/visual/dashboard-themes.spec.ts — so no tile
 * shows an ErrorBox or "No records.". Mocking needs no running engine, is
 * host-independent, and produces identical tiles every run (deterministic
 * re-capture). The P-007 attribute-pinning (dataset.look/theme/density in a
 * page.evaluate AFTER goto) and reduced-motion discipline mirror the donor.
 *
 * Host-agnostic by design: the committed PNGs are produced once by the
 * maintainer, so unlike the visual-snapshot baselines this capture is NOT
 * gated to linux — any host that runs the e2e harness reproduces equivalent
 * assets.
 */

import { expect, test } from "@playwright/test";

// Deterministic non-zero mock totals so every tile renders a value (not a
// skeleton or empty state). Same donor shape as dashboard-themes.spec.ts.
const MOCK_TOTALS = {
  instances: 7,
  jobs: 2,
  tasks: 3,
  deployments: 5,
};

function jsonPage(total: number) {
  return JSON.stringify({ data: [], total, start: 0, sort: "id", order: "asc", size: 0 });
}

type Combo = {
  look: "editorial" | "terminal" | "industrial";
  theme: "light" | "dark";
  density: "compact" | "regular" | "comfy";
  file: string;
};

const COMBOS: Combo[] = [
  { look: "editorial", theme: "light", density: "regular", file: "dashboard-editorial-light.png" },
  { look: "terminal", theme: "dark", density: "compact", file: "dashboard-terminal-dark.png" },
  { look: "industrial", theme: "dark", density: "regular", file: "dashboard-industrial-dark.png" },
];

for (const combo of COMBOS) {
  test(`README screenshot — ${combo.look} / ${combo.theme} / ${combo.density}`, async ({
    page,
  }) => {
    // 1. Mock the four Dashboard fetches BEFORE goto, plus the boot probes /
    //    nav-count calls so nothing renders an error tile. Verbatim donor
    //    shape from e2e/visual/dashboard-themes.spec.ts.
    await page.route(
      "**/flowable-rest/service/runtime/process-instances**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(MOCK_TOTALS.instances),
        }),
    );
    await page.route(
      "**/flowable-rest/service/management/jobs**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(MOCK_TOTALS.jobs),
        }),
    );
    await page.route(
      "**/flowable-rest/service/runtime/tasks**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(MOCK_TOTALS.tasks),
        }),
    );
    await page.route(
      "**/flowable-rest/service/repository/deployments**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(MOCK_TOTALS.deployments),
        }),
    );
    await page.route("**/flowable-rest/service/management/engine**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "Flowable", version: "7.2.0" }),
      }),
    );
    await page.route(
      "**/flowable-rest/service/management/timer-jobs**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(0),
        }),
    );
    await page.route(
      "**/flowable-rest/service/management/deadletter-jobs**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(0),
        }),
    );

    // 2. Fixed 1440×900 viewport (AC-1 — do NOT inherit the donor's 1280×800).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // 3. Pin theming attributes deterministically (P-007) — never localStorage.
    await page.evaluate(
      ({ look, theme, density }: Pick<Combo, "look" | "theme" | "density">) => {
        localStorage.removeItem("flowatch.tweaks.v1");
        document.documentElement.dataset.look = look;
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.density = density;
        document.documentElement.style.removeProperty("--accent");
      },
      { look: combo.look, theme: combo.theme, density: combo.density },
    );

    // 4. Reduced-motion belt-and-braces (transitions, keyframes, caret) +
    //    hide the dev-only TanStack Router Devtools badge (it renders in
    //    import.meta.env.DEV via src/routes/__root.tsx and must not appear in
    //    a published README screenshot).
    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
          caret-color: transparent !important;
        }
        button[aria-label="Open TanStack Router Devtools"],
        button[aria-label*="TanStack Router Devtools"] {
          display: none !important;
        }
      `,
    });

    // 5. Wait for the four KPI tiles to render values (not skeletons) — this
    //    is the AC-2 guard: if the tiles never settle (e.g. an error tile),
    //    the expect times out and the capture HALTS rather than writing a
    //    screenshot of an ErrorBox.
    await expect(page.locator(".kpi")).toHaveCount(4);
    await expect(page.locator(".kpi-skeleton")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);

    // 6. Write the PNG. Relative path from the repo root (Playwright cwd) so
    //    the asset is reusable verbatim by the landing back-fill follow-up.
    await page.screenshot({ path: `branding/screenshots/${combo.file}` });
  });
}
