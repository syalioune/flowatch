// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceHistoricPanel> (Story 13.1) — fifth panel-as-sibling
 * consumer. Covers AC-5: the four-state contract (loading / error / 404 → empty
 * / data) and the status-aware error-probe in `fetchHistoricOrNull`.
 */

import "@testing-library/jest-dom/vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableHistoricProcessInstance } from "../../api";
import { fetchHistoricOrNull, InstanceHistoricPanel } from "../InstanceHistoricPanel";

type GetFn = (id: string) => Promise<FlowableHistoricProcessInstance>;
type Host = { getHistoricProcessInstance: GetFn };

const ENDED: FlowableHistoricProcessInstance = {
  id: "pi-1",
  processDefinitionId: "loanApproval:1:abc",
  processDefinitionKey: "loanApproval",
  businessKey: "BK-1",
  startTime: "2026-05-25T10:00:00.000Z",
  endTime: "2026-05-25T10:05:00.000Z",
  durationInMillis: 300_000,
};

const renderPanel = (id: string) => {
  const rootRoute = createRootRoute({
    component: () => <InstanceHistoricPanel instanceId={id} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
};

describe("fetchHistoricOrNull status-aware probe", () => {
  const real = api.getHistoricProcessInstance;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).getHistoricProcessInstance = spy as unknown as GetFn;
  });

  afterEach(() => {
    (api as unknown as Host).getHistoricProcessInstance = real;
  });

  it("returns the historic record on success", async () => {
    spy.mockResolvedValue(ENDED);
    const out = await fetchHistoricOrNull("pi-1");
    expect(out).toEqual(ENDED);
  });

  it("returns null on a 404 (instance is still running, no archived record)", async () => {
    spy.mockRejectedValue(new FlowableError("Historic instance not found", 404));
    const out = await fetchHistoricOrNull("pi-running");
    expect(out).toBeNull();
  });

  it("propagates non-404 engine errors", async () => {
    spy.mockRejectedValue(new FlowableError("Database hiccup", 500));
    await expect(fetchHistoricOrNull("pi-1")).rejects.toThrow("Database hiccup");
  });
});

describe("<InstanceHistoricPanel>", () => {
  const real = api.getHistoricProcessInstance;
  const realListVars = api.listHistoricVariables;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).getHistoricProcessInstance = spy as unknown as GetFn;
    // The data branch mounts <InstanceHistoricVariablesPanel> which fires
    // listHistoricVariables; stub to an empty page so the existing
    // assertions stay focused on the historic-record properties table.
    vi.spyOn(api, "listHistoricVariables").mockResolvedValue({
      data: [],
      total: 0,
      start: 0,
      size: 200,
      sort: "variableName",
      order: "asc",
    });
  });

  afterEach(() => {
    (api as unknown as Host).getHistoricProcessInstance = real;
    api.listHistoricVariables = realListVars;
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    renderPanel("pi-1");
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders the historicNoRecord empty state on a 404", async () => {
    spy.mockRejectedValue(new FlowableError("Historic instance not found", 404));
    renderPanel("pi-running");
    expect(await screen.findByText("No historic record yet.")).toBeInTheDocument();
    expect(screen.getByText(/still running/)).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 engine error", async () => {
    spy.mockRejectedValue(new FlowableError("Server explosion", 500));
    renderPanel("pi-1");
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("renders the historic property rows on data + an 'ended' badge", async () => {
    spy.mockResolvedValue(ENDED);
    renderPanel("pi-1");
    expect(await screen.findByText("BK-1")).toBeInTheDocument();
    expect(screen.getByText("pi-1")).toBeInTheDocument();
    // Definition is rendered as a Link
    expect(screen.getByText("loanApproval")).toBeInTheDocument();
    // Duration formatted via fmtMs — 300000ms == "5m"
    expect(screen.getByText("5m")).toBeInTheDocument();
    // Badge tone
    expect(screen.getByText("ended")).toBeInTheDocument();
  });

  it("renders a 'historic' badge when endTime is missing (lifecycle archived but not ended)", async () => {
    spy.mockResolvedValue({ ...ENDED, endTime: undefined });
    renderPanel("pi-1");
    await waitFor(() => expect(screen.getByText("BK-1")).toBeInTheDocument());
    expect(screen.getByText("historic")).toBeInTheDocument();
    expect(screen.queryByText("ended")).toBeNull();
  });

  it("anchors the panel with data-testid='historic-instance-panel' for E2E", async () => {
    spy.mockResolvedValue(ENDED);
    renderPanel("pi-1");
    await waitFor(() => expect(screen.getByTestId("historic-instance-panel")).toBeInTheDocument());
  });
});
