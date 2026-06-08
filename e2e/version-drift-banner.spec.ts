// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — version-drift advisory banner (Story 31.1, NFR-7).
 *
 * COMPAT REALITY (docs/compat.md): the default `make stack` engine reports the
 * tested version `7.2.0`, which EQUALS `__FLOWABLE_TESTED_VERSION__`, so the
 * golden path is silent (AC #5) and the drift banner NEVER fires live. The
 * drift path is therefore fixture-verified by injecting a drifting version via
 * `page.route` on `/management/engine` — mirroring the form-js compat-boundary
 * precedent in e2e/task-form-js-render.spec.ts. This is BY DESIGN, not dead
 * code: do not mistake the fixture for a workaround.
 */

import { expect, test } from "@playwright/test";

const ENGINE_ROUTE = "**/flowable-rest/service/management/engine**";
const DRIFT_BODY = JSON.stringify({ name: "Flowable", version: "7.99.0" });
const DRIFT_COPY =
  "Flowatch is tested against Flowable 7.2.0. Detected: 7.99.0 — some features may differ. See docs/compat.md.";

test.describe("version-drift banner (Story 31.1)", () => {
  test("drift shows the banner; dismissal persists across reload", async ({ page }) => {
    await page.route(ENGINE_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: DRIFT_BODY }),
    );

    await page.goto("/");

    const banner = page.getByTestId("version-drift-banner");
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toHaveText(new RegExp(DRIFT_COPY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    await page.getByTestId("version-banner-dismiss").click();
    await expect(banner).toHaveCount(0);

    // Reload with the same intercepted (drifting) version — dismissal is
    // persisted per-version in localStorage, so it stays gone (AC #2/#3).
    await page.reload();
    await expect(page.getByTestId("version-drift-banner")).toHaveCount(0);
  });

  test("golden path: the live engine (7.2.0) renders NO banner (AC #5)", async ({ page }) => {
    // No interception — the live `make stack` engine reports the tested 7.2.0.
    await page.goto("/");
    // Give the mount probe time to resolve; the connection pill flips to "ok".
    await expect(page.locator(".conn-dot[data-state='ok']")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("version-drift-banner")).toHaveCount(0);
  });
});
