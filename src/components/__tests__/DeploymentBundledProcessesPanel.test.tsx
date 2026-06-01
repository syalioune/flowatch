// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeploymentBundledProcessesPanel> — Story 25.1 panel-as-sibling
 * consumer. Covers the four-state contract + the empty-as-null short-circuit
 * + the row-click navigation + the Refresh affordance.
 */

import "@testing-library/jest-dom/vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowablePage, type FlowableProcessDefinition } from "../../api";
import { DeploymentBundledProcessesPanel } from "../DeploymentBundledProcessesPanel";

type ListFn = typeof api.listProcessDefinitions;
type Host = { listProcessDefinitions: ListFn };

const PROC: FlowableProcessDefinition = {
  id: "loanProcess:1:abc",
  key: "loanProcess",
  name: "Loan process",
  version: 1,
  deploymentId: "dep-1",
};

const page = (data: FlowableProcessDefinition[]): FlowablePage<FlowableProcessDefinition> => ({
  data,
  total: data.length,
  start: 0,
  size: 200,
  sort: "id",
  order: "asc",
});

function renderWithRouter(deploymentId: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <DeploymentBundledProcessesPanel deploymentId={deploymentId} />,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/definitions/$id",
    component: () => <div data-testid="def-detail">def detail</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, detailRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("<DeploymentBundledProcessesPanel>", () => {
  const real = api.listProcessDefinitions;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listProcessDefinitions = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listProcessDefinitions = real;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    renderWithRouter("dep-1");
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("returns null when data is empty [] (deployments without BPMN stay unchanged)", async () => {
    spy.mockResolvedValue(page([]));
    const { container } = renderWithRouter("dep-1");
    await waitFor(() => expect(spy).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="deployment-bundled-processes-panel"]'),
      ).toBeNull(),
    );
  });

  it("renders <ErrorBox> when the wrapper rejects", async () => {
    spy.mockRejectedValue(new FlowableError("Engine 500", 500));
    renderWithRouter("dep-1");
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
  });

  it("renders the Name / Key / Version / ID columns", async () => {
    spy.mockResolvedValue(page([PROC]));
    renderWithRouter("dep-1");
    expect(await screen.findByText("Loan process")).toBeInTheDocument();
    expect(screen.getByText("loanProcess")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("loanProcess:1:abc")).toBeInTheDocument();
  });

  it("renders the endpoint hint with the deploymentId interpolated", async () => {
    spy.mockResolvedValue(page([PROC]));
    renderWithRouter("dep-1");
    await waitFor(() =>
      expect(screen.getByText(/GET .*process-definitions\?deploymentId=dep-1/)).toBeInTheDocument(),
    );
  });

  it("navigates to /definitions/$id on row click", async () => {
    spy.mockResolvedValue(page([PROC]));
    renderWithRouter("dep-1");
    const row = await screen.findByTestId("bundled-process-row-loanProcess:1:abc");
    fireEvent.click(row);
    expect(await screen.findByTestId("def-detail")).toBeInTheDocument();
  });

  it("navigates to /definitions/$id on Enter keypress", async () => {
    spy.mockResolvedValue(page([PROC]));
    renderWithRouter("dep-1");
    const row = await screen.findByTestId("bundled-process-row-loanProcess:1:abc");
    fireEvent.keyDown(row, { key: "Enter" });
    expect(await screen.findByTestId("def-detail")).toBeInTheDocument();
  });

  it("Refresh button triggers a second fetch", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableProcessDefinition>) => void;
    spy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableProcessDefinition>>((res) => {
        resolveFirst = res;
      }),
    );
    renderWithRouter("dep-1");
    const btn = await screen.findByTestId("bundled-processes-refresh");
    expect(btn).toBeDisabled();
    spy.mockResolvedValue(page([PROC]));
    resolveFirst(page([PROC]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("anchors the panel container with data-testid='deployment-bundled-processes-panel'", async () => {
    spy.mockResolvedValue(page([PROC]));
    renderWithRouter("dep-1");
    await waitFor(() =>
      expect(screen.getByTestId("deployment-bundled-processes-panel")).toBeInTheDocument(),
    );
  });
});
