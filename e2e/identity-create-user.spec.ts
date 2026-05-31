/**
 * E2E — Create user via /identity?tab=users header affordance (Story 22.1).
 *
 * Per Pattern P-009: real engine; no mocks. Each test creates a fresh user id
 * (Date.now()-suffixed) so concurrent runs don't collide. afterAll cleans up
 * via direct DELETE — Story 22.2 ships api.deleteUser; until then, the test
 * harness fires the DELETE itself.
 */

import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function flowable(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${FLOWABLE}${path}`, {
    ...init,
    headers: { Authorization: BASIC, ...(init?.headers ?? {}) },
  });
}

const createdUserIds: string[] = [];

test.describe("Create user (Story 22.1)", () => {
  test.afterAll(async () => {
    for (const id of createdUserIds) {
      await flowable(`/identity/users/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    createdUserIds.length = 0;
  });

  test("happy path — modal opens, submit creates user, row appears", async ({ page }) => {
    const id = `e2e-create-${Date.now()}`;
    createdUserIds.push(id);

    await page.goto("/identity?tab=users");
    await page.getByTestId("create-user").click();
    await expect(page.getByTestId("create-user-modal")).toBeVisible();

    await page.getByTestId("create-user-id").fill(id);
    await page.getByTestId("create-user-first-name").fill("E2E");
    await page.getByTestId("create-user-last-name").fill("User");
    await page.getByTestId("create-user-email").fill(`${id}@example.test`);
    await page.getByTestId("create-user-password").fill("s3cret");

    const postPromise = page.waitForResponse(
      (r) => r.url().endsWith("/identity/users") && r.request().method() === "POST",
    );
    await page.getByTestId("create-user-submit").click();
    const postResp = await postPromise;
    expect([200, 201]).toContain(postResp.status());

    await expect(page.getByTestId("create-user-modal")).toBeHidden();
    await expect(page.getByTestId(`user-row-${id}`)).toBeVisible({ timeout: 10_000 });
  });

  test("Save button disabled when ID empty; enables when ID has content", async ({ page }) => {
    await page.goto("/identity?tab=users");
    await page.getByTestId("create-user").click();
    await expect(page.getByTestId("create-user-modal")).toBeVisible();
    await expect(page.getByTestId("create-user-submit")).toBeDisabled();
    await page.getByTestId("create-user-id").fill("nonempty");
    await expect(page.getByTestId("create-user-submit")).toBeEnabled();
    await page.getByTestId("create-user-cancel").click();
  });

  test("duplicate-id failure renders ErrorBox + preserves form values", async ({ page }) => {
    const id = `e2e-dup-${Date.now()}`;
    // Pre-create via direct API.
    const seed = await flowable("/identity/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    expect([200, 201]).toContain(seed.status);
    createdUserIds.push(id);

    await page.goto("/identity?tab=users");
    await page.getByTestId("create-user").click();
    await page.getByTestId("create-user-id").fill(id);
    await page.getByTestId("create-user-first-name").fill("Dup");
    await page.getByTestId("create-user-submit").click();

    // Modal stays open + ErrorBox appears + form values preserved.
    await expect(page.getByTestId("create-user-modal")).toBeVisible();
    await expect(page.getByTestId("error-box")).toBeVisible();
    await expect(page.getByTestId("create-user-id")).toHaveValue(id);
    await expect(page.getByTestId("create-user-first-name")).toHaveValue("Dup");
    await page.getByTestId("create-user-cancel").click();
  });

  test("ARIA contract — dialog + aria-modal + aria-labelledby", async ({ page }) => {
    await page.goto("/identity?tab=users");
    await page.getByTestId("create-user").click();
    const dialog = page.getByRole("dialog", { name: "Create user" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "create-user-title");
    await page.getByTestId("create-user-cancel").click();
  });
});
