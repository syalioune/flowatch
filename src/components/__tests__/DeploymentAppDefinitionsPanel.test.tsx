// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeploymentAppDefinitionsPanel> — Story 25.1 panel-as-sibling
 * consumer. Covers the four-state contract + the empty-as-null short-circuit
 * + the panel-title pluralization + the Refresh affordance.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableAppDefinition, FlowableError, type FlowablePage } from "../../api";
import { DeploymentAppDefinitionsPanel } from "../DeploymentAppDefinitionsPanel";

type ListFn = typeof api.listAppDefinitions;
type Host = { listAppDefinitions: ListFn };

const APP_LOAN: FlowableAppDefinition = {
  id: "app-1",
  key: "loan-app",
  name: "Loan App",
  version: 3,
  deploymentId: "dep-1",
  tenantId: "",
};

const APP_BILLING: FlowableAppDefinition = {
  id: "app-2",
  key: "billing-app",
  name: "Billing App",
  version: 1,
  deploymentId: "dep-1",
};

const page = (data: FlowableAppDefinition[]): FlowablePage<FlowableAppDefinition> => ({
  data,
  total: data.length,
  start: 0,
  size: 50,
  sort: "id",
  order: "asc",
});

describe("<DeploymentAppDefinitionsPanel>", () => {
  const real = api.listAppDefinitions;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listAppDefinitions = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listAppDefinitions = real;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("returns null when data is empty [] (non-app deployments stay visually unchanged)", async () => {
    spy.mockResolvedValue(page([]));
    const { container } = render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // The panel rendered loading initially, then unmounts itself to null.
    await waitFor(() =>
      expect(
        container.querySelector('[data-testid="deployment-app-definitions-panel"]'),
      ).toBeNull(),
    );
  });

  it("renders <ErrorBox> when the wrapper rejects", async () => {
    spy.mockRejectedValue(new FlowableError("Server boom", 500));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server boom/)).toBeInTheDocument();
  });

  it("renders the metadata row with Name + Key + Version + Tenant cells", async () => {
    spy.mockResolvedValue(page([APP_LOAN]));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    expect(await screen.findByText("Loan App")).toBeInTheDocument();
    expect(screen.getByText("loan-app")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("uses singular 'App definition' title when only one row is present", async () => {
    spy.mockResolvedValue(page([APP_LOAN]));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    expect(await screen.findByText("App definition")).toBeInTheDocument();
  });

  it("uses plural 'App definitions' title when multiple rows are present", async () => {
    spy.mockResolvedValue(page([APP_LOAN, APP_BILLING]));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    expect(await screen.findByText("App definitions")).toBeInTheDocument();
  });

  it("renders the endpoint hint with the deploymentId interpolated", async () => {
    spy.mockResolvedValue(page([APP_LOAN]));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    await waitFor(() =>
      expect(screen.getByText(/GET .*app-definitions\?deploymentId=dep-1/)).toBeInTheDocument(),
    );
  });

  it("Refresh button triggers a second fetch and disables while loading", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableAppDefinition>) => void;
    spy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableAppDefinition>>((res) => {
        resolveFirst = res;
      }),
    );
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    const btn = await screen.findByTestId("app-definitions-refresh");
    expect(btn).toBeDisabled();
    spy.mockResolvedValue(page([APP_LOAN]));
    resolveFirst(page([APP_LOAN]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("anchors each row with data-testid='app-definition-row-{id}'", async () => {
    spy.mockResolvedValue(page([APP_LOAN]));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    expect(await screen.findByTestId("app-definition-row-app-1")).toBeInTheDocument();
  });

  it("anchors the panel container with data-testid='deployment-app-definitions-panel'", async () => {
    spy.mockResolvedValue(page([APP_LOAN]));
    render(<DeploymentAppDefinitionsPanel deploymentId="dep-1" />);
    await waitFor(() =>
      expect(screen.getByTestId("deployment-app-definitions-panel")).toBeInTheDocument(),
    );
  });
});
