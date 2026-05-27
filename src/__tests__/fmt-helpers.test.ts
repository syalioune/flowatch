// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for fmtTime() and fmtDue() — the two relative-time helpers in
 * src/components.tsx. Adding these in Story 9.6 because the new route
 * loader tests (9.4 + 9.5) widened the v8-discoverable branch set in
 * components.tsx; covering these two functions returns branch coverage
 * above the per-file floor.
 *
 * Both functions handle null/undefined, < 60s, < 1h, < 1d, and ≥ 1d
 * windows; fmtDue additionally bifurcates on overdue (diff < 0) vs in.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fmtDue, fmtTime } from "../components";

const NOW = new Date("2026-05-24T12:00:00.000Z").getTime();
const isoMinusSeconds = (s: number) => new Date(NOW - s * 1000).toISOString();
const isoPlusSeconds = (s: number) => new Date(NOW + s * 1000).toISOString();

describe("fmtTime()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns '—' for null and undefined", () => {
    expect(fmtTime(null)).toBe("—");
    expect(fmtTime(undefined)).toBe("—");
    expect(fmtTime("")).toBe("—");
  });

  it("renders seconds for diffs under 60s", () => {
    expect(fmtTime(isoMinusSeconds(5))).toBe("5s ago");
    expect(fmtTime(isoMinusSeconds(45))).toBe("45s ago");
  });

  it("renders minutes for diffs under an hour", () => {
    expect(fmtTime(isoMinusSeconds(120))).toBe("2m ago");
    expect(fmtTime(isoMinusSeconds(3500))).toBe("58m ago");
  });

  it("renders hours for diffs under a day", () => {
    expect(fmtTime(isoMinusSeconds(3600 * 2))).toBe("2h ago");
    expect(fmtTime(isoMinusSeconds(3600 * 23))).toBe("23h ago");
  });

  it("renders days for diffs >= 1d", () => {
    expect(fmtTime(isoMinusSeconds(86400 * 2))).toBe("2d ago");
    expect(fmtTime(isoMinusSeconds(86400 * 365))).toBe("365d ago");
  });
});

describe("fmtDue()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns '—' for null/undefined", () => {
    expect(fmtDue(null)).toBe("—");
    expect(fmtDue(undefined)).toBe("—");
  });

  it("renders minutes overdue when diff < 1h in the past", () => {
    expect(fmtDue(isoMinusSeconds(300))).toBe("5m overdue");
    expect(fmtDue(isoMinusSeconds(3500))).toBe("58m overdue");
  });

  it("renders hours overdue when diff < 1d in the past", () => {
    expect(fmtDue(isoMinusSeconds(3600 * 5))).toBe("5h overdue");
    expect(fmtDue(isoMinusSeconds(3600 * 23))).toBe("23h overdue");
  });

  it("renders days overdue when diff >= 1d in the past", () => {
    expect(fmtDue(isoMinusSeconds(86400 * 3))).toBe("3d overdue");
  });

  it("renders 'in Xm' when diff < 1h in the future", () => {
    expect(fmtDue(isoPlusSeconds(300))).toBe("in 5m");
    expect(fmtDue(isoPlusSeconds(3500))).toBe("in 58m");
  });

  it("renders 'in Xh' when diff < 1d in the future", () => {
    expect(fmtDue(isoPlusSeconds(3600 * 5))).toBe("in 5h");
    expect(fmtDue(isoPlusSeconds(3600 * 23))).toBe("in 23h");
  });

  it("renders 'in Xd' when diff >= 1d in the future", () => {
    expect(fmtDue(isoPlusSeconds(86400 * 7))).toBe("in 7d");
  });
});
