// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceEventSubscriptionsPanel> — Story 24.2 (FR-54)
 * panel-as-sibling consumer. Covers the four-state contract, 404→null
 * empty-state, refresh affordance, View-all link, row markup.
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
import { api, FlowableError, type FlowableEventSubscription, type FlowablePage } from "../../api";
import {
  fetchEventSubscriptionsOrNull,
  InstanceEventSubscriptionsPanel,
} from "../InstanceEventSubscriptionsPanel";

type ListFn = typeof api.listEventSubscriptions;
type Host = { listEventSubscriptions: ListFn };

const SUB_MSG: FlowableEventSubscription = {
  id: "sub-msg",
  eventType: "message",
  eventName: "payment-confirmed",
  processInstanceId: "pi-1",
  activityId: "messageCatch_1",
  created: "2026-05-26T10:00:00.000Z",
};

const SUB_TIMER: FlowableEventSubscription = {
  id: "sub-timer",
  eventType: "timer",
  processInstanceId: "pi-1",
  activityId: "boundaryTimer_1",
  created: "2026-05-26T10:00:01.000Z",
};

const page = (data: FlowableEventSubscription[]): FlowablePage<FlowableEventSubscription> => ({
  data,
  total: data.length,
  start: 0,
  size: 50,
  sort: "created",
  order: "asc",
});

// Build a minimal in-memory router so the `<Link to="/events">` resolves.
function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const eventsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/events",
    component: () => <div>events</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, eventsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("fetchEventSubscriptionsOrNull status-aware probe", () => {
  const real = api.listEventSubscriptions;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listEventSubscriptions = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listEventSubscriptions = real;
  });

  it("forwards processInstanceId + size=50", async () => {
    spy.mockResolvedValue(page([SUB_MSG]));
    const out = await fetchEventSubscriptionsOrNull("pi-1");
    expect(out).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith({ processInstanceId: "pi-1", size: 50 });
  });

  it("returns null on a 404 (defensive)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    expect(await fetchEventSubscriptionsOrNull("pi-1")).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    spy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchEventSubscriptionsOrNull("pi-1")).rejects.toThrow("Boom");
  });
});

describe("<InstanceEventSubscriptionsPanel>", () => {
  const real = api.listEventSubscriptions;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listEventSubscriptions = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listEventSubscriptions = real;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders eventSubscriptionsForInstance empty-state when data is []", async () => {
    spy.mockResolvedValue(page([]));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    expect(
      await screen.findByText("This instance is not waiting on any external triggers."),
    ).toBeInTheDocument();
  });

  it("renders the empty state on a 404 (treated same as zero rows)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    expect(
      await screen.findByText("This instance is not waiting on any external triggers."),
    ).toBeInTheDocument();
  });

  it("renders <ErrorBox> on non-404 engine error", async () => {
    spy.mockRejectedValue(new FlowableError("Server explosion", 500));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("renders rows for message + timer subscriptions", async () => {
    spy.mockResolvedValue(page([SUB_MSG, SUB_TIMER]));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("payment-confirmed")).toBeInTheDocument());
    expect(screen.getByText("message")).toBeInTheDocument();
    expect(screen.getByText("timer")).toBeInTheDocument();
    expect(screen.getByTestId("event-subscription-row-sub-msg")).toBeInTheDocument();
    expect(screen.getByTestId("event-subscription-row-sub-timer")).toBeInTheDocument();
  });

  it("renders the row-count badge when data loads", async () => {
    spy.mockResolvedValue(page([SUB_MSG, SUB_TIMER]));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
  });

  it("View-all link routes to /events with processInstanceId search", async () => {
    spy.mockResolvedValue(page([]));
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    const link = await screen.findByTestId("event-subscriptions-view-all");
    expect(link).toHaveAttribute("href", expect.stringContaining("/events"));
    expect(link).toHaveAttribute("href", expect.stringContaining("processInstanceId=pi-1"));
  });

  it("Refresh button triggers a second fetch", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableEventSubscription>) => void;
    spy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableEventSubscription>>((res) => {
        resolveFirst = res;
      }),
    );
    renderWithRouter(<InstanceEventSubscriptionsPanel instanceId="pi-1" />);
    const btn = await screen.findByTestId("event-subscriptions-refresh");
    expect(btn).toBeDisabled();
    spy.mockResolvedValue(page([SUB_MSG]));
    resolveFirst(page([SUB_MSG]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
