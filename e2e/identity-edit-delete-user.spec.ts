/**
 * E2E — Edit + delete user from /identity/users/$id detail page (Story 22.2).
 *
 * Pre-seeds a fresh test user; the test surface exercises Edit happy path,
 * diff-empty guard, Delete happy path, Delete cancel, ARIA on both modals.
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

async function seedUser(id: string, body: Record<string, string>): Promise<void> {
  await flowable(`/identity/users/${encodeURIComponent(id)}`, { method: "DELETE" });
  const res = await flowable("/identity/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  });
  if (!res.ok) throw new Error(`Seed user failed: ${res.status} ${await res.text()}`);
}

async function deleteUserDirect(id: string): Promise<void> {
  await flowable(`/identity/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

test.describe("Edit + delete user (Story 22.2)", () => {
  test("Edit happy path — Properties reflect new values after Save", async ({ page }) => {
    const id = `e2e-edit-${Date.now()}`;
    await seedUser(id, { firstName: "Edith", lastName: "Smith", email: "e@x" });
    try {
      await page.goto(`/identity/users/${id}`);
      await expect(page.getByTestId("edit-user")).toBeVisible();
      await page.getByTestId("edit-user").click();
      await expect(page.getByTestId("edit-user-modal")).toBeVisible();

      const firstName = page.getByTestId("edit-user-first-name");
      await firstName.fill("Edytha");
      const email = page.getByTestId("edit-user-email");
      await email.fill("edytha@x");

      const putPromise = page.waitForResponse(
        (r) => r.url().includes(`/identity/users/${id}`) && r.request().method() === "PUT",
      );
      await page.getByTestId("edit-user-submit").click();
      const putResp = await putPromise;
      expect(putResp.status()).toBe(200);

      await expect(page.getByTestId("edit-user-modal")).toBeHidden();
      await expect(page.getByRole("cell", { name: "Edytha", exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: "edytha@x" })).toBeVisible();
    } finally {
      await deleteUserDirect(id);
    }
  });

  test("Edit diff-empty guard — Save disabled with no changes", async ({ page }) => {
    const id = `e2e-noop-${Date.now()}`;
    await seedUser(id, { firstName: "Norma", lastName: "Op" });
    try {
      await page.goto(`/identity/users/${id}`);
      await page.getByTestId("edit-user").click();
      await expect(page.getByTestId("edit-user-modal")).toBeVisible();
      await expect(page.getByTestId("edit-user-submit")).toBeDisabled();
      await page.getByTestId("edit-user-cancel").click();
    } finally {
      await deleteUserDirect(id);
    }
  });

  test("Delete happy path — toast + navigate + row gone", async ({ page }) => {
    const id = `e2e-del-${Date.now()}`;
    await seedUser(id, { firstName: "Doomed" });
    try {
      await page.goto(`/identity/users/${id}`);
      await page.getByTestId("delete-user").click();
      await expect(page.getByTestId("delete-user-modal")).toBeVisible();

      const delPromise = page.waitForResponse(
        (r) => r.url().includes(`/identity/users/${id}`) && r.request().method() === "DELETE",
      );
      await page.getByTestId("delete-user-submit").click();
      const delResp = await delPromise;
      expect(delResp.status()).toBe(204);

      await page.waitForURL((u) => u.pathname === "/identity", { timeout: 10_000 });
      await expect(page.getByTestId(`user-row-${id}`)).toHaveCount(0);
    } finally {
      // Cleanup in case the test failed before delete.
      await deleteUserDirect(id);
    }
  });

  test("Delete cancel — modal closes; page stays on detail", async ({ page }) => {
    const id = `e2e-cancel-${Date.now()}`;
    await seedUser(id, { firstName: "Stayer" });
    try {
      await page.goto(`/identity/users/${id}`);
      await page.getByTestId("delete-user").click();
      await expect(page.getByTestId("delete-user-modal")).toBeVisible();
      await page.getByTestId("delete-user-cancel").click();
      await expect(page.getByTestId("delete-user-modal")).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/identity/users/${id}$`));
    } finally {
      await deleteUserDirect(id);
    }
  });

  test("ARIA — Edit dialog + Delete alertdialog", async ({ page }) => {
    const id = `e2e-aria-${Date.now()}`;
    await seedUser(id, {});
    try {
      await page.goto(`/identity/users/${id}`);
      await page.getByTestId("edit-user").click();
      const editDialog = page.getByRole("dialog", { name: "Edit user" });
      await expect(editDialog).toBeVisible();
      await expect(editDialog).toHaveAttribute("aria-modal", "true");
      await expect(editDialog).toHaveAttribute("aria-labelledby", "edit-user-title");
      await page.getByTestId("edit-user-cancel").click();

      await page.getByTestId("delete-user").click();
      const delDialog = page.getByRole("alertdialog", { name: "Delete user?" });
      await expect(delDialog).toBeVisible();
      await expect(delDialog).toHaveAttribute("aria-modal", "true");
      await expect(delDialog).toHaveAttribute("aria-labelledby", "delete-user-title");
      await page.getByTestId("delete-user-cancel").click();
    } finally {
      await deleteUserDirect(id);
    }
  });
});
