// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Settings → Authentication tab (Story 28.2, FR-4).
 *
 * Operator picks Basic / Bearer / OIDC in the Settings Authentication tab; Save
 * writes `authStrategyConfig` onto the active connection AND installs the
 * matching AuthStrategy. Basic is live end-to-end; Bearer/OIDC persist + show
 * a dormancy note (activation lands in Story 28.3 / 28.4).
 *
 * Hermetic: clears the saved-connections key on first load only (the init
 * marker scopes the clear so reloads don't wipe mid-test state).
 */

import { expect, test } from "@playwright/test";

const openSettings = 'button[aria-label="Connection settings"]';

test.describe("Settings → Authentication tab (Story 28.2 — FR-4)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("flowatch-e2e-auth-tab-init")) {
          localStorage.removeItem("flowatch.connections.v1");
          sessionStorage.setItem("flowatch-e2e-auth-tab-init", "1");
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
    await page.evaluate(() => localStorage.removeItem("flowatch.connections.v1"));
    await ctx.close();
  });

  test("Authentication tab visible with the active connection label", async ({ page }) => {
    await page.locator(openSettings).click();
    await page.getByTestId("settings-tab-authentication").click();
    await expect(page.getByTestId("auth-tab-active-label")).toContainText("Authentication for:");
    // Default seeded connection is "Default".
    await expect(page.getByTestId("auth-tab-active-label")).toContainText("Default");
  });

  test("switch to Bearer reveals token textarea (no dormancy); Save persists bearer", async ({
    page,
  }) => {
    await page.locator(openSettings).click();
    await page.getByTestId("settings-tab-authentication").click();
    await page.getByTestId("auth-kind-bearer").click();
    await expect(page.getByTestId("auth-bearer-token")).toBeVisible();
    // Story 28.3: Bearer is live — dormancy note is OIDC-only.
    await expect(page.getByTestId("auth-dormancy-note")).toHaveCount(0);
    await page.getByTestId("auth-bearer-token").fill("tok-abc");
    await page.getByTestId("auth-tab-save").click();
    await expect(page.locator(".toast", { hasText: "Authentication updated" })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toContain('"kind":"bearer"');
  });

  test("switch to OIDC + valid config; Save persists oidc shape", async ({ page }) => {
    await page.locator(openSettings).click();
    await page.getByTestId("settings-tab-authentication").click();
    await page.getByTestId("auth-kind-oidc").click();
    await page.getByTestId("auth-oidc-issuer").fill("https://idp.example.test");
    await page.getByTestId("auth-oidc-client-id").fill("flowatch");
    await page.getByTestId("auth-oidc-scopes").fill("openid, profile, offline_access");
    await page.getByTestId("auth-tab-save").click();
    await expect(page.locator(".toast", { hasText: "Authentication updated" })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toContain('"kind":"oidc"');
    expect(raw).toContain("https://idp.example.test");
  });

  test("OIDC with an invalid issuer renders an in-tab ErrorBox (nothing persisted)", async ({
    page,
  }) => {
    await page.locator(openSettings).click();
    await page.getByTestId("settings-tab-authentication").click();
    await page.getByTestId("auth-kind-oidc").click();
    await page.getByTestId("auth-oidc-issuer").fill("not-a-url");
    await page.getByTestId("auth-oidc-client-id").fill("flowatch");
    await page.getByTestId("auth-oidc-scopes").fill("openid");
    await page.getByTestId("auth-tab-save").click();
    await expect(page.getByTestId("auth-tab-error")).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    // Still basic — the invalid OIDC config never persisted.
    expect(raw).not.toContain('"kind":"oidc"');
  });

  test("OPEN_SETTINGS_AUTH opens Settings directly on the Authentication tab (Story 28.3)", async ({
    page,
  }) => {
    // Simulates BearerAuthStrategy.onUnauthorized firing on a 401. The app
    // listener must open Settings AND select the Authentication tab.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("settings:open-auth")));
    await expect(page.getByTestId("settings-tab-authentication")).toHaveAttribute(
      "data-active",
      "1",
    );
    await expect(page.getByTestId("auth-tab-save")).toBeVisible();
  });

  test("switch back to Basic + Save keeps the engine reachable (live Basic)", async ({ page }) => {
    await page.locator(openSettings).click();
    await page.getByTestId("settings-tab-authentication").click();
    // Move off Basic then back so the diff-empty guard releases Save.
    await page.getByTestId("auth-kind-bearer").click();
    await page.getByTestId("auth-kind-basic").click();
    await page.getByTestId("auth-tab-username").fill("rest-admin");
    await page.getByTestId("auth-tab-password").fill("test");
    await page.getByTestId("auth-tab-save").click();
    await expect(page.locator(".toast", { hasText: "Authentication updated" })).toBeVisible();
    const raw = await page.evaluate(() => localStorage.getItem("flowatch.connections.v1"));
    expect(raw).toContain('"kind":"basic"');
  });
});
