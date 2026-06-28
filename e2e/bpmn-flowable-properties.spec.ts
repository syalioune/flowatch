// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Flowable properties panel (Story 30.1, FR-38 / D-8).
 *
 * Drives the REAL bpmn-js modeler: selects the LOAN starter's UserTask via
 * the Outline, edits `flowable:assignee`, toggles `flowable:async`, and adds
 * a `flowable:taskListener`, then exports the XML (Save → download) and
 * asserts the produced BPMN carries those edits — the lossless-round-trip
 * differentiator vs Camunda Modeler (PRD D-8 / R-3).
 *
 * Per Pattern P-009: real engine, no mocks. The Outline rows are the stable
 * selection affordance — reliable bpmn-js canvas-click simulation from
 * Playwright is brittle (Story 16.2 AC-8 precedent), so we select via the
 * panel's element list, which calls the same `selection.select(el)`.
 *
 * Canvas-integration computed-style discipline (Epic 26 retro AI-2) is N/A
 * here: this story asserts XML OUTPUT, not CSS-class-on-SVG styling.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const CANVAS = ".bpmn-js-canvas svg, .djs-container svg";

test.describe("Flowable properties panel (Story 30.1)", () => {
  test("edit assignee + toggle async + add a task listener → export reflects all three", async ({
    page,
  }) => {
    await page.goto("/bpmn");
    await expect(page.locator(CANVAS).first()).toBeVisible({ timeout: 15_000 });

    // The pending banner is gone (placeholder-then-real, AC-5). Select the
    // LOAN starter's UserTask "Manager review" from the Outline list.
    const reviewRow = page.getByRole("button", { name: /Manager review/ });
    await expect(reviewRow).toBeVisible({ timeout: 10_000 });
    await reviewRow.click();

    // The panel now renders the UserTask Flowable field set.
    const assignee = page.getByTestId("bpmn-prop-assignee");
    await expect(assignee).toBeVisible();
    await assignee.fill("kermit");
    await assignee.blur();

    // Toggle async (checkbox → writes flowable:async="true").
    const asyncBox = page.getByTestId("bpmn-prop-async");
    await asyncBox.check();
    await expect(asyncBox).toBeChecked();

    // Add a task listener (event create / class impl).
    await page.getByLabel("Task listeners implementation value").fill("com.acme.MyTaskListener");
    await page.getByTestId("bpmn-listener-add-tasklistener").click();
    await expect(page.getByTestId("bpmn-listener-row-tasklistener-0")).toBeVisible();

    // Existing entries are EDITABLE (not just add/remove): modify the listener
    // we just added — change its value, event, and onTransaction in place.
    await page.getByLabel("Task listeners 0 implementation value").fill("com.acme.EditedListener");
    await page.getByLabel("Task listeners 0 event").selectOption("complete");
    await page.getByLabel("Task listeners 0 onTransaction").selectOption("committed");
    await page.locator("body").click(); // blur to commit the value edit

    // Export via Save → capture the download and read the produced XML.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("bpmn-save-xml").click();
    const download = await downloadPromise;
    const filePath = await download.path();
    const xml = readFileSync(filePath, "utf8");

    expect(xml).toContain('flowable:assignee="kermit"');
    expect(xml).toContain('flowable:async="true"');
    expect(xml).toContain("flowable:taskListener");
    // The in-place edit is reflected; the pre-edit value is gone.
    expect(xml).toContain("com.acme.EditedListener");
    expect(xml).not.toContain("com.acme.MyTaskListener");
    expect(xml).toContain('event="complete"');
    expect(xml).toContain('onTransaction="committed"');
    // The starter's pre-existing extension survives the edits (no collateral drop).
    expect(xml).toContain("loan-officers,managers");
  });

  test("sequence-flow condition is editable and round-trips as a FormalExpression", async ({
    page,
  }) => {
    await page.goto("/bpmn");
    await expect(page.locator(CANVAS).first()).toBeVisible({ timeout: 15_000 });

    // Select the LOAN starter's "reject" sequence flow from the Outline.
    await page.getByRole("button", { name: "reject SequenceFlow" }).click();
    const cond = page.getByTestId("bpmn-prop-condition");
    await expect(cond).toBeVisible();
    await cond.fill('${decision == "reject"}');
    await page.locator("body").click(); // blur to commit

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("bpmn-save-xml").click();
    const xml = readFileSync(await (await downloadPromise).path(), "utf8");

    expect(xml).toContain("bpmn:conditionExpression");
    expect(xml).toContain('xsi:type="bpmn:tFormalExpression"');
    expect(xml).toMatch(/decision == .*reject/);
  });
});
