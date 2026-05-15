/**
 * Search-param round-tripping E2E (Story 3.4).
 *
 * Verifies:
 *  - /jobs?type=deadletter restores the Dead-letter tab.
 *  - /tasks?assignee=me restores the Mine filter.
 *  - Clicking the Timers tab updates the URL.
 */

import { expect, test } from "@playwright/test";

test("jobs ?type=deadletter restores Dead-letter tab", async ({ page }) => {
  await page.goto("/jobs?type=deadletter");
  const tab = page.locator(".seg-btn").filter({ hasText: "Dead-letter" });
  await expect(tab).toHaveAttribute("data-on", "1");
});

test("tasks ?assignee=me restores Mine filter", async ({ page }) => {
  await page.goto("/tasks?assignee=me");
  const tab = page.locator(".seg-btn").filter({ hasText: "Mine" });
  await expect(tab).toHaveAttribute("data-on", "1");
});

test("clicking Timers tab updates the URL", async ({ page }) => {
  await page.goto("/jobs");
  await page.locator(".seg-btn").filter({ hasText: "Timers" }).click();
  await expect(page).toHaveURL(/[?&]type=timer/);
});
