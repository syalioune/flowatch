/**
 * Visual snapshot baseline for the API Inspector drawer.
 *
 * Configuration: editorial / light / regular (the Flowatch default per
 * src/app.tsx TWEAK_DEFAULTS) at 1280×800. Three seeded entries cover the
 * GET/POST/DELETE method-pill colors. PUT (warn) is intentionally omitted
 * from this baseline.
 *
 * Per NFR-23: a visual snapshot is the design-system regression gate.
 * Per P-007: theming is driven by <html data-*> attributes — the test sets
 * them explicitly so the snapshot is deterministic across hosts.
 *
 * Linux-only: snapshots include the OS suffix; macOS developers see a known
 * mismatch and should run `--update-snapshots` only from CI / Docker.
 *
 * Allow ±100 pixels — covers font hinting / sub-pixel anti-aliasing across
 * Linux hosts. If diff exceeds the budget, the change is intentional
 * (regenerate with --update-snapshots) or a regression (fix the bug).
 *
 * See: _bmad-output/planning-artifacts/architecture.md#p-007
 */

import { expect, test } from "@playwright/test";

interface SeedEntry {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  url: string;
  status: number;
  ms: number;
  at: string;
}

const SEED_ENTRIES: SeedEntry[] = [
  {
    id: "seed-1",
    method: "GET",
    path: "/repository/deployments?size=10",
    url: "http://localhost:8080/flowable-rest/service/repository/deployments?size=10",
    status: 200,
    ms: 42,
    at: "2026-05-15T12:34:56.000Z",
  },
  {
    id: "seed-2",
    method: "POST",
    path: "/repository/deployments",
    url: "http://localhost:8080/flowable-rest/service/repository/deployments",
    status: 201,
    ms: 128,
    at: "2026-05-15T12:34:57.000Z",
  },
  {
    id: "seed-3",
    method: "DELETE",
    path: "/repository/deployments/abc-123",
    url: "http://localhost:8080/flowable-rest/service/repository/deployments/abc-123",
    status: 204,
    ms: 31,
    at: "2026-05-15T12:34:58.000Z",
  },
];

test.skip(process.platform !== "linux", "visual snapshots are linux-baseline-only");

test("API Inspector — editorial / light / regular default", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  // 1. Pin theming attributes deterministically (don't rely on localStorage).
  await page.evaluate(() => {
    document.documentElement.dataset.look = "editorial";
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.density = "regular";
    document.documentElement.style.removeProperty("--accent");
  });

  // 2. Seed three API_LOG entries via the dev-only seed hook in src/api.ts.
  await page.waitForFunction(
    () =>
      typeof (window as Window & { __flowatchSeedApiLog?: unknown }).__flowatchSeedApiLog ===
      "function",
  );
  // Freeze the log BEFORE clearing: in-flight real API calls from the
  // Dashboard / nav-count mount effects that settle after this point are
  // silently dropped by logCall(), so they cannot pollute the seed set.
  await page.evaluate(() => {
    (window as unknown as { __flowatchPauseApiLog: () => void }).__flowatchPauseApiLog();
  });
  // Clear any entries that landed before the freeze, then seed the baseline.
  await page.evaluate(() => {
    (window as unknown as { __flowatchClearApiLog: () => void }).__flowatchClearApiLog();
  });
  await page.evaluate((entries) => {
    (window as unknown as { __flowatchSeedApiLog: (e: SeedEntry[]) => void }).__flowatchSeedApiLog(
      entries,
    );
  }, SEED_ENTRIES);

  // 3. Open the Inspector drawer (button has title="API inspector").
  await page.getByTitle("API inspector").click();

  // 4. Switch to the "Recent calls" tab so the seeded entries are visible.
  await page.locator(".tab").filter({ hasText: "Recent calls" }).click();

  // 5. Wait for the three entries to render and assert the method pill data-m
  //    attribute mapping (belt-and-suspenders alongside the visual diff).
  const entries = page.locator(".drawer .log-entry");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0).locator(".ep-method")).toHaveAttribute("data-m", "DELETE");
  await expect(entries.nth(1).locator(".ep-method")).toHaveAttribute("data-m", "POST");
  await expect(entries.nth(2).locator(".ep-method")).toHaveAttribute("data-m", "GET");

  // 6. Visual snapshot. Scoped to the drawer container.
  const drawer = page.locator(".drawer");
  await expect(drawer).toHaveScreenshot("api-inspector-editorial-light-regular.png", {
    maxDiffPixels: 100,
  });
});
