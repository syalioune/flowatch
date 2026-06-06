// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <CreateGroupModal> (Story 22.3) — 23rd modal in the
 * catalogue. Mirrors <CreateUserModal> retryable-creation shape.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import { CreateGroupModal } from "../create-group-modal";

describe("<CreateGroupModal>", () => {
  const realCreate = api.createGroup;
  let createSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createSpy = vi.fn();
    (api as unknown as { createGroup: typeof api.createGroup }).createGroup =
      createSpy as unknown as typeof api.createGroup;
  });

  afterEach(() => {
    (api as unknown as { createGroup: typeof api.createGroup }).createGroup = realCreate;
    cleanup();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <CreateGroupModal open={false} onClose={() => undefined} onSuccess={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with ARIA contract on day one", async () => {
    render(<CreateGroupModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Create group" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "create-group-title");
  });

  it("Save disabled while ID is empty", async () => {
    const user = userEvent.setup();
    render(<CreateGroupModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const submit = (await screen.findByTestId("create-group-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("create-group-id"), "g1");
    expect(submit).not.toBeDisabled();
  });

  it("submits full body and closes on success", async () => {
    createSpy.mockResolvedValue({ id: "g1", name: "G1", type: "assignment" });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.type(await screen.findByTestId("create-group-id"), "g1");
    await user.type(screen.getByTestId("create-group-name"), "G1");
    await user.type(screen.getByTestId("create-group-type"), "assignment");
    await user.click(screen.getByTestId("create-group-submit"));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith({ id: "g1", name: "G1", type: "assignment" });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("omits empty optional fields from body", async () => {
    createSpy.mockResolvedValue({ id: "g2" });
    const user = userEvent.setup();
    render(<CreateGroupModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("create-group-id"), "g2");
    await user.click(screen.getByTestId("create-group-submit"));
    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith({ id: "g2" });
  });

  it("stays open on engine failure + renders ErrorBox + preserves form", async () => {
    createSpy.mockRejectedValue(new FlowableError("Group exists", 409));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal open onClose={onClose} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("create-group-id"), "dup");
    await user.click(screen.getByTestId("create-group-submit"));
    await waitFor(() => expect(screen.getByText("Group exists")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId("create-group-id") as HTMLInputElement).value).toBe("dup");
  });

  it("Cancel restores focus to triggerRef", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <CreateGroupModal
        open
        onClose={onClose}
        onSuccess={() => undefined}
        triggerRef={{ current: trigger }}
      />,
    );
    await user.click(await screen.findByTestId("create-group-cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateGroupModal open onClose={onClose} onSuccess={() => undefined} />);
    await screen.findByRole("heading", { name: "Create group" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("focuses ID input on open", async () => {
    render(<CreateGroupModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const id = await screen.findByTestId("create-group-id");
    await waitFor(() => expect(document.activeElement).toBe(id));
  });
});
