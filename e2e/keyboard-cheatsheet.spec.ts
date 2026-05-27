// SPDX-License-Identifier: Apache-2.0
/**
 * Story 18.4 — keyboard cheatsheet modal + `?` shortcut + `g`-prefix nav chord.
 *
 * Per UX §11 (cheatsheet as keyboard-shortcut discovery surface) + NFR-15
 * (keyboard-first persona) + Pattern P-008 (shortcuts-exhaustiveness guard).
 */

import { expect, test } from "@playwright/test";

test.describe("Story 18.4 — cheatsheet modal", () => {
  test("? opens the cheatsheet modal", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByTestId("cheatsheet-modal")).toBeHidden();
    // Make sure body has focus (not the search input).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("cheatsheet-modal")).toBeVisible();
    const dialog = page.locator('[role="dialog"]', { hasText: "Keyboard shortcuts" }).first();
    await expect(dialog).toBeVisible();
    const labelledby = await dialog.getAttribute("aria-labelledby");
    expect(labelledby).toBe("cheatsheet-title");
  });

  test("Escape closes the cheatsheet", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("cheatsheet-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cheatsheet-modal")).toBeHidden();
  });

  test("? while focused in an input does NOT open the cheatsheet", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("cheatsheet-modal")).toBeHidden();
    const search = page.locator(".topbar .search input");
    await search.focus();
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("cheatsheet-modal")).toBeHidden();
  });

  test("cheatsheet renders all registry sections", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Shift+/");
    await expect(page.getByTestId("cheatsheet-section-navigation")).toBeVisible();
    await expect(page.getByTestId("cheatsheet-section-tweaks")).toBeVisible();
    await expect(page.getByTestId("cheatsheet-section-modals")).toBeVisible();
    // Spot-check a load-bearing entry.
    await expect(page.getByTestId("cheatsheet-row-Open keyboard shortcuts")).toBeVisible();
    await expect(page.getByTestId("cheatsheet-row-Toggle theme tweaks panel")).toBeVisible();
  });
});

test.describe("Story 18.4 — g-prefix nav chord", () => {
  test("g d navigates to Dashboard", async ({ page }) => {
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("g");
    await page.keyboard.press("d");
    await expect(page).toHaveURL(/\/$/);
  });

  test("g i navigates to Instances", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("g");
    await page.keyboard.press("i");
    await page.waitForURL(/\/instances(\?|$)/, { timeout: 5000 });
  });

  test("g t navigates to Tasks", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("g");
    await page.keyboard.press("t");
    // TanStack Router may append the route's default search params (e.g.
    // ?assignee=all on /tasks); match the pathname prefix only.
    await page.waitForURL(/\/tasks(\?|$)/, { timeout: 5000 });
  });

  test("g d while focused in input does NOT navigate", async ({ page }) => {
    await page.goto("/deployments");
    await page.waitForLoadState("networkidle").catch(() => {});
    const search = page.locator(".topbar .search input");
    await search.focus();
    await page.keyboard.press("g");
    await page.keyboard.press("d");
    await page.waitForTimeout(200);
    // URL should still be /deployments — the chord was suppressed.
    await expect(page).toHaveURL(/\/deployments$/);
  });
});
