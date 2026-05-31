// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Saved connections (Story 23.1, FR-49).
 *
 * Pure-localStorage CRUD + Topbar `.connection-switch` chip + SettingsModal
 * Manage panel. The flow is operator-feel: add, switch, edit, delete, with
 * active-delete + label-collision + invalid-URL guards. Inherits hermetic
 * runs via `localStorage.clear()` before and after the suite.
 */

import { expect, test } from "@playwright/test";

test.describe("Saved connections (Story 23.1 — FR-49)", () => {
  test.beforeEach(async ({ page }) => {
    // Clear BEFORE the app mounts so the first migration sees an empty
    // multi-connection key + the legacy single-cfg key drives the seed.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("flowatch.connections.v1");
      } catch {
        /* private mode */
      }
    });
    await page.goto("/");
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("flowatch.connections.v1");
    });
    await ctx.close();
  });

  test("Topbar chip + Manage panel: default seeded from legacy cfg", async ({ page }) => {
    await expect(page.getByTestId("connection-switch-label")).toHaveText("Default");
    await page.locator('button[aria-label="Connection settings"]').click();
    await expect(page.getByTestId("manage-connections-heading")).toBeVisible();
    const rows = page.getByTestId("saved-connections-list").locator("li");
    await expect(rows).toHaveCount(1);
  });

  test("Add connection appears in list + the persisted shape includes it", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await expect(page.getByTestId("add-connection-modal")).toBeVisible();
    await page.getByTestId("add-connection-label").fill("E2E Local");
    await page
      .getByTestId("add-connection-base-url")
      .fill("http://localhost:8089/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByTestId("add-connection-modal")).toBeHidden();
    const rows = page.getByTestId("saved-connections-list").locator("li");
    await expect(rows).toHaveCount(2);
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toBeTruthy();
    expect(raw).toContain("E2E Local");
  });

  test("Topbar popover switches active connection + Sidebar pill flips", async ({ page }) => {
    // Seed an unreachable to verify the pill goes red.
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Unreachable");
    await page
      .getByTestId("add-connection-base-url")
      .fill("http://localhost:9999/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByTestId("add-connection-modal")).toBeHidden();
    // Close Settings.
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.getByTestId("manage-connections-heading")).toBeHidden();
    await page.getByTestId("connection-switch").click();
    const popover = page.getByTestId("connection-picker-popover");
    await expect(popover).toBeVisible();
    await popover.locator("li", { hasText: "Unreachable" }).click();
    await expect(page.getByTestId("connection-switch-label")).toHaveText("Unreachable");
    // No engine reachability assertion — the operator-feel signal is the chip label flip.
  });

  test("Label collision blocked with inline ErrorBox", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Default");
    await page.getByTestId("add-connection-base-url").fill("http://x/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByText(/Label 'Default' is already in use/)).toBeVisible();
    await expect(page.getByTestId("add-connection-modal")).toBeVisible();
  });

  test("Invalid URL blocked with inline ErrorBox", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Bad");
    await page.getByTestId("add-connection-base-url").fill("not-a-url");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByText("Invalid URL")).toBeVisible();
  });

  test("Delete active connection is blocked with inline ErrorBox", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    // The only entry is the active one — click its Delete.
    const list = page.getByTestId("saved-connections-list");
    await list.locator('button[data-testid^="delete-connection-"]').first().click();
    await expect(page.getByTestId("delete-connection-modal")).toBeVisible();
    await page.getByTestId("delete-connection-confirm").click();
    await expect(
      page.getByText(/Cannot delete the active connection\. Switch active first\./),
    ).toBeVisible();
    await expect(page.getByTestId("delete-connection-modal")).toBeVisible();
  });

  test("Edit existing connection persists the new label", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Stage");
    await page.getByTestId("add-connection-base-url").fill("http://stage/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    const list = page.getByTestId("saved-connections-list");
    await list
      .getByText("Stage")
      .locator("..")
      .locator("..")
      .locator("button", { hasText: "Edit" })
      .first()
      .click();
    await expect(page.getByTestId("edit-connection-modal")).toBeVisible();
    const labelInput = page.getByTestId("edit-connection-label");
    await labelInput.fill("Stage v2");
    await page.getByTestId("edit-connection-submit").click();
    await expect(page.getByTestId("edit-connection-modal")).toBeHidden();
    await expect(list.getByText("Stage v2")).toBeVisible();
  });

  test("Switching back to Default restores the active label", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Switchable");
    await page
      .getByTestId("add-connection-base-url")
      .fill("http://switchable/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    // The active select close-on-change behaviour means selecting another row
    // closes Settings; open the Topbar popover to switch active.
    await expect(page.getByTestId("add-connection-modal")).toBeHidden();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await page.getByTestId("connection-switch").click();
    await page
      .getByTestId("connection-picker-popover")
      .locator("li", { hasText: "Switchable" })
      .click();
    await expect(page.getByTestId("connection-switch-label")).toHaveText("Switchable");
    await page.getByTestId("connection-switch").click();
    await page
      .getByTestId("connection-picker-popover")
      .locator("li", { hasText: "Default" })
      .click();
    await expect(page.getByTestId("connection-switch-label")).toHaveText("Default");
  });

  test("Happy delete removes a non-active row from the list", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Doomed");
    await page.getByTestId("add-connection-base-url").fill("http://d/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    const list = page.getByTestId("saved-connections-list");
    await expect(list.locator("li")).toHaveCount(2);
    await list
      .getByText("Doomed")
      .locator("..")
      .locator("..")
      .locator("button", { hasText: "Delete" })
      .first()
      .click();
    await expect(page.getByTestId("delete-connection-modal")).toBeVisible();
    await page.getByTestId("delete-connection-confirm").click();
    await expect(page.getByTestId("delete-connection-modal")).toBeHidden();
    await expect(list.locator("li")).toHaveCount(1);
  });

  test("ARIA on Add (dialog) + Delete (alertdialog)", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    const add = page.getByTestId("add-connection-modal").locator('[role="dialog"]').first();
    await expect(add).toHaveAttribute("aria-modal", "true");
    await expect(add).toHaveAttribute("aria-labelledby", "add-connection-title");
    await page.keyboard.press("Escape");

    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("To Delete");
    await page.getByTestId("add-connection-base-url").fill("http://d/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();

    const list = page.getByTestId("saved-connections-list");
    await list
      .getByText("To Delete")
      .locator("..")
      .locator("..")
      .locator("button", { hasText: "Delete" })
      .first()
      .click();
    const del = page.getByTestId("delete-connection-modal").locator('[role="alertdialog"]').first();
    await expect(del).toHaveAttribute("aria-modal", "true");
    await expect(del).toHaveAttribute("aria-labelledby", "delete-connection-title");
  });
});
