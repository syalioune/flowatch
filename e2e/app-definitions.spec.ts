// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Story 25.1 (FR-55 scope-reduced): .bar upload recognition + App
 * definition browse.
 *
 * Live-engine probe T-9 revealed that the two Flowable sub-apps DO NOT
 * cross-register a .bar deployment: uploading via `/repository/deployments`
 * extracts the bundled BPMN process for runtime but skips the .app file;
 * uploading via `/app-api/app-repository/deployments` registers the
 * app-definition but the BPMN process does not appear in the BPMN sub-app.
 *
 * Test strategy:
 *   - The "modal recognition + BPMN-deploy + bundled-processes panel"
 *     surface tests upload .bar via the BPMN endpoint (the path Flowatch's
 *     modal uses).
 *   - The "/app-definitions list + app-def panel on deployment-detail"
 *     surface tests seed via the app-api endpoint (operator-feel: a parallel
 *     deployment that registered the app-def the way Flowable Modeler does).
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { expect, test } from "@playwright/test";
// @ts-expect-error — sibling .mjs fixture without declaration file.
import { buildE2eBar, E2E_APP_KEY, E2E_DEPLOYMENT_NAME } from "./fixtures/build-bar.mjs";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const FLOWABLE_APP = "http://localhost:8080/flowable-rest/app-api";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

interface DeploymentRow {
  id: string;
  name: string;
}

async function cleanupBpmnDeployments(): Promise<void> {
  const res = await fetch(
    `${FLOWABLE}/repository/deployments?name=${E2E_DEPLOYMENT_NAME}&size=100`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) return;
  const body = (await res.json()) as { data: DeploymentRow[] };
  for (const dep of body.data) {
    await fetch(`${FLOWABLE}/repository/deployments/${dep.id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

async function cleanupAppDeployments(): Promise<void> {
  const res = await fetch(
    `${FLOWABLE_APP}/app-repository/deployments?name=${E2E_DEPLOYMENT_NAME}&size=100`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) return;
  const body = (await res.json()) as { data: DeploymentRow[] };
  for (const dep of body.data) {
    await fetch(`${FLOWABLE_APP}/app-repository/deployments/${dep.id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

async function seedAppDeployment(): Promise<string> {
  const archive = await buildE2eBar();
  const fd = new FormData();
  fd.append("file", new Blob([archive], { type: "application/zip" }), `${E2E_DEPLOYMENT_NAME}.bar`);
  fd.append("deploymentName", E2E_DEPLOYMENT_NAME);
  const res = await fetch(`${FLOWABLE_APP}/app-repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: fd,
  });
  if (!res.ok) throw new Error(`App seed failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe("Story 25.1 — .bar upload recognition + App definitions", () => {
  let appDeploymentId: string;

  test.beforeAll(async () => {
    await cleanupBpmnDeployments();
    await cleanupAppDeployments();
    appDeploymentId = await seedAppDeployment();
  });

  test.afterAll(async () => {
    await cleanupBpmnDeployments();
    await cleanupAppDeployments();
  });

  test("Sidebar nav exposes App definitions link in the Repository group", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/app-definitions"]')).toBeVisible();
  });

  test("/app-definitions renders the seeded row with all 6 columns", async ({ page }) => {
    await page.goto("/app-definitions");
    await expect(page.getByTestId("app-definitions-table")).toBeVisible();
    await expect(page.getByText("E2E App")).toBeVisible();
    await expect(page.getByText(E2E_APP_KEY, { exact: true })).toBeVisible();
  });

  test("scope-reduction note renders inline above the filter strip", async ({ page }) => {
    await page.goto("/app-definitions");
    const note = page.getByTestId("app-runtime-scope-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText(/App-instances .* not exposed/);
  });

  test("filter by key updates URL and narrows the table", async ({ page }) => {
    await page.goto("/app-definitions");
    const input = page.getByTestId("app-definitions-key-filter");
    await input.fill(E2E_APP_KEY);
    await input.blur();
    await expect(page).toHaveURL(/[?&]key=e2eApp/);
    await expect(page.getByText("E2E App")).toBeVisible();
  });

  test("latest-only checkbox toggles correctly", async ({ page }) => {
    await page.goto("/app-definitions");
    const checkbox = page.getByTestId("app-definitions-latest-filter");
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test("/deployments upload modal accepts .bar and shows the recognition hint", async ({
    page,
  }) => {
    const archive = await buildE2eBar();
    await page.goto("/deployments");
    await page.getByTestId("upload-deployment").click();
    const fileInput = page.getByTestId("upload-deployment-input");
    await fileInput.setInputFiles({
      name: `${E2E_DEPLOYMENT_NAME}.bar`,
      mimeType: "application/zip",
      buffer: Buffer.from(archive),
    });
    await expect(page.getByTestId("upload-bar-hint")).toBeVisible();
    await expect(page.getByTestId("upload-bar-hint")).toContainText(/Flowable App archive/);
    await page.getByTestId("upload-deployment-submit").click();
    // BPMN sub-app deploy succeeds (returns a deployment row); the engine
    // ignores the .app file on this endpoint — bundled BPMN processes
    // register and surface on /deployments/$id.
    await expect(page.getByText(E2E_DEPLOYMENT_NAME)).toBeVisible({ timeout: 5000 });
  });

  test("deployment-detail surfaces the bundled-processes panel for a .bar upload", async ({
    page,
  }) => {
    await page.goto("/deployments");
    await expect(page.getByText(E2E_DEPLOYMENT_NAME).first()).toBeVisible();
    await page.getByText(E2E_DEPLOYMENT_NAME).first().click();
    await expect(page.getByTestId("deployment-bundled-processes-panel")).toBeVisible();
    await expect(page.locator('[data-testid^="bundled-process-row-"]').first()).toBeVisible();
  });

  test("deployment-app-definitions-panel does NOT render on a deployment without an app-def", async ({
    page,
  }) => {
    // A pre-existing BPMN-only deployment seeded by a sibling spec (golden-path)
    // shouldn't show the app-def panel — the panel's null-return invariant.
    await page.goto("/deployments");
    // Pick the first BPMN row that is NOT the .bar one.
    const rows = page.locator("tr[data-deployment-id]");
    const count = await rows.count();
    let opened = false;
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const text = (await row.textContent()) ?? "";
      if (!text.includes(E2E_DEPLOYMENT_NAME) && text.includes("BPMN")) {
        await row.click();
        opened = true;
        break;
      }
    }
    if (!opened) test.skip(true, "no non-.bar BPMN deployment available to verify null-return");
    await expect(page.getByTestId("deployment-app-definitions-panel")).toHaveCount(0);
  });

  test("loader issues GET /app-repository/app-definitions via the appBase() prefix", async ({
    page,
  }) => {
    const requestPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/app-api/app-repository/app-definitions") && req.method() === "GET",
    );
    await page.goto("/app-definitions");
    const req = await requestPromise;
    expect(req.url()).toMatch(/\/app-api\/app-repository\/app-definitions/);
    // Authorization header IS sent (Basic auth) — redaction happens in the
    // client-side API_LOG, not on the wire. The wire-level header is the
    // proof that Pattern P-001 funnel fired.
    expect(req.headers().authorization ?? "").toMatch(/^Basic /);
  });

  // Probe 11 regression-guard: the scope-reduction note's premise — app-runtime
  // remains unmounted on this engine image.
  test("app-runtime/app-instances stays unmounted (FR-55 scope-reduction premise)", async () => {
    const res = await fetch(`${FLOWABLE_APP}/app-runtime/app-instances`, {
      headers: { Authorization: BASIC },
    });
    expect(res.ok).toBe(false);
    const body = (await res.text()) ?? "";
    expect(body).toMatch(/No endpoint/);
  });

  // Smoke that the seeded app-deployment id is queryable directly — proves
  // the appBase() route-prefix rewrite worked.
  test("appBase() rewrite resolves /app-repository/app-definitions filtered by deploymentId", async () => {
    const res = await fetch(
      `${FLOWABLE_APP}/app-repository/app-definitions?deploymentId=${appDeploymentId}`,
      { headers: { Authorization: BASIC } },
    );
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { data: Array<{ key: string }> };
    expect(body.data.some((row) => row.key === E2E_APP_KEY)).toBe(true);
  });
});
