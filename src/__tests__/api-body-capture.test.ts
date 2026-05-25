// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for `captureBody` + `BODY_BYTE_BUDGET` (Story 10.2 AC-9, Epic 9
 * retro A-3 carry-forward).
 *
 * Three contractual cases:
 *   1. body whose stringified form ≤ 16 KB → returned verbatim (identity).
 *   2. body whose stringified form > 16 KB → returned as the truncated
 *      envelope { __truncated, __originalBytes, __preview }.
 *   3. body that throws on stringify (circular ref, BigInt) → returned
 *      verbatim (the render-time previewBody fallback handles the throw).
 */

import { describe, expect, it } from "vitest";
import { BODY_BYTE_BUDGET, captureBody, type TruncatedBody } from "../api";

describe("captureBody", () => {
  it("returns the body unchanged when stringified length ≤ budget", () => {
    const body = { processDefinitionKey: "loan", businessKey: "order-1" };
    const result = captureBody(body);
    expect(result).toBe(body);
  });

  it("returns the truncated envelope when stringified length > budget", () => {
    const huge = { variables: "x".repeat(BODY_BYTE_BUDGET + 100) };
    const result = captureBody(huge) as TruncatedBody;
    expect(result).not.toBe(huge);
    expect(result.__truncated).toBe(true);
    expect(result.__originalBytes).toBeGreaterThan(BODY_BYTE_BUDGET);
    expect(result.__preview.length).toBe(BODY_BYTE_BUDGET);
    expect(typeof result.__preview).toBe("string");
  });

  it("returns the body unchanged when JSON.stringify throws (circular ref)", () => {
    type CircularNode = { name: string; self?: CircularNode };
    const circular: CircularNode = { name: "loop" };
    circular.self = circular;
    const result = captureBody(circular);
    expect(result).toBe(circular);
  });

  it("returns undefined-stringify body unchanged (functions stringify to undefined)", () => {
    const body = () => "noop";
    const result = captureBody(body);
    expect(result).toBe(body);
  });

  it("BODY_BYTE_BUDGET is 16 KB", () => {
    expect(BODY_BYTE_BUDGET).toBe(16384);
  });
});
