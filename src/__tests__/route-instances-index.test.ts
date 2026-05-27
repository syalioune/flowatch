// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/instances` route loader (Story 10.1 AC-1).
 *
 * Mirrors the 9.1 (route-deployments-index.test.ts) and 9.4
 * (route-definitions-index.test.ts) precedent: the loader is the smallest
 * piece of route-bound logic worth pinning; the four-state UI is exercised
 * by the E2E suite (e2e/instances-list.spec.ts). Here we lock the request
 * shape (size 50, sort startTime desc, tenantId-omission) so a future
 * refactor can't silently change it.
 *
 * Extended: the loader now also runs a PARALLEL fetch of
 * `historic-activity-instances?finished=false` so the Activity column can
 * show the real active-activities summary (the engine's lead `activityId`
 * is often null on parallel-branch instances). The two fetches go via
 * `Promise.all`; the loader returns `{ instances, activeActivities }`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowableHistoricActivity, FlowablePage, FlowableProcessInstance } from "../api";
import * as apiModule from "../api";
import { groupActivitiesByInstance, loadProcessInstances } from "../routes/instances/index";

type ListInstancesFn = typeof apiModule.api.listProcessInstances;
type ListActivitiesFn = typeof apiModule.api.listHistoricActivities;

const instancesPage: FlowablePage<FlowableProcessInstance> = {
  data: [],
  total: 0,
  start: 0,
  size: 50,
  sort: "startTime",
  order: "desc",
};

const activitiesPage: FlowablePage<FlowableHistoricActivity> = {
  data: [],
  total: 0,
  start: 0,
  size: 500,
  sort: "startTime",
  order: "asc",
};

describe("/instances route loader", () => {
  const realConfig = apiModule.api.config;
  const realList = apiModule.api.listProcessInstances;
  const realListActivities = apiModule.api.listHistoricActivities;
  let lastInstancesParams: unknown = null;
  let lastActivitiesParams: unknown = null;

  beforeEach(() => {
    lastInstancesParams = null;
    lastActivitiesParams = null;
    (apiModule.api as unknown as { listProcessInstances: ListInstancesFn }).listProcessInstances =
      vi.fn((p: unknown) => {
        lastInstancesParams = p;
        return Promise.resolve(instancesPage);
      }) as unknown as ListInstancesFn;
    (
      apiModule.api as unknown as { listHistoricActivities: ListActivitiesFn }
    ).listHistoricActivities = vi.fn((p: unknown) => {
      lastActivitiesParams = p;
      return Promise.resolve(activitiesPage);
    }) as unknown as ListActivitiesFn;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listProcessInstances: typeof realList }).listProcessInstances =
      realList;
    (
      apiModule.api as unknown as { listHistoricActivities: typeof realListActivities }
    ).listHistoricActivities = realListActivities;
    (apiModule.api as unknown as { config: typeof realConfig }).config = realConfig;
  });

  it("calls listProcessInstances with the AC-1 defaults (size 50, sort startTime desc)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    const out = await loadProcessInstances();
    expect(lastInstancesParams).toMatchObject({ size: 50, sort: "startTime", order: "desc" });
    expect(out.instances).toBe(instancesPage);
  });

  it("OMITS tenantId when cfg.tenantId is empty", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadProcessInstances();
    expect(Object.keys(lastInstancesParams as object)).not.toContain("tenantId");
  });

  it("PASSES tenantId when cfg.tenantId is non-empty", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "acme",
    });
    await loadProcessInstances();
    expect((lastInstancesParams as { tenantId?: string }).tenantId).toBe("acme");
  });

  it("ALSO fetches active historic-activity-instances (finished=false) in parallel", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    const out = await loadProcessInstances();
    expect(lastActivitiesParams).toEqual({
      finished: false,
      size: 500,
      sort: "startTime",
    });
    expect(out.activeActivities).toBe(activitiesPage);
  });
});

describe("groupActivitiesByInstance helper", () => {
  const mk = (id: string, processInstanceId: string | undefined): FlowableHistoricActivity => ({
    id,
    activityId: `act_${id}`,
    activityType: "userTask",
    startTime: "2026-05-26T10:00:00.000Z",
    ...(processInstanceId !== undefined ? { processInstanceId } : {}),
  });

  it("returns an empty map for no activities", () => {
    expect(groupActivitiesByInstance([]).size).toBe(0);
  });

  it("buckets by processInstanceId, preserving order", () => {
    const a = mk("1", "pi-1");
    const b = mk("2", "pi-2");
    const c = mk("3", "pi-1");
    const grouped = groupActivitiesByInstance([a, b, c]);
    expect(grouped.get("pi-1")).toEqual([a, c]);
    expect(grouped.get("pi-2")).toEqual([b]);
    expect(grouped.size).toBe(2);
  });

  it("drops activities without a processInstanceId", () => {
    const a = mk("1", undefined);
    const grouped = groupActivitiesByInstance([a]);
    expect(grouped.size).toBe(0);
  });
});
