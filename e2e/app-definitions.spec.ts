// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Story 25.1 (FR-55 scope-reduced): .bar upload recognition + App
 * definition browse.
 *
 * The modal's submit fans the same .bar out to THREE deploy endpoints
 * (RC-17): /repository/deployments (BPMN procs), /app-api/app-repository
 * /deployments (app-def), and per-.dmn /dmn-repository/deployments. The
 * E2E uses the modal as the seed — no parallel curl seeding needed.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

const BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:flowable="http://flowable.org/bpmn"
  targetNamespace="http://flowable.org/bpmn">
  <process id="e2eAppProcess" name="E2E App Process" isExecutable="true">
    <startEvent id="start"/>
    <sequenceFlow id="f1" sourceRef="start" targetRef="end"/>
    <endEvent id="end"/>
  </process>
</definitions>`;

const DMN = readFileSync(resolve("e2e/fixtures/sample.dmn"), "utf8");

const APP_JSON = JSON.stringify({
  key: "e2eApp",
  name: "E2E App",
  description: "Story 25.1 e2e fixture",
  theme: "theme-1",
  icon: "glyphicon-asterisk",
  models: [{ id: 1, name: "E2E App Process", key: "e2eAppProcess", modelType: 0, version: 1 }],
});

async function buildE2eBar(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("e2eAppProcess.bpmn20.xml", BPMN);
  zip.file("e2eAppDecision.dmn", DMN);
  zip.file("e2eApp.app", APP_JSON);
  return await zip.generateAsync({ type: "nodebuffer" });
}

const E2E_APP_KEY = "e2eApp";
const E2E_DECISION_KEY = "e2eSampleDecision";
const E2E_DEPLOYMENT_NAME = "e2e-story-25-1-app";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const FLOWABLE_APP = "http://localhost:8080/flowable-rest/app-api";
const FLOWABLE_DMN = "http://localhost:8080/flowable-rest/dmn-api";
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

async function cleanupDmnDeployments(): Promise<void> {
  // DMN sub-app deployments are named after the .dmn file extracted from the
  // .bar (e.g. "e2eAppDecision.dmn"), not after E2E_DEPLOYMENT_NAME — filter
  // broadly and delete those whose decision key matches the seed.
  const res = await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments?size=100`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as { data: DeploymentRow[] };
  for (const dep of body.data) {
    if (dep.name && dep.name.startsWith("e2eAppDecision")) {
      await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments/${dep.id}?cascade=true`, {
        method: "DELETE",
        headers: { Authorization: BASIC },
      });
    }
  }
}

async function uploadBarViaModal(page: import("@playwright/test").Page): Promise<void> {
  const archive = await buildE2eBar();
  await page.goto("/deployments");
  await page.getByTestId("upload-deployment").click();
  await page.getByTestId("upload-deployment-input").setInputFiles({
    name: `${E2E_DEPLOYMENT_NAME}.bar`,
    mimeType: "application/zip",
    buffer: Buffer.from(archive),
  });
  await expect(page.getByTestId("upload-bar-hint")).toBeVisible();
  await page.getByTestId("upload-deployment-submit").click();
  await expect(page.getByText(E2E_DEPLOYMENT_NAME).first()).toBeVisible({ timeout: 8000 });
}

test.describe("Story 25.1 — .bar upload recognition + App definitions", () => {
  test.beforeAll(async () => {
    await cleanupBpmnDeployments();
    await cleanupAppDeployments();
    await cleanupDmnDeployments();
  });

  test.afterAll(async () => {
    await cleanupBpmnDeployments();
    await cleanupAppDeployments();
    await cleanupDmnDeployments();
  });

  test("Sidebar nav exposes App definitions link in the Repository group", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('a[href="/app-definitions"]')).toBeVisible();
  });

  test("scope-reduction note renders inline above the filter strip", async ({ page }) => {
    await page.goto("/app-definitions");
    const note = page.getByTestId("app-runtime-scope-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText(/App-instances .* not exposed/);
  });

  test("/deployments upload modal recognizes .bar and fans out to all three sub-apps", async ({
    page,
  }) => {
    await uploadBarViaModal(page);

    // BPMN sub-app registered the bundled process.
    const bpmnRes = await fetch(
      `${FLOWABLE}/repository/deployments?name=${E2E_DEPLOYMENT_NAME}&size=10`,
      { headers: { Authorization: BASIC } },
    );
    const bpmnBody = (await bpmnRes.json()) as { data: DeploymentRow[] };
    expect(bpmnBody.data.length).toBeGreaterThan(0);

    // App sub-app registered the app-def.
    const appRes = await fetch(
      `${FLOWABLE_APP}/app-repository/app-definitions?key=${E2E_APP_KEY}&size=10`,
      { headers: { Authorization: BASIC } },
    );
    const appBody = (await appRes.json()) as { data: Array<{ key: string }> };
    expect(appBody.data.some((row) => row.key === E2E_APP_KEY)).toBe(true);

    // DMN sub-app registered the bundled decision.
    const dmnRes = await fetch(
      `${FLOWABLE_DMN}/dmn-repository/decisions?key=${E2E_DECISION_KEY}&size=10`,
      { headers: { Authorization: BASIC } },
    );
    const dmnBody = (await dmnRes.json()) as { data: Array<{ key: string }> };
    expect(dmnBody.data.some((row) => row.key === E2E_DECISION_KEY)).toBe(true);
  });

  test("/app-definitions list renders the modal-seeded row", async ({ page }) => {
    await page.goto("/app-definitions");
    await expect(page.getByTestId("app-definitions-table")).toBeVisible();
    await expect(page.getByText("E2E App")).toBeVisible();
    await expect(page.getByText(E2E_APP_KEY, { exact: true })).toBeVisible();
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

  test("deployment-detail surfaces the bundled-processes panel for the .bar upload", async ({
    page,
  }) => {
    await page.goto("/deployments");
    await expect(page.getByText(E2E_DEPLOYMENT_NAME).first()).toBeVisible();
    await page.getByText(E2E_DEPLOYMENT_NAME).first().click();
    await expect(page.getByTestId("deployment-bundled-processes-panel")).toBeVisible();
    await expect(page.locator('[data-testid^="bundled-process-row-"]').first()).toBeVisible();
  });

  test("BAR deployment row announces kind='BAR' on /deployments (Story 25.1)", async ({ page }) => {
    await page.goto("/deployments");
    const row = page.locator(`tr[data-deployment-id]`).filter({ hasText: E2E_DEPLOYMENT_NAME });
    await expect(row).toBeVisible();
    await expect(row).toContainText("BAR");
    await expect(row).toHaveAttribute("data-kind", "bar");
  });

  test("deployment-app-definitions-panel does NOT render on a deployment without an app-def", async ({
    page,
  }) => {
    await page.goto("/deployments");
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
    expect(req.headers().authorization ?? "").toMatch(/^Basic /);
  });

  test("app-runtime/app-instances stays unmounted (FR-55 scope-reduction premise)", async () => {
    const res = await fetch(`${FLOWABLE_APP}/app-runtime/app-instances`, {
      headers: { Authorization: BASIC },
    });
    expect(res.ok).toBe(false);
    const body = (await res.text()) ?? "";
    expect(body).toMatch(/No endpoint/);
  });
});
