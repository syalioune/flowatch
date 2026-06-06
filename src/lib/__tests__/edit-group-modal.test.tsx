// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <EditGroupModal> (Story 22.3) — 24th modal in the
 * catalogue. Mirrors <EditUserModal> retryable-creation + diff-empty shape.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableGroup } from "../../api";
import { EditGroupModal } from "../edit-group-modal";

const GROUP: FlowableGroup = { id: "g1", name: "G1", type: "assignment" };

describe("<EditGroupModal>", () => {
  const realUpdate = api.updateGroup;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSpy = vi.fn();
    (api as unknown as { updateGroup: typeof api.updateGroup }).updateGroup =
      updateSpy as unknown as typeof api.updateGroup;
  });

  afterEach(() => {
    (api as unknown as { updateGroup: typeof api.updateGroup }).updateGroup = realUpdate;
    cleanup();
  });

  it("renders nothing when group is null", () => {
    const { container } = render(<EditGroupModal group={null} onClose={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with ARIA on day one", async () => {
    render(<EditGroupModal group={GROUP} onClose={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Edit group" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "edit-group-title");
  });

  it("prefills inputs from group", async () => {
    render(<EditGroupModal group={GROUP} onClose={() => undefined} />);
    const name = (await screen.findByTestId("edit-group-name")) as HTMLInputElement;
    expect(name.value).toBe("G1");
    expect((screen.getByTestId("edit-group-type") as HTMLInputElement).value).toBe("assignment");
  });

  it("Save disabled while no diff", async () => {
    render(<EditGroupModal group={GROUP} onClose={() => undefined} />);
    const submit = (await screen.findByTestId("edit-group-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    expect(screen.queryByTestId("edit-group-no-changes")).toBeNull();
  });

  it("'No changes to save.' hint reveals after operator interacts and reverts", async () => {
    const user = userEvent.setup();
    render(<EditGroupModal group={GROUP} onClose={() => undefined} />);
    await user.type(await screen.findByTestId("edit-group-name"), "X");
    await user.clear(screen.getByTestId("edit-group-name"));
    await user.type(screen.getByTestId("edit-group-name"), "G1");
    expect(screen.getByTestId("edit-group-no-changes")).toBeInTheDocument();
  });

  it("submits diff and closes on success", async () => {
    updateSpy.mockResolvedValue({ ...GROUP, name: "G-prime" });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditGroupModal group={GROUP} onClose={onClose} onSuccess={onSuccess} />);
    const name = await screen.findByTestId("edit-group-name");
    await user.clear(name);
    await user.type(name, "G-prime");
    await user.click(screen.getByTestId("edit-group-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith("g1", { name: "G-prime" }));
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open on failure + renders ErrorBox", async () => {
    updateSpy.mockRejectedValue(new FlowableError("nope", 400));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditGroupModal group={GROUP} onClose={onClose} />);
    const name = await screen.findByTestId("edit-group-name");
    await user.clear(name);
    await user.type(name, "X");
    await user.click(screen.getByTestId("edit-group-submit"));
    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cancel restores focus to triggerRef", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditGroupModal group={GROUP} onClose={onClose} triggerRef={{ current: trigger }} />);
    await user.click(await screen.findByTestId("edit-group-cancel"));
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditGroupModal group={GROUP} onClose={onClose} />);
    await screen.findByRole("heading", { name: "Edit group" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("focuses name input on open", async () => {
    render(<EditGroupModal group={GROUP} onClose={() => undefined} />);
    const name = await screen.findByTestId("edit-group-name");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });
});
