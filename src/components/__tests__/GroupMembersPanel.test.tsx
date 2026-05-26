// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <GroupMembersPanel> (Story 14.2) — ninth panel-as-
 * sibling consumer. Mirrors the JobStacktracePanel / InstanceHistoric
 * ActivitiesPanel test shapes. Covers AC-5 four-state contract via
 * the `?memberOfGroup={id}` workaround.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowablePage, type FlowableUser } from "../../api";
import { GroupMembersPanel } from "../GroupMembersPanel";

type ListFn = typeof api.listGroupMembers;
type Host = { listGroupMembers: ListFn };

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));

const USERS: FlowableUser[] = [
  { id: "rest-admin", firstName: "Admin", lastName: "User", email: "admin@example.com" },
  { id: "mira", firstName: "Mira", lastName: "Ops", email: "mira@example.com" },
];

const page = (data: FlowableUser[]): FlowablePage<FlowableUser> => ({
  data,
  total: data.length,
  start: 0,
  size: 50,
  sort: "id",
  order: "asc",
});

describe("<GroupMembersPanel>", () => {
  const real = api.listGroupMembers;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listGroupMembers = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listGroupMembers = real;
    cleanup();
  });

  it("renders loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    render(<GroupMembersPanel groupId="admin" />);
    expect(await screen.findByTestId("group-members-panel")).toBeInTheDocument();
    // The TableSkeleton uses `role="presentation"` cells; we just assert
    // the panel exists in loading state with no rendered rows yet.
    expect(screen.queryAllByTestId(/^group-member-row-/)).toHaveLength(0);
  });

  it("renders the rows on success", async () => {
    spy.mockResolvedValue(page(USERS));
    render(<GroupMembersPanel groupId="admin" />);
    await waitFor(() =>
      expect(screen.getByTestId("group-member-row-rest-admin")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("group-member-row-mira")).toBeInTheDocument();
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith("admin", { size: 50 });
  });

  it("renders the empty state when the engine returns no members", async () => {
    spy.mockResolvedValue(page([]));
    render(<GroupMembersPanel groupId="admin" />);
    await waitFor(() => expect(screen.getByText("No members in this group.")).toBeInTheDocument());
  });

  it("renders ErrorBox on an engine error", async () => {
    spy.mockRejectedValue(new Error("Boom"));
    render(<GroupMembersPanel groupId="admin" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Boom/)).toBeInTheDocument();
  });

  it("re-fetches on Refresh", async () => {
    spy.mockResolvedValue(page(USERS));
    render(<GroupMembersPanel groupId="admin" />);
    await waitFor(() =>
      expect(screen.getByTestId("group-member-row-rest-admin")).toBeInTheDocument(),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    screen.getByTestId("group-members-refresh").click();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });
});
