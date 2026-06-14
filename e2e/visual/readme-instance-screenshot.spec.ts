// SPDX-License-Identifier: Apache-2.0
/**
 * README instance-detail "see it operate" screenshot (Story 33.1 follow-up,
 * DOC-DAA-001).
 *
 * This is NOT a snapshot-diff test. It SEEDS its own data against the LIVE
 * engine, then WRITES one PNG to branding/screenshots/ via
 * page.screenshot({ path }) — the committed asset the README embeds beneath
 * the three-look Dashboard row.
 *
 * Unlike readme-screenshots.spec.ts (mocked, host-agnostic), this capture
 * REQUIRES a running engine because the value of the shot IS the live BPMN
 * canvas with the current-activity overlay (Epic 26). It is self-contained
 * and deterministic-by-construction: it deploys the reviewSalesLead BPMN and
 * starts a fresh instance, which parks at the first user task
 * ("Provide new sales lead"), so the overlay always highlights the same node.
 *
 * Re-capture (one command — needs `make stack` up first):
 *   make stack                       # engine on :8080, Vite on :5173
 *   npm run e2e -- readme-instance-screenshot
 *
 * Combo: editorial / light / regular (matches README screenshot #1) at the
 * same fixed 1440×900 viewport as the Dashboard captures.
 *
 * Note: each run deploys a new version + starts a new instance (the engine
 * versions the definition). That is intended churn for a one-off maintainer
 * capture — it does not clean up the seeded instance.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Playwright runs from the repo root, so the fixture path is cwd-relative.
const BPMN = readFileSync("e2e/fixtures/review-sales-lead.bpmn20.xml");

// Default bundled-engine credentials (CLAUDE.md "Connection config"). The
// engine is reached through the Vite proxy (/flowable-rest -> :8080).
const AUTH = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

test("README screenshot — instance detail (editorial / light)", async ({ page, request }) => {
  // 1. SEED: deploy the BPMN (multipart) + start an instance. It parks at the
  //    first user task, so the current-activity overlay is deterministic.
  const deployRes = await request.post("/flowable-rest/service/repository/deployments", {
    headers: { Authorization: AUTH },
    multipart: {
      file: {
        name: "review-sales-lead.bpmn20.xml",
        mimeType: "text/xml",
        buffer: BPMN,
      },
    },
  });
  expect(deployRes.ok()).toBeTruthy();

  const startRes = await request.post("/flowable-rest/service/runtime/process-instances", {
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    data: { processDefinitionKey: "reviewSaledLead" },
  });
  expect(startRes.ok()).toBeTruthy();
  const instanceId = (await startRes.json()).id as string;

  // 2. Navigate the GUI to the freshly-seeded instance.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/instances/${instanceId}`);

  // 3. Pin theming attributes deterministically (P-007) — never localStorage.
  await page.evaluate(() => {
    localStorage.removeItem("flowatch.tweaks.v1");
    document.documentElement.dataset.look = "editorial";
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.density = "regular";
    document.documentElement.style.removeProperty("--accent");
  });

  // 4. Reduced-motion + hide the dev-only TanStack Router Devtools badge.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        caret-color: transparent !important;
      }
      button[aria-label="Open TanStack Router Devtools"],
      button[aria-label*="TanStack Router Devtools"] {
        display: none !important;
      }
    `,
  });

  // 5. Wait for the BPMN canvas to render and the current-activity overlay to
  //    paint the running node — the AC-2-equivalent guard: if the diagram
  //    never renders, the capture HALTS rather than writing a blank panel.
  await expect(page.locator(".djs-container svg").first()).toBeVisible();
  await expect(page.locator(".activity-current").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  // 6. Write the PNG.
  await page.screenshot({ path: "branding/screenshots/instance-detail-editorial-light.png" });
});
