/**
 * E2E — Full CRUD on identity groups via /identity?tab=groups + group detail
 * (Story 22.3).
 *
 * Pre-seeds + cleans up fresh test groups per test. Asserts Create / Edit /
 * Delete happy paths + Edit diff-empty guard + Delete cancel + ARIA on each
 * modal.
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

async function deleteGroupDirect(id: string): Promise<void> {
  await flowable(`/identity/groups/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function seedGroup(id: string, body: Record<string, string>): Promise<void> {
  await deleteGroupDirect(id);
  const res = await flowable("/identity/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...body }),
  });
  if (!res.ok) throw new Error(`Seed group failed: ${res.status} ${await res.text()}`);
}

test.describe("Group CRUD (Story 22.3)", () => {
  test("Create happy path — modal opens, submit creates, row appears", async ({ page }) => {
    const id = `e2e-gcr-${Date.now()}`;
    try {
      await page.goto("/identity?tab=groups");
      await page.getByTestId("create-group").click();
      await expect(page.getByTestId("create-group-modal")).toBeVisible();

      await page.getByTestId("create-group-id").fill(id);
      await page.getByTestId("create-group-name").fill("E2E Group");
      await page.getByTestId("create-group-type").fill("assignment");

      const postPromise = page.waitForResponse(
        (r) => r.url().endsWith("/identity/groups") && r.request().method() === "POST",
      );
      await page.getByTestId("create-group-submit").click();
      const postResp = await postPromise;
      expect([200, 201]).toContain(postResp.status());

      await expect(page.getByTestId("create-group-modal")).toBeHidden();
      await expect(page.getByTestId(`group-row-${id}`)).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteGroupDirect(id);
    }
  });

  test("Create required-id guard + duplicate error", async ({ page }) => {
    const id = `e2e-gdup-${Date.now()}`;
    await seedGroup(id, { name: "Existing" });
    try {
      await page.goto("/identity?tab=groups");
      await page.getByTestId("create-group").click();
      await expect(page.getByTestId("create-group-submit")).toBeDisabled();
      await page.getByTestId("create-group-id").fill(id);
      await expect(page.getByTestId("create-group-submit")).toBeEnabled();
      await page.getByTestId("create-group-submit").click();
      await expect(page.getByTestId("error-box")).toBeVisible();
      await page.getByTestId("create-group-cancel").click();
    } finally {
      await deleteGroupDirect(id);
    }
  });

  test("Edit happy path — Properties reflect new name after Save", async ({ page }) => {
    const id = `e2e-ged-${Date.now()}`;
    await seedGroup(id, { name: "Before", type: "assignment" });
    try {
      await page.goto(`/identity/groups/${id}`);
      await page.getByTestId("edit-group").click();
      await expect(page.getByTestId("edit-group-modal")).toBeVisible();
      const name = page.getByTestId("edit-group-name");
      await name.fill("After");

      const putPromise = page.waitForResponse(
        (r) => r.url().includes(`/identity/groups/${id}`) && r.request().method() === "PUT",
      );
      await page.getByTestId("edit-group-submit").click();
      expect((await putPromise).status()).toBe(200);

      await expect(page.getByTestId("edit-group-modal")).toBeHidden();
      await expect(page.getByRole("cell", { name: "After" })).toBeVisible();
    } finally {
      await deleteGroupDirect(id);
    }
  });

  test("Edit diff-empty guard — Save disabled with no changes", async ({ page }) => {
    const id = `e2e-gnoop-${Date.now()}`;
    await seedGroup(id, { name: "Same" });
    try {
      await page.goto(`/identity/groups/${id}`);
      await page.getByTestId("edit-group").click();
      await expect(page.getByTestId("edit-group-submit")).toBeDisabled();
      await page.getByTestId("edit-group-cancel").click();
    } finally {
      await deleteGroupDirect(id);
    }
  });

  test("Delete happy path — toast + navigate + row gone", async ({ page }) => {
    const id = `e2e-gdel-${Date.now()}`;
    await seedGroup(id, { name: "Doomed" });
    try {
      await page.goto(`/identity/groups/${id}`);
      await page.getByTestId("delete-group").click();
      await expect(page.getByTestId("delete-group-modal")).toBeVisible();

      const delPromise = page.waitForResponse(
        (r) => r.url().includes(`/identity/groups/${id}`) && r.request().method() === "DELETE",
      );
      await page.getByTestId("delete-group-submit").click();
      expect((await delPromise).status()).toBe(204);

      await page.waitForURL((u) => u.pathname === "/identity", { timeout: 10_000 });
      await expect(page.getByTestId(`group-row-${id}`)).toHaveCount(0);
    } finally {
      await deleteGroupDirect(id);
    }
  });

  test("Delete cancel — modal closes; page stays on detail", async ({ page }) => {
    const id = `e2e-gcanc-${Date.now()}`;
    await seedGroup(id, {});
    try {
      await page.goto(`/identity/groups/${id}`);
      await page.getByTestId("delete-group").click();
      await expect(page.getByTestId("delete-group-modal")).toBeVisible();
      await page.getByTestId("delete-group-cancel").click();
      await expect(page.getByTestId("delete-group-modal")).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/identity/groups/${id}$`));
    } finally {
      await deleteGroupDirect(id);
    }
  });

  test("ARIA — Create dialog + Edit dialog + Delete alertdialog", async ({ page }) => {
    const id = `e2e-garia-${Date.now()}`;
    await seedGroup(id, {});
    try {
      // Create dialog
      await page.goto("/identity?tab=groups");
      await page.getByTestId("create-group").click();
      const createDialog = page.getByRole("dialog", { name: "Create group" });
      await expect(createDialog).toBeVisible();
      await expect(createDialog).toHaveAttribute("aria-modal", "true");
      await page.getByTestId("create-group-cancel").click();

      // Edit dialog
      await page.goto(`/identity/groups/${id}`);
      await page.getByTestId("edit-group").click();
      const editDialog = page.getByRole("dialog", { name: "Edit group" });
      await expect(editDialog).toBeVisible();
      await page.getByTestId("edit-group-cancel").click();

      // Delete alertdialog
      await page.getByTestId("delete-group").click();
      const delDialog = page.getByRole("alertdialog", { name: "Delete group?" });
      await expect(delDialog).toBeVisible();
      await page.getByTestId("delete-group-cancel").click();
    } finally {
      await deleteGroupDirect(id);
    }
  });
});
