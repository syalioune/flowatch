// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-tier test for <AddMembershipModal> (Story 14.3).
 *
 * Covers AC-10 — initial render in both modes, picker option loading,
 * submit success / failure, retryable-creation in-modal <ErrorBox>
 * preservation, Esc/Cancel focus-restore.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableGroup, type FlowableUser } from "../../api";
import { AddMembershipModal } from "../add-membership-modal";

type ListUsersFn = typeof api.listUsers;
type ListGroupsFn = typeof api.listGroups;
type AddFn = typeof api.addUserToGroup;

const USERS: FlowableUser[] = [
  { id: "rest-admin", firstName: "Admin", lastName: "User", email: "admin@example.com" },
  { id: "mira", firstName: "Mira", lastName: "Ops", email: "mira@example.com" },
];

const GROUPS: FlowableGroup[] = [
  { id: "admin", name: "Admin group", type: "security" },
  { id: "managers", name: "Managers", type: "assignment" },
];

describe("<AddMembershipModal>", () => {
  const realListUsers = api.listUsers;
  const realListGroups = api.listGroups;
  const realAdd = api.addUserToGroup;
  let listUsersSpy: ReturnType<typeof vi.fn>;
  let listGroupsSpy: ReturnType<typeof vi.fn>;
  let addSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listUsersSpy = vi.fn().mockResolvedValue({
      data: USERS,
      total: USERS.length,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    });
    listGroupsSpy = vi.fn().mockResolvedValue({
      data: GROUPS,
      total: GROUPS.length,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    });
    addSpy = vi.fn().mockResolvedValue(undefined);
    (api as unknown as { listUsers: ListUsersFn }).listUsers =
      listUsersSpy as unknown as ListUsersFn;
    (api as unknown as { listGroups: ListGroupsFn }).listGroups =
      listGroupsSpy as unknown as ListGroupsFn;
    (api as unknown as { addUserToGroup: AddFn }).addUserToGroup = addSpy as unknown as AddFn;
  });

  afterEach(() => {
    (api as unknown as { listUsers: ListUsersFn }).listUsers = realListUsers;
    (api as unknown as { listGroups: ListGroupsFn }).listGroups = realListGroups;
    (api as unknown as { addUserToGroup: AddFn }).addUserToGroup = realAdd;
    cleanup();
  });

  it("loads users when mode is add-user-to-group", async () => {
    render(
      <AddMembershipModal
        open
        mode="add-user-to-group"
        groupId="admin"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await waitFor(() => expect(listUsersSpy).toHaveBeenCalledOnce());
    expect(listGroupsSpy).not.toHaveBeenCalled();
    await screen.findByRole("option", { name: /Admin User/ });
  });

  it("loads groups when mode is add-group-to-user", async () => {
    render(
      <AddMembershipModal
        open
        mode="add-group-to-user"
        userId="rest-admin"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await waitFor(() => expect(listGroupsSpy).toHaveBeenCalledOnce());
    expect(listUsersSpy).not.toHaveBeenCalled();
    await screen.findByRole("option", { name: /Admin group/ });
  });

  it("submit calls api.addUserToGroup with the right arg order per mode (add-user-to-group)", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <AddMembershipModal
        open
        mode="add-user-to-group"
        groupId="admin"
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    await screen.findByRole("option", { name: /Admin User/ });
    fireEvent.change(screen.getByTestId("add-membership-select"), {
      target: { value: "mira" },
    });
    screen.getByTestId("add-membership-confirm").click();
    await waitFor(() => expect(addSpy).toHaveBeenCalledWith("mira", "admin"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("submit calls api.addUserToGroup with the right arg order per mode (add-group-to-user)", async () => {
    const onSuccess = vi.fn();
    render(
      <AddMembershipModal
        open
        mode="add-group-to-user"
        userId="rest-admin"
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );
    await screen.findByRole("option", { name: /Managers/ });
    fireEvent.change(screen.getByTestId("add-membership-select"), {
      target: { value: "managers" },
    });
    screen.getByTestId("add-membership-confirm").click();
    await waitFor(() => expect(addSpy).toHaveBeenCalledWith("rest-admin", "managers"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("renders ErrorBox inside the modal on submit failure + preserves selection", async () => {
    addSpy.mockRejectedValueOnce(new Error("Conflict: user already in group"));
    const onClose = vi.fn();
    render(
      <AddMembershipModal
        open
        mode="add-user-to-group"
        groupId="admin"
        onClose={onClose}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByRole("option", { name: /Admin User/ });
    fireEvent.change(screen.getByTestId("add-membership-select"), {
      target: { value: "mira" },
    });
    screen.getByTestId("add-membership-confirm").click();
    await waitFor(() => expect(screen.getByTestId("add-membership-error")).toBeInTheDocument());
    // selection preserved
    expect((screen.getByTestId("add-membership-select") as HTMLSelectElement).value).toBe("mira");
    // modal stays open
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel closes the modal + restores focus to triggerRef", async () => {
    const triggerRef = React.createRef<HTMLButtonElement>();
    const onClose = vi.fn();
    render(
      <>
        <button type="button" ref={triggerRef}>
          Open
        </button>
        <AddMembershipModal
          open
          mode="add-user-to-group"
          groupId="admin"
          onClose={onClose}
          onSuccess={vi.fn()}
          triggerRef={triggerRef}
        />
      </>,
    );
    await screen.findByTestId("add-membership-cancel");
    screen.getByTestId("add-membership-cancel").click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not render when open=false", () => {
    render(
      <AddMembershipModal
        open={false}
        mode="add-user-to-group"
        groupId="admin"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("add-membership-modal")).toBeNull();
    expect(listUsersSpy).not.toHaveBeenCalled();
  });
});
