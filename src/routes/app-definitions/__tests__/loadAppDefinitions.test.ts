// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for Story 25.1 loadAppDefinitions — confirms the validated
 * search params map onto api.listAppDefinitions correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../api";
import { loadAppDefinitions } from "../index";

type Spy = ReturnType<typeof vi.fn>;
let listSpy: Spy;
const originalList = api.listAppDefinitions;

beforeEach(() => {
  listSpy = vi
    .fn()
    .mockResolvedValue({ data: [], total: 0, start: 0, size: 50, sort: "", order: "" });
  (api as unknown as { listAppDefinitions: unknown }).listAppDefinitions = listSpy;
});

afterEach(() => {
  (api as unknown as { listAppDefinitions: unknown }).listAppDefinitions = originalList;
});

describe("loadAppDefinitions", () => {
  it("calls api.listAppDefinitions with size=50 and latest=true on default search", async () => {
    await loadAppDefinitions({ latest: true });
    expect(listSpy).toHaveBeenCalledWith({ size: 50, latest: true });
  });

  it("forwards key + tenantId when provided", async () => {
    await loadAppDefinitions({ latest: true, key: "loan-app", tenantId: "t-1" });
    expect(listSpy).toHaveBeenCalledWith({
      size: 50,
      key: "loan-app",
      tenantId: "t-1",
      latest: true,
    });
  });

  it("omits latest when false (engine treats absence as 'all versions')", async () => {
    await loadAppDefinitions({ latest: false });
    expect(listSpy).toHaveBeenCalledWith({ size: 50 });
  });

  it("omits empty key + tenantId strings", async () => {
    await loadAppDefinitions({ latest: true, key: "", tenantId: "" });
    expect(listSpy).toHaveBeenCalledWith({ size: 50, latest: true });
  });
});
