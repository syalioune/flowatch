// SPDX-License-Identifier: Apache-2.0
//
// Story 18.2 — `.sr-only` utility class invariants (Pattern P-008 token-contract guard).
//
// The WebAIM-canonical sr-only pattern hides content from sighted users
// while keeping it discoverable to assistive technology. Six declarations
// are load-bearing — drop any one and the class either becomes visible
// (defeating purpose) or stops being read by screen readers. This test
// parses src/styles/components.css and asserts all six remain present
// inside the `.sr-only` rule.
//
// Pattern P-008 generalisation precedent:
//   - src/__tests__/wcag-contrast.test.ts (Story 17.3)
//   - src/__tests__/empty-states-exhaustiveness.test.ts (Story 17.5)
// This file is the third application; per CLAUDE.md "Never extract at N=4",
// the inline-parse-and-iterate shape is preserved (no shared helper).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const components = readFileSync(join(__dirname, "..", "styles", "components.css"), "utf-8");

function getSrOnlyBlock(): string {
  const match = components.match(/\.sr-only\s*\{([\s\S]*?)\}/);
  expect(match, ".sr-only rule must exist in components.css").not.toBeNull();
  return match?.[1] ?? "";
}

describe("Story 18.2 — .sr-only utility class invariants", () => {
  it("declares position: absolute (removes from layout flow)", () => {
    expect(getSrOnlyBlock()).toMatch(/position\s*:\s*absolute/);
  });

  it("declares width: 1px (minimal but non-zero so AT still reads)", () => {
    expect(getSrOnlyBlock()).toMatch(/width\s*:\s*1px/);
  });

  it("declares height: 1px (minimal but non-zero so AT still reads)", () => {
    expect(getSrOnlyBlock()).toMatch(/height\s*:\s*1px/);
  });

  it("declares overflow: hidden (no scrollbar leakage)", () => {
    expect(getSrOnlyBlock()).toMatch(/overflow\s*:\s*hidden/);
  });

  it("declares clip: rect(0, 0, 0, 0) (legacy IE/Firefox compat clip)", () => {
    expect(getSrOnlyBlock()).toMatch(/clip\s*:\s*rect\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/);
  });

  it("declares margin: -1px (cancels the 1px box bleeding into layout)", () => {
    expect(getSrOnlyBlock()).toMatch(/margin\s*:\s*-1px/);
  });

  it("does NOT declare display: none (would hide from screen readers)", () => {
    expect(getSrOnlyBlock()).not.toMatch(/display\s*:\s*none/);
  });

  it("does NOT declare visibility: hidden (would hide from screen readers)", () => {
    expect(getSrOnlyBlock()).not.toMatch(/visibility\s*:\s*hidden/);
  });
});
