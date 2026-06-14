// SPDX-License-Identifier: Apache-2.0

/**
 * Story 32.2 — targeted a11y regression assertions (AC #6).
 *
 * The axe matrix scan (e2e/a11y/axe-scan.spec.ts) is the broad live gate; these
 * are the component-local pins for the specific accessible-name defects 32.1
 * found, so the exact regression can't silently return even without a live
 * stack. Browser-tier (real Chromium via Vitest's Playwright provider) like the
 * sibling component specs.
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
