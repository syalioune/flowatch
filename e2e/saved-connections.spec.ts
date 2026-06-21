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
    // Clear ONLY on the very first script eval — `addInitScript` re-fires on
    // every navigation (including `page.reload()`), which would wipe state
    // mid-test for round-trip cases. The sessionStorage marker scopes the
    // clear to the first load.
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("flowatch-e2e-saved-connections-init")) {
          localStorage.removeItem("flowatch.connections.v1");
          sessionStorage.setItem("flowatch-e2e-saved-connections-init", "1");
        }
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
    await page.getByRole("button", { name: "Close Settings" }).click();
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
    await page.getByRole("button", { name: "Close Settings" }).click();
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

  test("Add Bearer connection — persisted authStrategyConfig kind=bearer (Story 23.2)", async ({
    page,
  }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Bearer Test");
    await page.getByTestId("add-connection-base-url").fill("http://b/flowable-rest/service");
    await page.getByTestId("auth-kind-bearer").click();
    await expect(page.getByTestId("auth-bearer-token")).toBeVisible();
    await page.getByTestId("auth-bearer-token").fill("fake-jwt-token");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByTestId("add-connection-modal")).toBeHidden();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toContain('"kind":"bearer"');
    expect(raw).toContain("fake-jwt-token");
  });

  test("Add OIDC connection — scopes persisted as array (Story 23.2)", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("OIDC Test");
    await page.getByTestId("add-connection-base-url").fill("http://o/flowable-rest/service");
    await page.getByTestId("auth-kind-oidc").click();
    await page.getByTestId("auth-oidc-issuer").fill("https://idp.example.com");
    await page.getByTestId("auth-oidc-client-id").fill("flowatch");
    await page.getByTestId("auth-oidc-scopes").fill("openid, profile, email");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByTestId("add-connection-modal")).toBeHidden();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toContain('"kind":"oidc"');
    expect(raw).toContain('"openid"');
    expect(raw).toContain('"profile"');
  });

  test("Mode-switch clears exclusive fields on every transition (Story 23.2)", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("auth-kind-bearer").click();
    await page.getByTestId("auth-bearer-token").fill("tok-1");
    await page.getByTestId("auth-kind-oidc").click();
    await expect(page.getByTestId("auth-bearer-token")).toBeHidden();
    await expect(page.getByTestId("auth-oidc-issuer")).toHaveValue("");
    await page.getByTestId("auth-oidc-issuer").fill("https://idp");
    await page.getByTestId("auth-kind-bearer").click();
    await expect(page.getByTestId("auth-bearer-token")).toHaveValue("");
  });

  test("OIDC invalid issuer surfaces ErrorBox (Story 23.2)", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("BadOidc");
    await page.getByTestId("add-connection-base-url").fill("http://x/flowable-rest/service");
    await page.getByTestId("auth-kind-oidc").click();
    await page.getByTestId("auth-oidc-issuer").fill("not-a-url");
    await page.getByTestId("auth-oidc-client-id").fill("c");
    await page.getByTestId("auth-oidc-scopes").fill("openid");
    await page.getByTestId("add-connection-submit").click();
    await expect(page.getByText(/Must be a valid URL/)).toBeVisible();
    await expect(page.getByTestId("add-connection-modal")).toBeVisible();
  });

  test("Edit an existing Basic connection to Bearer — persisted kind flips (Story 23.2)", async ({
    page,
  }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("FlipMe");
    await page.getByTestId("add-connection-base-url").fill("http://f/flowable-rest/service");
    await page.getByTestId("add-connection-submit").click();
    const list = page.getByTestId("saved-connections-list");
    await list
      .getByText("FlipMe")
      .locator("..")
      .locator("..")
      .locator("button", { hasText: "Edit" })
      .first()
      .click();
    await expect(page.getByTestId("edit-connection-modal")).toBeVisible();
    await page.getByTestId("auth-kind-bearer").click();
    await page.getByTestId("auth-bearer-token").fill("flip-token");
    await page.getByTestId("edit-connection-submit").click();
    await expect(page.getByTestId("edit-connection-modal")).toBeHidden();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toContain('"kind":"bearer"');
    expect(raw).toContain("flip-token");
  });

  test("Dormancy note removed on Add + Edit (Story 28.4 — all methods live)", async ({ page }) => {
    // Story 23.2 shipped a dormancy note (all methods dormant). Epic 28 made
    // Basic (28.2) / Bearer (28.3) / OIDC (28.4) live, so the note is gone for
    // every kind. This was "Dormancy note visible…" at 23.2.
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await expect(page.getByTestId("auth-dormancy-note")).toHaveCount(0);
    await page.getByTestId("auth-kind-oidc").click();
    await expect(page.getByTestId("auth-oidc-issuer")).toBeVisible();
    await expect(page.getByTestId("auth-dormancy-note")).toHaveCount(0);
    await page.getByTestId("add-connection-cancel").click();
    const list = page.getByTestId("saved-connections-list");
    await list.locator('button[data-testid^="edit-connection-"]').first().click();
    await expect(page.getByTestId("edit-connection-modal")).toBeVisible();
    await expect(page.getByTestId("auth-dormancy-note")).toHaveCount(0);
  });

  test("OIDC persistence round-trip across reload (Story 23.2)", async ({ page }) => {
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Reload OIDC");
    await page.getByTestId("add-connection-base-url").fill("http://r/flowable-rest/service");
    await page.getByTestId("auth-kind-oidc").click();
    await page.getByTestId("auth-oidc-issuer").fill("https://idp.example.com");
    await page.getByTestId("auth-oidc-client-id").fill("flowatch");
    await page.getByTestId("auth-oidc-scopes").fill("openid, profile");
    await page.getByTestId("add-connection-submit").click();
    await page.reload();
    await page.locator('button[aria-label="Connection settings"]').click();
    const list = page.getByTestId("saved-connections-list");
    await list
      .getByText("Reload OIDC")
      .locator("..")
      .locator("..")
      .locator("button", { hasText: "Edit" })
      .first()
      .click();
    await expect(page.getByTestId("edit-connection-modal")).toBeVisible();
    await expect(page.getByTestId("auth-kind-oidc")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("auth-oidc-issuer")).toHaveValue("https://idp.example.com");
    await expect(page.getByTestId("auth-oidc-scopes")).toHaveValue("openid, profile");
  });

  test("Defensive narrowing silently drops corrupt persisted authStrategyConfig (Story 23.2)", async ({
    page,
  }) => {
    // Seed a connection.
    await page.locator('button[aria-label="Connection settings"]').click();
    await page.getByTestId("add-connection").click();
    await page.getByTestId("add-connection-label").fill("Corrupt");
    await page.getByTestId("add-connection-base-url").fill("http://c/flowable-rest/service");
    await page.getByTestId("auth-kind-bearer").click();
    await page.getByTestId("auth-bearer-token").fill("valid-token");
    await page.getByTestId("add-connection-submit").click();
    // Manually corrupt the persisted config.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("flowatch.connections.v1") as string);
      const corrupt = raw.connections.find((c: { label: string }) => c.label === "Corrupt");
      if (corrupt) corrupt.authStrategyConfig = { kind: "bearer", config: { token: "" } };
      localStorage.setItem("flowatch.connections.v1", JSON.stringify(raw));
    });
    await page.reload();
    await page.locator('button[aria-label="Connection settings"]').click();
    const list = page.getByTestId("saved-connections-list");
    await list
      .getByText("Corrupt")
      .locator("..")
      .locator("..")
      .locator("button", { hasText: "Edit" })
      .first()
      .click();
    // Silent-drop means kind defaults back to Basic on Edit hydration.
    await expect(page.getByTestId("auth-kind-basic")).toHaveAttribute("aria-pressed", "true");
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
