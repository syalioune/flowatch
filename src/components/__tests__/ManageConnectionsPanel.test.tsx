// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for <ManageConnectionsPanel> (Story 23.1 — FR-49).
 * Asserts the SettingsModal Manage section renders the list, opens the 3
 * modals from row actions, and reflects activeId changes via the inline
 * select.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addConnection, loadConnections } from "../../lib/saved-connections";
import { ManageConnectionsPanel } from "../ManageConnectionsPanel";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("<ManageConnectionsPanel>", () => {
  it("renders the heading + default row + Add button", async () => {
    loadConnections();
    render(<ManageConnectionsPanel />);
    expect(await screen.findByTestId("manage-connections-heading")).toBeInTheDocument();
    const list = screen.getByTestId("saved-connections-list");
    expect(list.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByTestId("add-connection")).toBeInTheDocument();
  });

  it("Active badge appears on the active row", async () => {
    loadConnections();
    render(<ManageConnectionsPanel />);
    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("Add button opens the AddConnectionModal", async () => {
    loadConnections();
    const user = userEvent.setup();
    render(<ManageConnectionsPanel />);
    await user.click(await screen.findByTestId("add-connection"));
    expect(await screen.findByTestId("add-connection-modal")).toBeInTheDocument();
  });

  it("Edit button on a row opens the EditConnectionModal pre-populated", async () => {
    loadConnections();
    const added = addConnection({
      label: "Stage",
      baseUrl: "http://stage/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(<ManageConnectionsPanel />);
    await user.click(await screen.findByTestId(`edit-connection-${added.id}`));
    const label = (await screen.findByTestId("edit-connection-label")) as HTMLInputElement;
    expect(label.value).toBe("Stage");
  });

  it("Delete button opens DeleteConnectionModal with row metadata", async () => {
    loadConnections();
    const added = addConnection({
      label: "Doomed",
      baseUrl: "http://x/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(<ManageConnectionsPanel />);
    await user.click(await screen.findByTestId(`delete-connection-${added.id}`));
    const modal = await screen.findByTestId("delete-connection-modal");
    expect(modal).toBeInTheDocument();
    // "Doomed" appears in both the list row AND modal body; assert specifically inside the modal.
    expect(modal.textContent).toMatch(/Doomed/);
    expect(modal.textContent).toMatch(/http:\/\/x\/flowable-rest\/service/);
  });

  it("Active dropdown switches active connection + closes Settings via callback (AC-3)", async () => {
    loadConnections();
    const added = addConnection({
      label: "Stage",
      baseUrl: "http://stage/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    const onCloseSettings = vi.fn();
    render(<ManageConnectionsPanel onCloseSettings={onCloseSettings} />);
    const select = (await screen.findByTestId(
      "manage-connections-active-select",
    )) as HTMLSelectElement;
    await user.selectOptions(select, added.id);
    await waitFor(() => expect(loadConnections().activeId).toBe(added.id));
    expect(onCloseSettings).toHaveBeenCalledTimes(1);
  });
});
