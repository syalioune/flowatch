// SPDX-License-Identifier: Apache-2.0
/**
 * Dashboard visual snapshot baselines across 18 look × theme × density combinations.
 *
 * 3 looks (editorial / terminal / industrial) × 2 themes (light / dark)
 * × 3 densities (compact / regular / comfy) = 18 baselines. One PNG per
 * combination is committed under e2e/visual/dashboard-themes.spec.ts-snapshots/
 * (Playwright auto-naming).
 *
 * Per NFR-23 (visual snapshot coverage of the design system).
 * Per Pattern P-007 (theming via <html data-look>/<html data-theme>/<html
 *   data-density> + CSS variables; see _bmad-output/planning-artifacts/
 *   architecture.md ~line 440 + CLAUDE.md "Pattern P-007").
 *
 * Sensitivity contract: maxDiffPixels: 100, threshold: 0. The spec's AC-7
 * originally specified zero-pixel-diff, but consecutive runs on the same
 * machine surfaced ~10-30 anti-aliasing jitter pixels even after waiting
 * for `document.fonts.ready` — the IBM Plex woff2 faces produce slightly
 * different subpixel rendering on each browser-startup cycle. Matching the
 * e2e/visual/api-inspector.spec.ts precedent (maxDiffPixels: 100) absorbs
 * the jitter without compromising the AC's intent: any real CSS-variable
 * regression produces hundreds-to-thousands of changed pixels (a colour
 * shift on a sidebar / topbar / KPI card affects far more than 100 px),
 * well clear of the 100-pixel tolerance. The drift-sensitivity verification
 * at AC-5 / T-7.3 confirms this — a single --bg edit on terminal/dark
 * fails the 3 terminal/dark snapshots (each diff is ~10K-50K pixels).
 *
 * Engine fetches are mocked at the page.route(...) layer with deterministic
 * KPI totals (7 / 2 / 3 / 5) — non-zero so tiles render the value (not the
 * skeleton or empty state), distinct so a token regression affecting one
 * tile is unambiguous in the diff.
 *
 * Viewport is 1440 × 900 — large enough to render the full Dashboard
 * layout (Sidebar + Topbar + 4 KPI tiles) without horizontal scroll;
 * smaller than 1920 × 1080 to keep PNG file sizes reasonable.
 */

import { expect, test } from "@playwright/test";

const LOOKS = ["editorial", "terminal", "industrial"] as const;
const THEMES = ["light", "dark"] as const;
const DENSITIES = ["compact", "regular", "comfy"] as const;

type Look = (typeof LOOKS)[number];
type Theme = (typeof THEMES)[number];
type Density = (typeof DENSITIES)[number];

// Deterministic mock totals — distinct non-zero integers so any regression
// affecting only one tile is unambiguous in the diff.
const MOCK_TOTALS = {
  instances: 7,
  jobs: 2,
  tasks: 3,
  deployments: 5,
};

function jsonPage(total: number) {
  return JSON.stringify({ data: [], total, start: 0, sort: "id", order: "asc", size: 0 });
}

test.skip(process.platform !== "linux", "visual snapshots are linux-baseline-only");

for (const look of LOOKS) {
  for (const theme of THEMES) {
    for (const density of DENSITIES) {
      test(`Dashboard — ${look} / ${theme} / ${density}`, async ({ page }) => {
        // 1. Mock the four Dashboard engine fetches BEFORE goto. The wildcard
        //    catch-all at the end covers any sidebar nav-count fetches
        //    (refreshNavCounts in src/app.tsx). Specific routes are matched
        //    in declaration order; the catch-all returns an empty
        //    zero-total payload that's safe for any list endpoint.
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
        // Catch-all for management/engine (probe), management/timer-jobs,
        // management/deadletter-jobs (nav-counts), and any other REST call
        // that fires at app boot. Returns a generic page-shape with total=0
        // (safe for both probe-success and list-endpoint consumers).
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
        // /repository/deployments is matched above; nothing else needed.
        // Tenant listing — derived from /repository/deployments in this app
        // (per src/api.ts listTenants implementation); the existing mock
        // covers it.

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto("/");

        // 2. Pin theming attributes deterministically (do NOT depend on
        //    TweaksPanel + localStorage). Also clear the inline --accent
        //    override that may have been set by TWEAK_DEFAULTS / a prior
        //    test's localStorage. Story 17.2 introduced localStorage
        //    persistence for tweaks; we want a clean per-test baseline.
        await page.evaluate(
          ({ look, theme, density }: { look: Look; theme: Theme; density: Density }) => {
            localStorage.removeItem("flowatch.tweaks.v1");
            document.documentElement.dataset.look = look;
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.density = density;
            document.documentElement.style.removeProperty("--accent");
          },
          { look, theme, density },
        );

        // 3. Disable transitions + keyframe animations + caret blink. The
        //    global playwright.config.ts already sets
        //    `toHaveScreenshot.animations: "disabled"` which covers
        //    transitions on the screenshot path; this belt-and-braces
        //    handles @keyframes and caret-color.
        await page.addStyleTag({
          content: `
            *, *::before, *::after {
              transition: none !important;
              animation: none !important;
              caret-color: transparent !important;
            }
          `,
        });

        // 4. Wait for the four KPI tiles to render their values (not
        //    skeletons). The Dashboard renders <span class="kpi-skeleton">
        //    while results=null; the mocked routes resolve immediately so
        //    the transition is fast, but the wait guards against the
        //    snapshot capturing a mid-flight skeleton.
        await expect(page.locator(".kpi")).toHaveCount(4);
        await expect(page.locator(".kpi-skeleton")).toHaveCount(0);

        // 5. Wait for all @font-face faces to finish loading. Without this,
        //    the snapshot can capture text rendered in the fallback system
        //    font on the first paint and the actual IBM Plex face on the
        //    second — producing flake on the kpi-val numerals (which use
        //    var(--font-display)).
        await page.evaluate(() => document.fonts.ready);

        // 6. Visual snapshot — small tolerance to absorb font-rendering
        //    subpixel jitter. See the file header for the AC-7 deviation
        //    rationale.
        //
        //    `.build-info` is masked because it renders `build {__BUILD_SHA__}`
        //    from `git rev-parse --short HEAD` baked in at vite dev-server
        //    start (vite.config.ts getBuildSha). The 7-char SHA moves on
        //    every commit and invalidates baselines whose only "regression"
        //    is the commit hash. The mask paints a solid colour over the
        //    region in BOTH the actual and the baseline, so the diff is
        //    always zero pixels there regardless of the underlying SHA.
        await expect(page).toHaveScreenshot({
          maxDiffPixels: 100,
          mask: [page.locator(".build-info")],
        });
      });
    }
  }
}
