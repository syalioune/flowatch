// SPDX-License-Identifier: Apache-2.0

/**
 * Story 32.2 — targeted a11y regression assertions (AC #6).
 *
 * The axe matrix scan (e2e/a11y/axe-scan.spec.ts) is the broad live gate — it
 * pins the BPMN-panel labels, the Events <select>, the filter aria-labels and
 * the PageHead region (now across index AND detail routes, Story 32.2 D1). THIS
 * file adds the one stack-free pin worth keeping: the Topbar global search box,
 * the single biggest `label` contributor, which renders in every screen's chrome
 * and is cheap to assert without a live engine. Browser-tier (real Chromium via
 * Vitest's Playwright provider) like the sibling component specs.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Topbar } from "../../components";

afterEach(() => cleanup());

describe("Topbar global search — accessible name (Story 32.2)", () => {
  it("exposes the search box with an accessible name", () => {
    render(
      <Topbar
        tenant={{ id: "default", name: "default" }}
        onTenant={() => {}}
        theme="light"
        onTheme={() => {}}
        onInspector={() => {}}
        inspectorOpen={false}
        onSettings={() => {}}
        onTweaks={() => {}}
      />,
    );
    // axe `label` finding #1 (the single biggest contributor) — the Topbar
    // search input had no <label>/aria-label. Name-from-aria-label = "Search".
    expect(screen.getByRole("textbox", { name: "Search" })).toBeInTheDocument();
  });
});
