// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-tier suite for <DeploymentDetail> — Story 9.6 Resources panel.
 *
 * Authored as `.spec.tsx` (browser tier / Chromium) so the test mounts the
 * component inside a real TanStack Router context without distorting the
 * unit-tier per-file coverage gate on src/components.tsx (which the jsdom
 * tier measures). The four-state panel + Download flow is the contract.
 */

import "@testing-library/jest-dom/vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  type FlowableDecision,
  type FlowableDeployment,
  FlowableError,
  type FlowablePage,
  type FlowableResource,
} from "../../api";
import { DeploymentDetail } from "../DeploymentDetail";

const deployment: FlowableDeployment = {
  id: "dep-1",
  name: "orders.bpmn",
  deploymentTime: "2026-05-24T12:00:00.000Z",
  tenantId: "",
};

const resources: FlowableResource[] = [
  { id: "orders.bpmn", mediaType: "application/xml" },
  { id: "orders-form.json", mediaType: "application/json" },
];

type ListFn = (id: string) => Promise<FlowableResource[]>;
type DownloadFn = (deploymentId: string, resourceName: string) => Promise<Response>;
type ListDecisionsFn = (params: {
  deploymentId: string;
  size?: number;
}) => Promise<FlowablePage<FlowableDecision>>;
type GetDmnDecisionResourceFn = (decisionId: string) => Promise<string>;
type Host = {
  listDeploymentResources: ListFn;
  getDeploymentResource: DownloadFn;
  listDecisions: ListDecisionsFn;
  getDmnDecisionResource: GetDmnDecisionResourceFn;
};

const renderDetail = (kind: "bpmn" | "dmn" = "bpmn") => {
  const rootRoute = createRootRoute({
    component: () => <DeploymentDetail deployment={deployment} kind={kind} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
};

const collectToasts = () => {
  const toasts: Array<{ kind?: string; text: string; sub?: string }> = [];
  const handler = (e: Event) =>
    toasts.push((e as CustomEvent<{ kind?: string; text: string; sub?: string }>).detail);
  window.addEventListener("app:toast", handler as EventListener);
  return {
    toasts,
    dispose: () => window.removeEventListener("app:toast", handler as EventListener),
  };
};

describe("<DeploymentDetail> Resources panel (Story 9.6)", () => {
  const realList = api.listDeploymentResources;
  const realDownload = api.getDeploymentResource;
  const realListDecisions = api.listDecisions;
  const realGetDmnDecisionResource = api.getDmnDecisionResource;
  let listSpy: ReturnType<typeof vi.fn>;
  let downloadSpy: ReturnType<typeof vi.fn>;
  let listDecisionsSpy: ReturnType<typeof vi.fn>;
  let getDmnDecisionResourceSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listSpy = vi.fn();
    downloadSpy = vi.fn();
    listDecisionsSpy = vi.fn();
    getDmnDecisionResourceSpy = vi.fn();
    (api as unknown as Host).listDeploymentResources = listSpy as unknown as ListFn;
    (api as unknown as Host).getDeploymentResource = downloadSpy as unknown as DownloadFn;
    (api as unknown as Host).listDecisions = listDecisionsSpy as unknown as ListDecisionsFn;
    (api as unknown as Host).getDmnDecisionResource =
      getDmnDecisionResourceSpy as unknown as GetDmnDecisionResourceFn;
  });

  afterEach(() => {
    (api as unknown as Host).listDeploymentResources = realList;
    (api as unknown as Host).getDeploymentResource = realDownload;
    (api as unknown as Host).listDecisions = realListDecisions;
    (api as unknown as Host).getDmnDecisionResource = realGetDmnDecisionResource;
    cleanup();
  });

  it("renders <TableSkeleton> while resources are loading", async () => {
    listSpy.mockReturnValue(new Promise<FlowableResource[]>(() => {}));
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders <ErrorBox> when listing fails", async () => {
    listSpy.mockRejectedValue(new FlowableError("Resources fetch failed", 500));
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("error-box")).toBeInTheDocument());
    expect(screen.getByText("Resources fetch failed")).toBeInTheDocument();
  });

  it("renders the canonical EmptyState when resources is empty", async () => {
    listSpy.mockResolvedValue([]);
    renderDetail();
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
    expect(screen.getByText("No resources.")).toBeInTheDocument();
    expect(screen.getByText(/deployments typically bundle/)).toBeInTheDocument();
  });

  it("renders one <tr> per resource with a Download button", async () => {
    listSpy.mockResolvedValue(resources);
    renderDetail();
    await waitFor(() =>
      expect(screen.getByTestId("deployment-resources-table")).toBeInTheDocument(),
    );
    expect(screen.getAllByTestId("download-resource")).toHaveLength(2);
    // The resource names live inside <tr data-resource-id> rows; assert via the
    // row scope so we don't collide with the PageHead title (which also reads
    // deployment.name = "orders.bpmn").
    const row1 = screen.getByRole("row", { name: /^orders\.bpmn/ });
    expect(row1).toBeInTheDocument();
    const row2 = screen.getByRole("row", { name: /^orders-form\.json/ });
    expect(row2).toBeInTheDocument();
  });

  it("clicking Download streams the blob and triggers an anchor click with the original filename", async () => {
    listSpy.mockResolvedValue(resources);
    downloadSpy.mockResolvedValue(new Response("xml-bytes", { status: 200 }));

    // Spy on the blob/anchor primitives.
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;

    const realCreateElement = document.createElement.bind(document);
    const anchorClick = vi.fn();
    const anchorRef: { current: HTMLAnchorElement | null } = { current: null };
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation((tag: string, opts?: ElementCreationOptions) => {
        const el = realCreateElement(tag, opts);
        if (tag === "a") {
          anchorRef.current = el as HTMLAnchorElement;
          (anchorRef.current as unknown as { click: () => void }).click = anchorClick;
        }
        return el;
      });

    try {
      const user = userEvent.setup();
      renderDetail();
      await waitFor(() =>
        expect(screen.getByTestId("deployment-resources-table")).toBeInTheDocument(),
      );
      const buttons = screen.getAllByTestId("download-resource");
      const firstButton = buttons[0];
      if (!firstButton) throw new Error("first download button missing");
      await user.click(firstButton);
      await waitFor(() => expect(downloadSpy).toHaveBeenCalled());
      expect(downloadSpy).toHaveBeenCalledWith("dep-1", "orders.bpmn");
      expect(createObjectURL).toHaveBeenCalled();
      expect(anchorRef.current?.download).toBe("orders.bpmn");
      expect(anchorClick).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      createElementSpy.mockRestore();
    }
  });

  it("kind='dmn' lists decisions via /dmn-repository/decision-tables?deploymentId=, NOT /resources", async () => {
    listDecisionsSpy.mockResolvedValue({
      data: [
        {
          id: "dec-1",
          key: "loanEligibility",
          name: "Loan Eligibility",
          version: 1,
          deploymentId: "dep-1",
        },
      ],
      total: 1,
      start: 0,
      size: 200,
      sort: "name",
      order: "asc",
    });
    renderDetail("dmn");
    await waitFor(() =>
      expect(screen.getByTestId("deployment-decisions-table")).toBeInTheDocument(),
    );
    expect(listDecisionsSpy).toHaveBeenCalledWith({ deploymentId: "dep-1", size: 200 });
    // The BPMN /resources wrapper must NOT have fired — that endpoint 500s
    // on the DMN sub-app.
    expect(listSpy).not.toHaveBeenCalled();
    // The endpoint hint in the panel header reflects the decision-tables URL.
    expect(
      screen.getByText(/\/dmn-repository\/decision-tables\?deploymentId=dep-1/),
    ).toBeInTheDocument();
    // Row carries decision-key for navigation + Decision detail link.
    expect(screen.getByText("loanEligibility")).toBeInTheDocument();
  });

  it("kind='dmn' Download streams the XML via getDmnDecisionResource by decision id", async () => {
    listDecisionsSpy.mockResolvedValue({
      data: [
        {
          id: "dec-1",
          key: "loanEligibility",
          name: "Loan Eligibility",
          version: 1,
          deploymentId: "dep-1",
        } as FlowableDecision & { resourceName?: string },
      ],
      total: 1,
      start: 0,
      size: 200,
      sort: "name",
      order: "asc",
    });
    getDmnDecisionResourceSpy.mockResolvedValue("<dmn/>");
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
    try {
      const user = userEvent.setup();
      renderDetail("dmn");
      await waitFor(() =>
        expect(screen.getByTestId("deployment-decisions-table")).toBeInTheDocument(),
      );
      await user.click(screen.getAllByTestId("download-decision")[0] as HTMLElement);
      await waitFor(() => expect(getDmnDecisionResourceSpy).toHaveBeenCalled());
      expect(getDmnDecisionResourceSpy).toHaveBeenCalledWith("dec-1");
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it("Download failure emits an error toast and keeps the panel intact", async () => {
    listSpy.mockResolvedValue(resources);
    downloadSpy.mockRejectedValue(new FlowableError("Resource not found", 404));
    const toastCollector = collectToasts();
    try {
      const user = userEvent.setup();
      renderDetail();
      await waitFor(() =>
        expect(screen.getByTestId("deployment-resources-table")).toBeInTheDocument(),
      );
      const buttons = screen.getAllByTestId("download-resource");
      const first = buttons[0];
      if (!first) throw new Error("first download button missing");
      await user.click(first);
      await waitFor(() => expect(toastCollector.toasts.length).toBeGreaterThan(0));
      expect(toastCollector.toasts.at(-1)).toMatchObject({
        kind: "err",
        text: "Download failed",
        sub: "Resource not found",
      });
    } finally {
      toastCollector.dispose();
    }
  });
});
