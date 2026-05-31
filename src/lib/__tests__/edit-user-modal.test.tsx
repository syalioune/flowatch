// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <EditUserModal> (Story 22.2) — 21st modal in the catalogue.
 * Mirrors the <EditTaskModal> diff-empty no-op shape; password is special-
 * cased (empty → omit; non-empty → always include).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableUser } from "../../api";
import { EditUserModal } from "../edit-user-modal";

const USER: FlowableUser = {
  id: "alice",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.test",
};

describe("<EditUserModal>", () => {
  const realUpdate = api.updateUser;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSpy = vi.fn();
    (api as unknown as { updateUser: typeof api.updateUser }).updateUser =
      updateSpy as unknown as typeof api.updateUser;
  });

  afterEach(() => {
    (api as unknown as { updateUser: typeof api.updateUser }).updateUser = realUpdate;
    cleanup();
  });

  it("renders nothing when user is null", () => {
    const { container } = render(<EditUserModal user={null} onClose={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Edit user" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "edit-user-title");
    expect(screen.getByTestId("edit-user-modal")).toBeInTheDocument();
  });

  it("prefills inputs from user; password stays empty; ID shown read-only", async () => {
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    const first = (await screen.findByTestId("edit-user-first-name")) as HTMLInputElement;
    expect(first.value).toBe("Alice");
    expect((screen.getByTestId("edit-user-last-name") as HTMLInputElement).value).toBe("Smith");
    expect((screen.getByTestId("edit-user-email") as HTMLInputElement).value).toBe(
      "alice@example.test",
    );
    expect((screen.getByTestId("edit-user-password") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("alice")).toBeInTheDocument();
  });

  it("focuses the firstName input on open", async () => {
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    const first = await screen.findByTestId("edit-user-first-name");
    await waitFor(() => expect(document.activeElement).toBe(first));
  });

  it("Save is disabled with no diff (pristine + diff-empty)", async () => {
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    const submit = (await screen.findByTestId("edit-user-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    // No-changes hint hidden while pristine.
    expect(screen.queryByTestId("edit-user-no-changes")).toBeNull();
  });

  it("shows 'No changes to save.' hint once operator edits then reverts", async () => {
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    await user.type(await screen.findByTestId("edit-user-first-name"), "X");
    await user.clear(screen.getByTestId("edit-user-first-name"));
    await user.type(screen.getByTestId("edit-user-first-name"), "Alice");
    expect(screen.getByTestId("edit-user-no-changes")).toBeInTheDocument();
    expect(screen.getByTestId("edit-user-submit")).toBeDisabled();
  });

  it("submits the diff and closes on success", async () => {
    updateSpy.mockResolvedValue({ ...USER, firstName: "Alicia", email: "alicia@x" });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={onClose} onSuccess={onSuccess} />);
    const first = await screen.findByTestId("edit-user-first-name");
    await user.clear(first);
    await user.type(first, "Alicia");
    const email = screen.getByTestId("edit-user-email");
    await user.clear(email);
    await user.type(email, "alicia@x");
    await user.click(screen.getByTestId("edit-user-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("alice", {
      firstName: "Alicia",
      email: "alicia@x",
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("includes password in body when typed (always, regardless of diff)", async () => {
    updateSpy.mockResolvedValue(USER);
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    await user.type(await screen.findByTestId("edit-user-password"), "new-pw");
    await user.click(screen.getByTestId("edit-user-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy).toHaveBeenCalledWith("alice", { password: "new-pw" });
  });

  it("omits password from body when input stays empty", async () => {
    updateSpy.mockResolvedValue(USER);
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={() => undefined} />);
    const first = await screen.findByTestId("edit-user-first-name");
    await user.clear(first);
    await user.type(first, "Alicia");
    await user.click(screen.getByTestId("edit-user-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy).toHaveBeenCalledWith("alice", { firstName: "Alicia" });
  });

  it("stays open on engine failure + renders ErrorBox + preserves form", async () => {
    updateSpy.mockRejectedValue(new FlowableError("invalid email", 400));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={onClose} />);
    const email = await screen.findByTestId("edit-user-email");
    await user.clear(email);
    await user.type(email, "bogus");
    await user.click(screen.getByTestId("edit-user-submit"));
    await waitFor(() => expect(screen.getByText("invalid email")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId("edit-user-email") as HTMLInputElement).value).toBe("bogus");
    expect(screen.getByTestId("open-inspector")).toBeInTheDocument();
  });

  it("Cancel closes without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Edit";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={onClose} triggerRef={triggerRef} />);
    await screen.findByRole("heading", { name: "Edit user" });
    await user.click(screen.getByTestId("edit-user-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditUserModal user={USER} onClose={onClose} />);
    await screen.findByRole("heading", { name: "Edit user" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
