// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceHistoricActivitiesPanel> (Story 13.2) — sixth
 * panel-as-sibling consumer. Covers AC-2 (four-state contract), AC-3
 * (timeline render + assignee handling), AC-4 (status-aware probe +
 * 200-row cap note), AC-5 (Refresh behaviour).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableHistoricActivity, type FlowablePage } from "../../api";
import {
  fetchActivitiesOrNull,
  InstanceHistoricActivitiesPanel,
} from "../InstanceHistoricActivitiesPanel";

type ListFn = typeof api.listHistoricActivities;
type Host = { listHistoricActivities: ListFn };

const ACT_START: FlowableHistoricActivity = {
  id: "act-1",
  activityId: "startEvent_1",
  activityName: "Start",
  activityType: "startEvent",
  processInstanceId: "pi-1",
  startTime: "2026-05-25T10:00:00.000Z",
  endTime: "2026-05-25T10:00:01.000Z",
  durationInMillis: 1_000,
};

const ACT_USER_TASK: FlowableHistoricActivity = {
  id: "act-2",
  activityId: "approval",
  activityName: "Approve loan",
  activityType: "userTask",
  processInstanceId: "pi-1",
  startTime: "2026-05-25T10:00:01.000Z",
  endTime: "2026-05-25T10:05:00.000Z",
  durationInMillis: 299_000,
};

const ACT_END: FlowableHistoricActivity = {
  id: "act-3",
  activityId: "endEvent_1",
  activityName: "End",
  activityType: "endEvent",
  processInstanceId: "pi-1",
  startTime: "2026-05-25T10:05:00.000Z",
  endTime: "2026-05-25T10:05:00.001Z",
  durationInMillis: 1,
};

const page = (data: FlowableHistoricActivity[]): FlowablePage<FlowableHistoricActivity> => ({
  data,
  total: data.length,
  start: 0,
  size: 200,
  sort: "startTime",
  order: "asc",
});

describe("fetchActivitiesOrNull status-aware probe", () => {
  const real = api.listHistoricActivities;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listHistoricActivities = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listHistoricActivities = real;
  });

  it("returns the data array on success", async () => {
    spy.mockResolvedValue(page([ACT_START, ACT_USER_TASK]));
    const out = await fetchActivitiesOrNull("pi-1");
    expect(out).toHaveLength(2);
    expect(spy).toHaveBeenCalledWith({
      processInstanceId: "pi-1",
      size: 200,
      sort: "startTime",
    });
  });

  it("returns null on a 404 (defensive — the engine usually returns empty data)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    const out = await fetchActivitiesOrNull("pi-1");
    expect(out).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    spy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchActivitiesOrNull("pi-1")).rejects.toThrow("Boom");
  });
});

describe("<InstanceHistoricActivitiesPanel>", () => {
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
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders the empty state when data is empty []", async () => {
    spy.mockResolvedValue(page([]));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    expect(
      await screen.findByText("No recorded activities for this instance yet."),
    ).toBeInTheDocument();
  });

  it("renders the empty state on a 404 (data === null)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    expect(
      await screen.findByText("No recorded activities for this instance yet."),
    ).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 engine error", async () => {
    spy.mockRejectedValue(new FlowableError("Server explosion", 500));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("renders the timeline with one row per activity (mixed types)", async () => {
    spy.mockResolvedValue(page([ACT_START, ACT_USER_TASK, ACT_END]));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    await waitFor(() =>
      expect(screen.getByTestId("historic-activities-timeline")).toBeInTheDocument(),
    );
    expect(screen.getByText("Start")).toBeInTheDocument();
    expect(screen.getByText("Approve loan")).toBeInTheDocument();
    expect(screen.getByText("End")).toBeInTheDocument();
  });

  it("renders the assignee segment for userTask activities", async () => {
    type ActivityWithAssignee = FlowableHistoricActivity & { assignee?: string };
    const taskWithAssignee: ActivityWithAssignee = { ...ACT_USER_TASK, assignee: "alice" };
    spy.mockResolvedValue(page([taskWithAssignee as FlowableHistoricActivity]));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText(/assignee: alice/)).toBeInTheDocument());
  });

  it("renders '(in progress)' instead of a duration for activities without endTime", async () => {
    const ongoing: FlowableHistoricActivity = { ...ACT_USER_TASK };
    delete (ongoing as { endTime?: string }).endTime;
    delete (ongoing as { durationInMillis?: number }).durationInMillis;
    spy.mockResolvedValue(page([ongoing]));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    expect(await screen.findByText("(in progress)")).toBeInTheDocument();
  });

  it("renders the cap note when the engine returns exactly 200 rows", async () => {
    const rows: FlowableHistoricActivity[] = Array.from({ length: 200 }, (_, i) => ({
      ...ACT_START,
      id: `act-${i}`,
      activityId: `step_${i}`,
      activityName: `Step ${i}`,
    }));
    spy.mockResolvedValue(page(rows));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("historic-activities-cap-note")).toBeInTheDocument();
    // Row-count badge shows the actual count (200).
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("omits the cap note when the engine returns fewer than 200 rows", async () => {
    spy.mockResolvedValue(page([ACT_START, ACT_USER_TASK]));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("Start")).toBeInTheDocument());
    expect(screen.queryByTestId("historic-activities-cap-note")).toBeNull();
  });

  it("Refresh button triggers a second fetch and is disabled while loading", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableHistoricActivity>) => void;
    spy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableHistoricActivity>>((res) => {
        resolveFirst = res;
      }),
    );
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    const btn = await screen.findByTestId("historic-activities-refresh");
    expect(btn).toBeDisabled();
    spy.mockResolvedValue(page([ACT_START]));
    resolveFirst(page([ACT_START]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("anchors the panel with data-testid='instance-historic-activities-panel'", async () => {
    spy.mockResolvedValue(page([ACT_START]));
    render(<InstanceHistoricActivitiesPanel instanceId="pi-1" />);
    await waitFor(() =>
      expect(screen.getByTestId("instance-historic-activities-panel")).toBeInTheDocument(),
    );
  });
});
