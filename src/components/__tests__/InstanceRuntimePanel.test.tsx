// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceRuntimePanel> (Story 13.1) — fourth panel-as-sibling
 * consumer. Covers AC-4: the four-state contract (loading / error / 404 → empty
 * / data) and the status-aware error-probe in `fetchRuntimeOrNull`.
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
import { api, FlowableError, type FlowableProcessInstance, type FlowableVariable } from "../../api";
import { fetchRuntimeOrNull, InstanceRuntimePanel } from "../InstanceRuntimePanel";

type GetInstanceFn = (id: string) => Promise<FlowableProcessInstance>;
type GetVarsFn = (id: string) => Promise<FlowableVariable[]>;
type ApiHost = {
  getProcessInstance: GetInstanceFn;
  getProcessInstanceVariables: GetVarsFn;
};

const RUNNING: FlowableProcessInstance = {
  id: "pi-1",
  processDefinitionId: "loanApproval:1:abc",
  processDefinitionKey: "loanApproval",
  businessKey: "BK-1",
  startTime: "2026-05-25T10:00:00.000Z",
};

const renderPanel = (id: string) => {
  const rootRoute = createRootRoute({
    component: () => <InstanceRuntimePanel instanceId={id} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
};

describe("fetchRuntimeOrNull status-aware probe", () => {
  const realGet = api.getProcessInstance;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as ApiHost).getProcessInstance = spy as unknown as GetInstanceFn;
  });

  afterEach(() => {
    (api as unknown as ApiHost).getProcessInstance = realGet;
  });

  it("returns the instance on success", async () => {
    spy.mockResolvedValue(RUNNING);
    const out = await fetchRuntimeOrNull("pi-1");
    expect(out).toEqual(RUNNING);
  });

  it("returns null on a 404 (instance has ended)", async () => {
    spy.mockRejectedValue(new FlowableError("Process instance not found", 404));
    const out = await fetchRuntimeOrNull("pi-gone");
    expect(out).toBeNull();
  });

  it("propagates non-404 engine errors", async () => {
    spy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchRuntimeOrNull("pi-1")).rejects.toThrow("Boom");
  });
});

describe("<InstanceRuntimePanel>", () => {
  const realGet = api.getProcessInstance;
  const realGetVars = api.getProcessInstanceVariables;
  let getSpy: ReturnType<typeof vi.fn>;
  let getVarsSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSpy = vi.fn();
    getVarsSpy = vi.fn().mockResolvedValue([]);
    (api as unknown as ApiHost).getProcessInstance = getSpy as unknown as GetInstanceFn;
    (api as unknown as ApiHost).getProcessInstanceVariables = getVarsSpy as unknown as GetVarsFn;
  });

  afterEach(() => {
    (api as unknown as ApiHost).getProcessInstance = realGet;
    (api as unknown as ApiHost).getProcessInstanceVariables = realGetVars;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    getSpy.mockReturnValue(new Promise(() => undefined));
    renderPanel("pi-1");
    await waitFor(() => expect(screen.getAllByTestId("table-skeleton").length).toBeGreaterThan(0));
  });

  it("renders the runtimeEnded empty state on a 404 (instance has ended)", async () => {
    getSpy.mockRejectedValue(new FlowableError("Process instance not found", 404));
    renderPanel("pi-gone");
    expect(await screen.findByText("This instance has ended.")).toBeInTheDocument();
    expect(screen.getByText(/historic record below/)).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 engine error", async () => {
    getSpy.mockRejectedValue(new FlowableError("Server explosion", 500));
    renderPanel("pi-1");
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("renders properties + Cancel button + variables panel on data", async () => {
    getSpy.mockResolvedValue(RUNNING);
    renderPanel("pi-1");
    expect(await screen.findByText("BK-1")).toBeInTheDocument();
    expect(screen.getByText("pi-1")).toBeInTheDocument();
    expect(screen.getByTestId("cancel-instance")).toBeInTheDocument();
    // Variables panel header
    expect(screen.getByText("Variables")).toBeInTheDocument();
  });

  it("omits Cancel button when the instance is already ended", async () => {
    getSpy.mockResolvedValue({ ...RUNNING, ended: true });
    renderPanel("pi-1");
    expect(await screen.findByText("BK-1")).toBeInTheDocument();
    expect(screen.queryByTestId("cancel-instance")).toBeNull();
  });
});
