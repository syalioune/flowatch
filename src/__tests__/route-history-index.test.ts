// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/history` route loader.
 *
 * Story 13.1 introduced the loader with a single `instances` branch + a
 * null fallback for the legacy shim. Story 13.3 extended it to dispatch
 * across three historic endpoints (instances + variables + tasks) plus a
 * null for the legacy `activities` tab (about to be removed in the
 * follow-up chore(refactor) commit).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadHistoryByType } from "../routes/history/index";

type ListInstancesFn = typeof apiModule.api.listHistoricInstances;
type ListVariablesFn = typeof apiModule.api.listHistoricVariables;
type ListTasksFn = typeof apiModule.api.listHistoricTasks;

describe("/history route loader", () => {
  const realInstances = apiModule.api.listHistoricInstances;
  const realVariables = apiModule.api.listHistoricVariables;
  const realTasks = apiModule.api.listHistoricTasks;
  let lastInstancesParams: unknown = null;
  let lastVariablesParams: unknown = null;
  let lastTasksParams: unknown = null;
  let instancesSpy: ReturnType<typeof vi.fn>;
  let variablesSpy: ReturnType<typeof vi.fn>;
  let tasksSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    lastInstancesParams = null;
    lastVariablesParams = null;
    lastTasksParams = null;
    instancesSpy = vi.fn((p: unknown) => {
      lastInstancesParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "endTime",
        order: "desc",
      });
    });
    variablesSpy = vi.fn((p: unknown) => {
      lastVariablesParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "name",
        order: "asc",
      });
    });
    tasksSpy = vi.fn((p: unknown) => {
      lastTasksParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "endTime",
        order: "desc",
      });
    });
    (apiModule.api as unknown as { listHistoricInstances: ListInstancesFn }).listHistoricInstances =
      instancesSpy as unknown as ListInstancesFn;
    (apiModule.api as unknown as { listHistoricVariables: ListVariablesFn }).listHistoricVariables =
      variablesSpy as unknown as ListVariablesFn;
    (apiModule.api as unknown as { listHistoricTasks: ListTasksFn }).listHistoricTasks =
      tasksSpy as unknown as ListTasksFn;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listHistoricInstances: ListInstancesFn }).listHistoricInstances =
      realInstances;
    (apiModule.api as unknown as { listHistoricVariables: ListVariablesFn }).listHistoricVariables =
      realVariables;
    (apiModule.api as unknown as { listHistoricTasks: ListTasksFn }).listHistoricTasks = realTasks;
  });

  it("AC-1 instances: calls listHistoricInstances with size=50, finished=true, sort=endTime, order=desc", async () => {
    const out = await loadHistoryByType("instances");
    expect(out).not.toBeNull();
    expect(lastInstancesParams).toEqual({
      size: 50,
      finished: true,
      sort: "endTime",
      order: "desc",
    });
    expect(variablesSpy).not.toHaveBeenCalled();
    expect(tasksSpy).not.toHaveBeenCalled();
  });

  it("AC-1 variables: calls listHistoricVariables with size=50", async () => {
    const out = await loadHistoryByType("variables");
    expect(out).not.toBeNull();
    expect(lastVariablesParams).toEqual({ size: 50 });
    expect(instancesSpy).not.toHaveBeenCalled();
    expect(tasksSpy).not.toHaveBeenCalled();
  });

  it("AC-1 tasks: calls listHistoricTasks with size=50 and finished=true", async () => {
    const out = await loadHistoryByType("tasks");
    expect(out).not.toBeNull();
    expect(lastTasksParams).toEqual({ size: 50, finished: true });
    expect(instancesSpy).not.toHaveBeenCalled();
    expect(variablesSpy).not.toHaveBeenCalled();
  });

  it("AC-1 activities (transition): returns null without calling any list endpoint (legacy shim handles it)", async () => {
    const out = await loadHistoryByType("activities");
    expect(out).toBeNull();
    expect(instancesSpy).not.toHaveBeenCalled();
    expect(variablesSpy).not.toHaveBeenCalled();
    expect(tasksSpy).not.toHaveBeenCalled();
  });
});
