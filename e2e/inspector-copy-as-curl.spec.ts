// SPDX-License-Identifier: Apache-2.0

/**
 * E2E: Copy as curl writes a reproducible command to the real clipboard.
 *
 * Uses Playwright's clipboard-read/clipboard-write permissions on the
 * Chromium context so we exercise the real navigator.clipboard.writeText
 * path (no mocks). The seed-via-dev-hook path keeps the test deterministic
 * without depending on a specific engine call landing in the log.
 *
 * Story 8.3 / FR-9 / Epic 7 retro §6 item 4 — the clipboard intentionally
 * contains the real username:password from api.config().
 */

import { expect, test } from "@playwright/test";

test.describe("ApiInspector — Copy as curl (Story 8.3)", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("writes a real curl command to the clipboard and confirms with a toast", async ({
    page,
  }) => {
    await page.goto("/");

    // Seed a deterministic log entry via the DEV-only hook so the test
    // doesn't depend on whichever fetch the dashboard happened to fire.
    await page.waitForFunction(() =>
      Boolean((window as { __flowatchSeedApiLog?: unknown }).__flowatchSeedApiLog),
    );
    await page.evaluate(() => {
      const w = window as unknown as {
        __flowatchSeedApiLog?: (entries: unknown[]) => void;
      };
      w.__flowatchSeedApiLog?.([
        {
          id: "test-curl",
          method: "GET",
          path: "/repository/deployments",
          url: "http://localhost:8080/flowable-rest/service/repository/deployments",
          status: 200,
          ms: 12,
          at: new Date().toISOString(),
        },
      ]);
    });

    // Open the Inspector via the Topbar's icon button (title="API inspector").
    await page.locator('button[title="API inspector"]').click();
    await page.locator(".tab", { hasText: "Recent calls" }).click();
    await page.locator('[data-entry-id="test-curl"]').click();

    // Click Copy as curl.
    await page.locator('[data-testid="copy-as-curl"]').click();

    // Read the real clipboard and verify the curl shape.
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain("curl -u 'rest-admin:test'");
    expect(clipboard).toContain(
      "'http://localhost:8080/flowable-rest/service/repository/deployments'",
    );

    // The toast confirms the action.
    await expect(page.locator(".toast").filter({ hasText: "Copied curl command" })).toBeVisible();
  });
});
