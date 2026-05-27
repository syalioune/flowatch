// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for errorStatus(err). Closes Epic 7 retro action item A-3
 * (extract the "status from unknown" helper that ErrorBox and KpiValue had
 * each inlined). The four cases below mirror the retro's success-criteria
 * wording verbatim so a future grep can connect spec → test → fix.
 */

import { describe, expect, it } from "vitest";
import { FlowableError } from "../../api";
import { errorStatus } from "../error";

describe("errorStatus(err)", () => {
  it("FlowableError → status", () => {
    expect(errorStatus(new FlowableError("not found", 404))).toBe(404);
    expect(errorStatus(new FlowableError("server", 500))).toBe(500);
    // The network-error sentinel keeps its 0 — consumers that need to
    // distinguish "no HTTP exchange" from "HTTP status 0" must read
    // FlowableError.status directly.
    expect(errorStatus(new FlowableError("network", 0))).toBe(0);
  });

  it("plain Error with .status numeric → status", () => {
    const e = Object.assign(new Error("custom"), { status: 422 });
    expect(errorStatus(e)).toBe(422);
  });

  it("plain Error without .status → 0", () => {
    expect(errorStatus(new Error("plain"))).toBe(0);
  });

  it("non-Error throw value → 0", () => {
    expect(errorStatus("raw string throw")).toBe(0);
    expect(errorStatus(null)).toBe(0);
    expect(errorStatus(undefined)).toBe(0);
    expect(errorStatus(42)).toBe(0);
    expect(errorStatus({ status: "not a number" })).toBe(0);
  });

  it("malformed numeric status (NaN / Infinity / negative) → 0 (review patch)", () => {
    // typeof NaN === "number" and typeof Infinity === "number" — without the
    // Number.isFinite guard these would bleed through and render as "HTTP NaN"
    // / "HTTP Infinity" downstream. Negative status is meaningless for HTTP.
    expect(errorStatus(Object.assign(new Error(), { status: Number.NaN }))).toBe(0);
    expect(errorStatus(Object.assign(new Error(), { status: Number.POSITIVE_INFINITY }))).toBe(0);
    expect(errorStatus(Object.assign(new Error(), { status: -1 }))).toBe(0);
    expect(errorStatus(new FlowableError("bad", Number.NaN))).toBe(0);
  });
});
