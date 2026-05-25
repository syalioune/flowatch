// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/history` route loader (Story 13.1 AC-1).
 *
 * Mirrors the 9.1 / 9.4 / 10.1 / 11.1 / 12.1 precedent: the loader is the
 * smallest piece of route-bound logic worth pinning; the four-state UI is
 * exercised by the E2E suite (e2e/history-instances.spec.ts). 13.1's wrinkle
 * is the type-branch: `instances` calls listHistoricInstances, the other
 * three branches return null so the legacy shim renders without a duplicate
 * fetch at the route level.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadHistoricInstances } from "../routes/history/index";

describe("/history route loader", () => {
  const realList = apiModule.api.listHistoricInstances;
  let lastParams: unknown = null;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    lastParams = null;
    spy = vi.fn((p: unknown) => {
      lastParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "endTime",
        order: "desc",
      });
    });
    (apiModule.api as unknown as { listHistoricInstances: typeof realList }).listHistoricInstances =
      spy as unknown as typeof realList;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listHistoricInstances: typeof realList }).listHistoricInstances =
      realList;
  });

  it("AC-1 instances: calls listHistoricInstances with size=50, finished=true, sort=endTime, order=desc", async () => {
    const out = await loadHistoricInstances("instances");
    expect(out).not.toBeNull();
    expect(lastParams).toEqual({
      size: 50,
      finished: true,
      sort: "endTime",
      order: "desc",
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("AC-1 activities: returns null without calling listHistoricInstances", async () => {
    const out = await loadHistoricInstances("activities");
    expect(out).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("AC-1 variables: returns null without calling listHistoricInstances", async () => {
    const out = await loadHistoricInstances("variables");
    expect(out).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("AC-1 tasks: returns null without calling listHistoricInstances", async () => {
    const out = await loadHistoricInstances("tasks");
    expect(out).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
