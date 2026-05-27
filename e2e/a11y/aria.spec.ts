// SPDX-License-Identifier: Apache-2.0
/**
 * Story 18.2 — ARIA assertions on forms + tables + status pills.
 *
 * Per NFR-17 (assistive-technology compatibility, ARIA semantics subset) +
 * Pattern P-007 (colour-coded tone tokens gain text-equivalent context) +
 * Pattern P-008 (per-entry token-contract guard for .sr-only).
 *
 * What 18.2 covers (orthogonal to 18.1's structural keyboard behaviour):
 *   - Icon-only buttons expose an accessible name via aria-label.
 *   - Every <th> inside a <thead> carries scope="col".
 *   - Status badges carry sr-only text-equivalent context for the data-tone.
 *   - Modals carry role="dialog" (or "alertdialog" for destructive variants)
 *     + aria-modal="true" + aria-labelledby pointing at the title's id.
 *   - RowActionMenu trigger exposes aria-haspopup="menu" + aria-expanded
 *     (popup container has role="menu", items role="menuitem").
 *
 * Engine mocks: every list endpoint is mocked at the `page.route(...)` layer
 * so each screen renders a populated table regardless of the live engine's
 * state. The 18.2 assertion is "structural ARIA contract on rendered DOM" —
 * not "engine-realistic" — so deterministic mocks are the right shape.
 *
 * Chromium-only per playwright.config.ts.
 */

import { expect, type Page, test } from "@playwright/test";

interface BadgeScreen {
  path: string;
  label: string;
  ready: string;
}

const BADGE_SCREENS: ReadonlyArray<BadgeScreen> = [
  { path: "/instances", label: "Process instances", ready: "table.tbl" },
  { path: "/definitions", label: "Process definitions", ready: "table.tbl" },
];

const TABLE_SCREENS: ReadonlyArray<BadgeScreen> = [
  { path: "/deployments", label: "Deployments", ready: "table.tbl" },
  { path: "/definitions", label: "Process definitions", ready: "table.tbl" },
  { path: "/instances", label: "Process instances", ready: "table.tbl" },
  { path: "/tasks", label: "Tasks", ready: "table.tbl" },
  { path: "/jobs", label: "Jobs", ready: "table.tbl" },
  { path: "/history", label: "History", ready: "table.tbl" },
  { path: "/identity", label: "Identity", ready: "table.tbl" },
  { path: "/decisions?tab=decisions", label: "Decisions", ready: "table.tbl" },
];

function jsonPage<T>(rows: T[]): string {
  return JSON.stringify({
    data: rows,
    total: rows.length,
    start: 0,
    sort: "id",
    order: "asc",
    size: rows.length,
  });
}

const FIXTURES = {
  deployments: [
    {
      id: "dep-1",
      name: "Deployment One",
      key: "dep-one",
      deploymentTime: "2026-05-01T10:00:00.000Z",
      tenantId: "",
    },
    {
      id: "dep-2",
      name: "Deployment Two",
      key: "dep-two",
      deploymentTime: "2026-05-02T10:00:00.000Z",
      tenantId: "",
    },
  ],
  definitions: [
    {
      id: "def-1",
      key: "order",
      name: "Order processing",
      version: 1,
      suspended: false,
      deploymentId: "dep-1",
      tenantId: "",
      url: "",
      resource: "",
      hasStartFormKey: false,
      hasGraphicalNotation: true,
    },
    {
      id: "def-2",
      key: "approval",
      name: "Approval",
      version: 2,
      suspended: true,
      deploymentId: "dep-2",
      tenantId: "",
      url: "",
      resource: "",
      hasStartFormKey: false,
      hasGraphicalNotation: true,
    },
  ],
  instances: [
    {
      id: "pi-1",
      processDefinitionId: "def-1",
      processDefinitionKey: "order",
      processDefinitionName: "Order",
      processDefinitionVersion: 1,
      businessKey: "B-1",
      startTime: "2026-05-20T08:00:00.000Z",
      startUserId: "alice",
      suspended: false,
      ended: false,
      tenantId: "",
    },
    {
      id: "pi-2",
      processDefinitionId: "def-2",
      processDefinitionKey: "approval",
      processDefinitionName: "Approval",
      processDefinitionVersion: 2,
      businessKey: "B-2",
      startTime: "2026-05-19T16:30:00.000Z",
      startUserId: "bob",
      suspended: true,
      ended: false,
      tenantId: "",
    },
  ],
  tasks: [
    {
      id: "task-1",
      name: "Approve",
      assignee: "alice",
      processInstanceId: "pi-1",
      processDefinitionId: "def-1",
      createTime: "2026-05-20T08:30:00.000Z",
      dueDate: "2026-05-25T17:00:00.000Z",
      priority: 50,
    },
  ],
  jobs: [
    {
      id: "job-1",
      processInstanceId: "pi-1",
      processDefinitionId: "def-1",
      retries: 2,
      dueDate: "2026-05-21T10:00:00.000Z",
      exceptionMessage: null,
    },
  ],
  historicInstances: [
    {
      id: "pi-old-1",
      processDefinitionId: "def-1",
      processDefinitionKey: "order",
      processDefinitionName: "Order",
      processDefinitionVersion: 1,
      businessKey: "B-old",
      startTime: "2026-04-15T08:00:00.000Z",
      endTime: "2026-04-15T08:45:00.000Z",
      durationInMillis: 2_700_000,
      startUserId: "alice",
    },
  ],
  users: [{ id: "alice", firstName: "Alice", lastName: "Anderson", email: "alice@example.com" }],
  decisions: [
    {
      id: "dec-1",
      key: "loanApproval",
      name: "Loan approval",
      version: 1,
      deploymentId: "ddep-1",
      tenantId: "",
    },
  ],
};

async function setupMocks(page: Page): Promise<void> {
  // Playwright runs routes LIFO (most-recently-registered first), so the
  // generic catch-alls MUST be registered BEFORE the specific routes —
  // that way the specific routes override the catch-all.
  await page.route("**/flowable-rest/service/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage([]),
    }),
  );
  await page.route("**/flowable-rest/dmn-api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage([]),
    }),
  );

  await page.route("**/flowable-rest/service/management/engine**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ name: "Flowable", version: "7.2.0" }),
    }),
  );
  await page.route("**/flowable-rest/service/repository/deployments**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage(FIXTURES.deployments),
    }),
  );
  await page.route(
    "**/flowable-rest/service/repository/process-definitions**",
    (route) =>
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonPage(FIXTURES.definitions),
      }),
  );
  await page.route("**/flowable-rest/service/runtime/process-instances**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage(FIXTURES.instances),
    }),
  );
  await page.route("**/flowable-rest/service/runtime/tasks**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage(FIXTURES.tasks),
    }),
  );
  await page.route("**/flowable-rest/service/management/jobs**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage(FIXTURES.jobs),
    }),
  );
  await page.route(
    "**/flowable-rest/service/history/historic-process-instances**",
    (route) =>
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonPage(FIXTURES.historicInstances),
      }),
  );
  await page.route("**/flowable-rest/service/identity/users**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage(FIXTURES.users),
    }),
  );
  await page.route("**/flowable-rest/service/identity/groups**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage([]),
    }),
  );
  await page.route("**/flowable-rest/dmn-api/dmn-repository/decisions**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage(FIXTURES.decisions),
    }),
  );
  await page.route("**/flowable-rest/dmn-api/dmn-repository/deployments**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonPage([]),
    }),
  );
  await page.route(
    "**/flowable-rest/service/management/timer-jobs**",
    (route) =>
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonPage([]),
      }),
  );
  await page.route(
    "**/flowable-rest/service/management/deadletter-jobs**",
    (route) =>
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonPage([]),
      }),
  );
}

async function navAndWait(page: Page, screen: BadgeScreen): Promise<void> {
  await setupMocks(page);
  await page.goto(screen.path);
  await page.waitForSelector(screen.ready, { state: "visible", timeout: 10_000 });
}

test.describe("Story 18.2 — tables use scope='col'", () => {
  for (const screen of TABLE_SCREENS) {
    test(`tables on ${screen.label} use scope='col'`, async ({ page }) => {
      await navAndWait(page, screen);
      const table = page.locator("table.tbl").first();
      const ths = await table.locator("thead > tr > th").all();
      expect(ths.length, `${screen.label} should have at least one <th>`).toBeGreaterThan(0);
      for (const [i, th] of ths.entries()) {
        const scope = await th.getAttribute("scope");
        expect(scope, `${screen.label} <th> #${i} missing scope="col"`).toBe("col");
      }
    });
  }
});

test.describe("Story 18.2 — status badges expose sr-only context", () => {
  for (const screen of BADGE_SCREENS) {
    test(`badges on ${screen.label} carry sr-only prefix`, async ({ page }) => {
      await navAndWait(page, screen);
      const badges = page.locator(".badge");
      const count = await badges.count();
      expect(count, `${screen.label} should render at least one .badge`).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const srOnly = await badges.nth(i).locator(".sr-only").count();
        expect(
          srOnly,
          `Badge #${i} on ${screen.label} missing .sr-only prefix`,
        ).toBeGreaterThanOrEqual(1);
      }
    });
  }
});

test.describe("Story 18.2 — Topbar icon-only buttons have aria-label", () => {
  test("Topbar buttons each expose an accessible name", async ({ page }) => {
    await setupMocks(page);
    await page.goto("/");
    for (const testid of ["tweaks-toggle", "inspector-toggle"]) {
      const btn = page.getByTestId(testid);
      await expect(btn).toBeVisible();
      const label = await btn.getAttribute("aria-label");
      expect(label, `${testid} missing aria-label`).toBeTruthy();
      expect(label?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

test.describe("Story 18.2 — modals carry role + aria-modal + aria-labelledby", () => {
  test("UploadDeploymentModal has dialog ARIA contract", async ({ page }) => {
    await navAndWait(page, { path: "/deployments", label: "Deployments", ready: "table.tbl" });
    const trigger = page.getByTestId("upload-deployment");
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();
    expect(await dialog.getAttribute("aria-modal")).toBe("true");
    const labelledby = await dialog.getAttribute("aria-labelledby");
    expect(labelledby).toBeTruthy();
    const title = page.locator(`#${labelledby}`);
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.trim().length ?? 0).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });
});

test.describe("Story 18.2 — RowActionMenu exposes menu semantics", () => {
  test("trigger has aria-haspopup + aria-expanded; menu items have role", async ({ page }) => {
    await navAndWait(page, { path: "/deployments", label: "Deployments", ready: "table.tbl" });
    const rows = page.locator("table.tbl tbody tr");
    await expect(rows.first()).toBeVisible();
    const trigger = page.locator('[data-testid="row-action-trigger"]').first();
    expect(await trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(await trigger.getAttribute("aria-expanded")).toBe("false");
    await trigger.click();
    expect(await trigger.getAttribute("aria-expanded")).toBe("true");
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    const items = await menu.locator('[role="menuitem"]').count();
    expect(items).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });
});
