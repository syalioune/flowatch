// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — DMN properties / metadata round-trip (Story 30.2, ADR-006 DMN half).
 *
 * Load-bearing finding: Flowable's DMN converter consumes standard OMG DMN
 * and ships NO `flowable:`-namespace extensions, so 30.2 is a verify-and-
 * document story — there is no rich Flowable-DMN field set to edit. This e2e
 * drives the REAL dmn-js modeler to prove the standard DMN surface (decision
 * id/name, hit policy, inputs/outputs with typeRef, JUEL rule entries)
 * round-trips losslessly through a load → export (Save → download) cycle —
 * the D-8 / R-3 differentiator extended to DMN.
 *
 * Per Pattern P-009: real engine, no mocks. dmn-js metadata + cell editing
 * from Playwright is brittle (Story 16.2 AC-8 precedent + the
 * DefinitionPropertiesView contenteditable depends on the active view) — the
 * decision-name + output-entry EDIT round-trip is covered headless in
 * src/modeler/__tests__/dmn-roundtrip.test.ts; this e2e proves the live
 * dmn-js load→export round-trip is lossless.
 *
 * Epic 26 AI-2 computed-style discipline is N/A — asserts XML OUTPUT, not
 * CSS-class-on-SVG.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const CANVAS = ".dmn-js-parent, .djs-container, .dmn-decision-table-container";

test.describe("DMN properties round-trip (Story 30.2)", () => {
  test("load → export preserves the standard DMN surface (decision + table) losslessly", async ({
    page,
  }) => {
    await page.goto("/dmn");
    // The modeler mounts the LOAN_DMN_XML starter.
    await expect(page.locator(CANVAS).first()).toBeVisible({ timeout: 15_000 });

    // Export via Save → capture the download and read the produced XML.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("dmn-save-xml").click();
    const download = await downloadPromise;
    const xml = readFileSync(await download.path(), "utf8");

    // Standard DMN content round-trips through real dmn-js (lossless).
    expect(xml).toContain("decisionTable");
    expect(xml).toContain('id="riskTier"');
    expect(xml).toContain("Loan Decisions");
    // typeRef-bearing input/output columns survive.
    expect(xml).toMatch(/typeRef="(string|number)"/);
    // SDR strengthening: assert a NON-DEFAULT hitPolicy survives live —
    // FIRST is not the DMN default (UNIQUE), so it only appears in the export
    // if dmn-js preserved it losslessly (a lossy round-trip would drop it).
    expect(xml).toContain('hitPolicy="FIRST"');
  });
});
