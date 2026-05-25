// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceActiveActivitiesPanel> — eighth panel-as-sibling
 * consumer. Covers the four-state contract, the `finished=false` query
 * param, the row rendering for active activities, and the Refresh
 * affordance.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableHistoricActivity, type FlowablePage } from "../../api";
import {
  fetchActiveActivitiesOrNull,
  InstanceActiveActivitiesPanel,
} from "../InstanceActiveActivitiesPanel";

type ListFn = typeof api.listHistoricActivities;
type Host = { listHistoricActivities: ListFn };

const ACT_USER_TASK: FlowableHistoricActivity = {
  id: "act-1",
  activityId: "approval",
  activityName: "Approve loan",
  activityType: "userTask",
  processInstanceId: "pi-1",
  startTime: "2026-05-26T10:00:00.000Z",
};

const ACT_PARALLEL: FlowableHistoricActivity = {
  id: "act-2",
  activityId: "parallelGateway_1",
  activityName: "Parallel join",
  activityType: "parallelGateway",
  processInstanceId: "pi-1",
  startTime: "2026-05-26T10:00:01.000Z",
};

const page = (data: FlowableHistoricActivity[]): FlowablePage<FlowableHistoricActivity> => ({
  data,
  total: data.length,
  start: 0,
  size: 50,
  sort: "startTime",
  order: "asc",
});

describe("fetchActiveActivitiesOrNull status-aware probe", () => {
  const real = api.listHistoricActivities;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listHistoricActivities = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listHistoricActivities = real;
  });

  it("forwards the processInstanceId + finished=false + size + sort params", async () => {
    spy.mockResolvedValue(page([ACT_USER_TASK]));
    const out = await fetchActiveActivitiesOrNull("pi-1");
    expect(out).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith({
      processInstanceId: "pi-1",
      finished: false,
      size: 50,
      sort: "startTime",
    });
  });

  it("returns null on a 404 (defensive)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    expect(await fetchActiveActivitiesOrNull("pi-1")).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    spy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchActiveActivitiesOrNull("pi-1")).rejects.toThrow("Boom");
  });
});

describe("<InstanceActiveActivitiesPanel>", () => {
  const real = api.listHistoricActivities;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listHistoricActivities = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listHistoricActivities = real;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders the activeActivities empty state when data is empty []", async () => {
    spy.mockResolvedValue(page([]));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    expect(await screen.findByText("No active activities right now.")).toBeInTheDocument();
  });

  it("renders the empty state on a 404 (treated same as zero rows)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    expect(await screen.findByText("No active activities right now.")).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 engine error", async () => {
    spy.mockRejectedValue(new FlowableError("Server explosion", 500));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("renders multiple active activities as table rows (parallel-branch case)", async () => {
    spy.mockResolvedValue(page([ACT_USER_TASK, ACT_PARALLEL]));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("Approve loan")).toBeInTheDocument());
    expect(screen.getByText("Parallel join")).toBeInTheDocument();
    expect(screen.getByText("userTask")).toBeInTheDocument();
    expect(screen.getByText("parallelGateway")).toBeInTheDocument();
    // Row count badge in the header.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders the assignee column when an active userTask carries one", async () => {
    type Wide = FlowableHistoricActivity & { assignee?: string };
    const withAssignee: Wide = { ...ACT_USER_TASK, assignee: "alice" };
    spy.mockResolvedValue(page([withAssignee as FlowableHistoricActivity]));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("alice")).toBeInTheDocument());
  });

  it("Refresh button triggers a second fetch and is disabled while loading", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableHistoricActivity>) => void;
    spy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableHistoricActivity>>((res) => {
        resolveFirst = res;
      }),
    );
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    const btn = await screen.findByTestId("active-activities-refresh");
    expect(btn).toBeDisabled();
    spy.mockResolvedValue(page([ACT_USER_TASK]));
    resolveFirst(page([ACT_USER_TASK]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("anchors the panel with data-testid='instance-active-activities-panel'", async () => {
    spy.mockResolvedValue(page([ACT_USER_TASK]));
    render(<InstanceActiveActivitiesPanel instanceId="pi-1" />);
    await waitFor(() =>
      expect(screen.getByTestId("instance-active-activities-panel")).toBeInTheDocument(),
    );
  });
});
