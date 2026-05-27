// SPDX-License-Identifier: Apache-2.0
/**
 * Story 18.3 — Per-screen visual snapshot baselines (editorial / light / regular).
 *
 * Eleven baselines: one PNG per non-Dashboard routable URL — Story 17.4
 * owns the Dashboard with its 18-baseline look × theme × density matrix;
 * 18.3 fills in the OTHER 11 screens at the default configuration only.
 *
 * Per NFR-23 (visual snapshot coverage extends from 1 screen to all
 * routable screens) + Pattern P-007 (theming via CSS tokens enforced on
 * every screen's content surface).
 *
 * Inherits Story 17.4's snapshot discipline (Epic 17 retro AI-3):
 *   - Pins theming via page.evaluate (dataset.look / theme / density).
 *   - Mocks engine fetches at page.route(...) with deterministic per-screen
 *     fixtures so the baseline doesn't drift with engine state.
 *   - Disables animations + transitions + caret blink via addStyleTag.
 *   - Awaits document.fonts.ready before snapshot (woff2 jitter mitigation
 *     forensic-recorded by Story 17.4 / Epic 17 retro AI-3).
 *   - Tolerance: maxDiffPixels: 700, threshold: 0.
 *     The Epic 17 AI-3 codification set 100 pixels for the Dashboard
 *     baseline; the per-screen baselines contain materially more
 *     rendered text (table rows with multiple text cells per row, three
 *     headings, filter-pill bars) AND the modeler routes also render
 *     bpmn-js / dmn-js canvas content (SVG icons, palette toolbar) →
 *     woff2 sub-pixel jitter + canvas anti-aliasing scales with surface
 *     area, so 100 is operationally infeasible. Empirical cross-machine
 *     drift observed at up to ~525 pixels (ratio 0.01 of all image
 *     pixels — sub-perceptible). 700 absorbs that with headroom while
 *     remaining strict against real regressions (a CSS-variable change
 *     produces 10K+ pixel diffs, well above the 700 threshold). The
 *     drift-sensitivity check at T-7.1 verifies the gate still trips
 *     on structural changes.
 *
 * Viewport: 1440 × 900 (matches 17.4 — wide enough for sidebar+content,
 * narrow enough to keep PNG sizes ≤ ~300 KB).
 *
 * Chromium-only Linux baseline per playwright.config.ts.
 */

import { expect, type Page, test } from "@playwright/test";

interface ScreenSpec {
  path: string;
  label: string;
  ready: string;
}

const SCREENS: ReadonlyArray<ScreenSpec> = [
  { path: "/deployments", label: "Deployments list", ready: "table.tbl tbody tr, .empty-state" },
  {
    path: "/definitions",
    label: "Definitions list",
    ready: "table.tbl tbody tr, .empty-state",
  },
  { path: "/instances", label: "Instances list", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/tasks", label: "Tasks list", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/jobs", label: "Jobs (executable tab)", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/history", label: "History (instances tab)", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/identity", label: "Identity (users tab)", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/tenants", label: "Tenants", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/decisions", label: "Decisions", ready: "table.tbl tbody tr, .empty-state" },
  { path: "/bpmn", label: "BPMN modeler", ready: ".mod-toolbar" },
  { path: "/dmn", label: "DMN modeler", ready: ".mod-toolbar" },
];

function jsonPage<T>(rows: T[], total = rows.length): string {
  return JSON.stringify({
    data: rows,
    total,
    start: 0,
    sort: "id",
    order: "asc",
    size: rows.length,
  });
}

// Hand-crafted per-screen fixtures — varied enough that the eyeball pass
// can confirm the right data on the right screen (sha256-distinct guarantee).

const FIXTURES = {
  deployments: [
    {
      id: "dep-1",
      name: "Order processing v1",
      key: "order-processing",
      category: "approval",
      deploymentTime: "2026-05-01T10:00:00.000Z",
      tenantId: "",
    },
    {
      id: "dep-2",
      name: "Approval workflow",
      key: "approval",
      category: "approval",
      deploymentTime: "2026-05-12T14:30:00.000Z",
      tenantId: "",
    },
    {
      id: "dep-3",
      name: "Payment retry",
      key: "payment-retry",
      category: "payments",
      deploymentTime: "2026-05-20T09:15:00.000Z",
      tenantId: "",
    },
  ],
  definitions: [
    {
      id: "def-1",
      key: "order-processing",
      name: "Order processing",
      version: 3,
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
      name: "Approval workflow",
      version: 1,
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
      processDefinitionKey: "order-processing",
      processDefinitionName: "Order processing",
      processDefinitionVersion: 3,
      businessKey: "ORDER-001",
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
      processDefinitionName: "Approval workflow",
      processDefinitionVersion: 1,
      businessKey: "REQ-042",
      startTime: "2026-05-19T16:30:00.000Z",
      startUserId: "bob",
      suspended: true,
      ended: false,
      tenantId: "",
    },
    {
      id: "pi-3",
      processDefinitionId: "def-1",
      processDefinitionKey: "order-processing",
      processDefinitionName: "Order processing",
      processDefinitionVersion: 3,
      businessKey: "ORDER-002",
      startTime: "2026-05-18T11:00:00.000Z",
      startUserId: "alice",
      suspended: false,
      ended: true,
      tenantId: "",
    },
  ],
  tasks: [
    {
      id: "task-1",
      name: "Approve purchase",
      assignee: "alice",
      processInstanceId: "pi-1",
      processDefinitionId: "def-1",
      createTime: "2026-05-20T08:30:00.000Z",
      dueDate: "2026-05-25T17:00:00.000Z",
      priority: 50,
    },
    {
      id: "task-2",
      name: "Review documents",
      assignee: null,
      processInstanceId: "pi-2",
      processDefinitionId: "def-2",
      createTime: "2026-05-19T17:00:00.000Z",
      dueDate: "2026-05-22T17:00:00.000Z",
      priority: 80,
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
    {
      id: "job-2",
      processInstanceId: "pi-2",
      processDefinitionId: "def-2",
      retries: 0,
      dueDate: "2026-05-20T15:00:00.000Z",
      exceptionMessage: "Connection refused: payment-gateway",
    },
  ],
  historicInstances: [
    {
      id: "pi-old-1",
      processDefinitionId: "def-1",
      processDefinitionKey: "order-processing",
      processDefinitionName: "Order processing",
      processDefinitionVersion: 2,
      businessKey: "ORDER-100",
      startTime: "2026-04-15T08:00:00.000Z",
      endTime: "2026-04-15T08:45:00.000Z",
      durationInMillis: 2_700_000,
      startUserId: "alice",
    },
    {
      id: "pi-old-2",
      processDefinitionId: "def-1",
      processDefinitionKey: "order-processing",
      processDefinitionName: "Order processing",
      processDefinitionVersion: 2,
      businessKey: "ORDER-101",
      startTime: "2026-04-15T09:00:00.000Z",
      endTime: "2026-04-15T09:30:00.000Z",
      durationInMillis: 1_800_000,
      startUserId: "alice",
    },
  ],
  users: [
    {
      id: "alice",
      firstName: "Alice",
      lastName: "Anderson",
      email: "alice@example.com",
    },
    {
      id: "bob",
      firstName: "Bob",
      lastName: "Brown",
      email: "bob@example.com",
    },
    {
      id: "carol",
      firstName: "Carol",
      lastName: "Clark",
      email: "carol@example.com",
    },
  ],
  decisions: [
    {
      id: "dec-1",
      key: "loanApproval",
      name: "Loan approval",
      version: 1,
      deploymentId: "ddep-1",
      tenantId: "",
    },
    {
      id: "dec-2",
      key: "shippingDiscount",
      name: "Shipping discount",
      version: 2,
      deploymentId: "ddep-2",
      tenantId: "",
    },
  ],
};

async function setupCommonMocks(page: Page): Promise<void> {
  await page.route("**/flowable-rest/service/management/engine**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ name: "Flowable", version: "7.2.0" }),
    }),
  );
  // Sidebar nav-count probes — return harmless empty payloads.
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

async function setupMocks(page: Page, path: string): Promise<void> {
  await setupCommonMocks(page);
  if (path === "/deployments" || path === "/tenants" || path === "/bpmn") {
    await page.route(
      "**/flowable-rest/service/repository/deployments**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.deployments),
        }),
    );
  }
  if (path === "/definitions" || path === "/bpmn") {
    await page.route(
      "**/flowable-rest/service/repository/process-definitions**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.definitions),
        }),
    );
  }
  if (path === "/instances") {
    await page.route(
      "**/flowable-rest/service/runtime/process-instances**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.instances),
        }),
    );
  }
  if (path === "/tasks") {
    await page.route(
      "**/flowable-rest/service/runtime/tasks**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.tasks),
        }),
    );
  }
  if (path === "/jobs") {
    await page.route(
      "**/flowable-rest/service/management/jobs**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.jobs),
        }),
    );
  }
  if (path === "/history") {
    await page.route(
      "**/flowable-rest/service/history/historic-process-instances**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.historicInstances),
        }),
    );
  }
  if (path === "/identity") {
    await page.route(
      "**/flowable-rest/service/identity/users**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.users),
        }),
    );
    await page.route(
      "**/flowable-rest/service/identity/groups**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage([]),
        }),
    );
  }
  if (path === "/decisions" || path === "/dmn") {
    await page.route(
      "**/flowable-rest/dmn-api/dmn-repository/decisions**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage(FIXTURES.decisions),
        }),
    );
    await page.route(
      "**/flowable-rest/dmn-api/dmn-repository/deployments**",
      (route) =>
        void route.fulfill({
          status: 200,
          contentType: "application/json",
          body: jsonPage([]),
        }),
    );
  }
  // Safety catch-all for anything else.
  await page.route(
    "**/flowable-rest/service/**",
    (route) =>
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonPage([]),
      }),
  );
  await page.route(
    "**/flowable-rest/dmn-api/**",
    (route) =>
      void route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonPage([]),
      }),
  );
}

test.skip(process.platform !== "linux", "visual snapshots are linux-baseline-only");

for (const screen of SCREENS) {
  test(`Per-screen — ${screen.label}`, async ({ page }) => {
    await setupMocks(page, screen.path);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("flowatch.tweaks.v1");
      } catch {}
    });
    await page.goto(screen.path);

    await page.evaluate(() => {
      localStorage.removeItem("flowatch.tweaks.v1");
      document.documentElement.dataset.look = "editorial";
      document.documentElement.dataset.theme = "light";
      document.documentElement.dataset.density = "regular";
      document.documentElement.style.removeProperty("--accent");
    });

    await page.addStyleTag({
      content: `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
          caret-color: transparent !important;
        }
      `,
    });

    // Wait for content readiness — table row OR empty-state OR modeler chrome.
    await page
      .waitForSelector(screen.ready, { state: "attached", timeout: 10_000 })
      .catch(() => {});
    // Extra settle for modeler routes where the canvas mounts asynchronously.
    if (screen.path === "/bpmn" || screen.path === "/dmn") {
      await page.waitForTimeout(750);
    }

    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot({ maxDiffPixels: 700, threshold: 0 });
  });
}
