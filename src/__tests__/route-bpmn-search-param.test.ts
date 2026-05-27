// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/bpmn` route's search-param schema (Story 9.5).
 *
 * Locks the AC-2 rename: `defId` → `definitionId`. Any future refactor
 * that accidentally re-introduces the old name flips this test red.
 *
 * Note on access: TanStack Router stores `validateSearch` as the original
 * zod schema; we call `.parse(...)` on it directly rather than going
 * through the route's runtime invocation (which would require mounting
 * the full router).
 */

import { describe, expect, it } from "vitest";
import type { ZodTypeAny } from "zod";
import { Route as BpmnRoute } from "../routes/bpmn";

const parse = (input: unknown) => {
  const schema = BpmnRoute.options.validateSearch as ZodTypeAny;
  return schema.parse(input) as { definitionId?: string };
};

describe("/bpmn route search param", () => {
  it("accepts ?definitionId=<id> per Story 9.5 AC-2", () => {
    const parsed = parse({ definitionId: "def-1" });
    expect(parsed.definitionId).toBe("def-1");
  });

  it("DROPS the legacy ?defId=<id> param (clean break)", () => {
    // Zod's default object behaviour strips unknown keys.
    const parsed = parse({ defId: "def-1" });
    expect(parsed.definitionId).toBeUndefined();
    expect((parsed as { defId?: string }).defId).toBeUndefined();
  });

  it("allows empty search (?definitionId omitted)", () => {
    const parsed = parse({});
    expect(parsed.definitionId).toBeUndefined();
  });
});
