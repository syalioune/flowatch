// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /definitions/$id Edit-category flow (Story 20.1).
 *
 * Uploads a fixture BPMN, drills into the detail page of the freshly-deployed
 * definition, opens the inline Edit-category modal, edits the value, saves,
 * and asserts the new category lands in both the detail Properties panel AND
 * the /definitions list Category column (the AC-8 "the new category appears
 * in the definition list (refresh)" guarantee).
 *
 * Per Pattern P-009: real engine; no mocks. Helpers inlined per spec T-1.9 —
 * there is no shared e2e/helpers/ directory today; the precedent
 * (definitions-suspend.spec.ts) inlines the same shape.
 *
 * Cleanup is BY DEFINITION KEY, not by deployment name — Flowable strips the
 * file extension when storing the deployment name (the upload of
 * test-upload.bpmn lands with name="test-upload"), so a name-filter cleanup
 * silently matches zero deployments and leaks state across runs. Querying
 * process-definitions?key=… then deleting each unique deploymentId is robust
 * against the engine's filename-handling quirk. See RC-16.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_KEY = "story-9-2-test-upload";

async function deleteAllFixtureDeployments() {
  const res = await fetch(
    `${FLOWABLE}/repository/process-definitions?key=${FIXTURE_KEY}&size=200`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) {
    console.warn(`Cleanup: failed to list fixture deployments (${res.status})`);
    return;
  }
  const body = (await res.json()) as { data: Array<{ deploymentId: string }> };
  const ids = [...new Set(body.data.map((d) => d.deploymentId))];
  for (const id of ids) {
    const delRes = await fetch(`${FLOWABLE}/repository/deployments/${id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
    if (!delRes.ok) {
      console.warn(`Cleanup: failed to delete deployment ${id} (${delRes.status})`);
    }
  }
}

async function uploadFixture(): Promise<{ definitionId: string }> {
  const xml = readFileSync(resolve("e2e/fixtures/test-upload.bpmn"));
  const form = new FormData();
  form.append("deployment", new Blob([xml], { type: "application/xml" }), "test-upload.bpmn");
  const res = await fetch(`${FLOWABLE}/repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) throw new Error(`Fixture deploy failed: ${res.status} ${await res.text()}`);
  const dep = (await res.json()) as { id: string };
  // Resolve the freshly-deployed definition id (deploymentId is unique per deploy).
  const defsRes = await fetch(`${FLOWABLE}/repository/process-definitions?deploymentId=${dep.id}`, {
    headers: { Authorization: BASIC },
  });
  const defs = (await defsRes.json()) as { data: Array<{ id: string }> };
  const definitionId = defs.data[0]?.id;
  if (!definitionId) throw new Error("could not resolve fresh definition id");
  return { definitionId };
}

test.describe("/definitions Edit category (Story 20.1)", () => {
  let definitionId: string;

  test.beforeAll(async () => {
    await deleteAllFixtureDeployments();
    ({ definitionId } = await uploadFixture());
  });
  test.afterAll(deleteAllFixtureDeployments);

  test("happy path: edit category from the detail page + verify on list (refresh)", async ({
    page,
  }) => {
    // Navigate DIRECTLY to the freshly-deployed definition.
    await page.goto(`/definitions/${definitionId}`);
    await page.getByTestId("edit-category-button").waitFor({ state: "visible", timeout: 15_000 });

    // Open the modal + type a new category.
    await page.getByTestId("edit-category-button").click();
    const modal = page.getByTestId("edit-category-modal");
    await expect(modal).toBeVisible();
    const input = page.getByTestId("edit-category-input");
    await input.fill("e2e-test-category");
    await page.getByTestId("edit-category-submit").click();

    // Modal closes on success.
    await expect(modal).toBeHidden();

    // Detail Properties panel reflects the new category. Scope the text match
    // to the Properties panel — the API Inspector drawer, toasts, or any
    // chrome that echoes the JSON body would otherwise satisfy a page-wide
    // getByText. The route loader uses api.getProcessDefinitionFresh (RC-16)
    // so the post-PUT value surfaces here despite the engine's single-GET
    // BPMN-cache quirk.
    const propertiesPanel = page.locator(".panel").filter({ hasText: "Properties" }).first();
    await expect(propertiesPanel.getByText("e2e-test-category", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Navigate back to /definitions and assert the Category column shows the
    // value. Pick THIS specific definition's row via the version-specific
    // data-definition-id attribute.
    await page.goto("/definitions");
    const updatedRow = page.locator(`tr[data-definition-id="${definitionId}"]`);
    await expect(updatedRow).toBeVisible({ timeout: 15_000 });
    await expect(updatedRow.locator("td", { hasText: /^e2e-test-category$/ })).toBeVisible();
  });

  test("empty-clear path: clearing the input reverts the Category to the mute em-dash", async ({
    page,
  }) => {
    // Seed a known category against THIS definition so we have something to clear.
    await fetch(`${FLOWABLE}/repository/process-definitions/${definitionId}`, {
      method: "PUT",
      headers: { Authorization: BASIC, "Content-Type": "application/json" },
      body: JSON.stringify({ category: "to-be-cleared" }),
    });

    await page.goto(`/definitions/${definitionId}`);
    await page.getByTestId("edit-category-button").click();
    const input = page.getByTestId("edit-category-input");
    await expect(input).toHaveValue("to-be-cleared");
    await input.fill("");
    await page.getByTestId("edit-category-submit").click();
    await expect(page.getByTestId("edit-category-modal")).toBeHidden();

    // Engine accepts {category: ""} and the row reflects the em-dash fallback.
    // Target the Category cell by column position: td[0]=Definition, td[1]=Key,
    // td[2]=Version, td[3]=Category, td[4]=Status, td[5]=Tenant, td[6]=actions.
    // (Tenant also renders `—` for un-tenanted definitions, so a plain text
    // filter would match both cells — column position disambiguates.)
    await page.goto("/definitions");
    const row = page.locator(`tr[data-definition-id="${definitionId}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    const categoryCell = row.locator("td").nth(3);
    await expect(categoryCell).toHaveText("—");
  });

  test("ARIA: modal carries role=dialog + aria-modal + aria-labelledby on day one", async ({
    page,
  }) => {
    await page.goto(`/definitions/${definitionId}`);
    await page.getByTestId("edit-category-button").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByTestId("edit-category-button").click();
    const dialog = page.getByRole("dialog", { name: "Edit category" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "edit-category-title");
  });
});
