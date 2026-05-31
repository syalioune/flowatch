// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeleteUserModal> (Story 22.2) — 22nd modal in the
 * catalogue, 6th alertdialog. FIRST cross-domain consumer of Story 19.2
 * `fallbackRef` pattern.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableUser } from "../../api";
import { DeleteUserModal } from "../delete-user-modal";

const USER: FlowableUser = {
  id: "alice",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.test",
};

const toastEvents: CustomEvent[] = [];
const onToast = (e: Event) => {
  toastEvents.push(e as CustomEvent);
};

describe("<DeleteUserModal>", () => {
  const realDelete = api.deleteUser;
  let deleteSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteSpy = vi.fn();
    (api as unknown as { deleteUser: typeof api.deleteUser }).deleteUser =
      deleteSpy as unknown as typeof api.deleteUser;
    toastEvents.length = 0;
    window.addEventListener("app:toast", onToast as EventListener);
  });

  afterEach(() => {
    (api as unknown as { deleteUser: typeof api.deleteUser }).deleteUser = realDelete;
    window.removeEventListener("app:toast", onToast as EventListener);
    cleanup();
  });

  it("renders nothing when user is null", () => {
    const { container } = render(
      <DeleteUserModal user={null} onClose={() => undefined} onSettled={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the alertdialog with ARIA contract on day one (Epic 18.2 destructive variant)", async () => {
    render(<DeleteUserModal user={USER} onClose={() => undefined} onSettled={() => undefined} />);
    const dialog = await screen.findByRole("alertdialog", { name: "Delete user?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "delete-user-title");
    expect(screen.getByTestId("delete-user-modal")).toBeInTheDocument();
  });

  it("renders the user id, full name, and email in the confirmation body", async () => {
    render(<DeleteUserModal user={USER} onClose={() => undefined} onSettled={() => undefined} />);
    await screen.findByRole("heading", { name: "Delete user?" });
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText(/Alice Smith/)).toBeInTheDocument();
    expect(screen.getByText(/alice@example.test/)).toBeInTheDocument();
  });

  it("fires success toast + onSettled + closes on success", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(<DeleteUserModal user={USER} onClose={onClose} onSettled={onSettled} />);
    await user.click(await screen.findByTestId("delete-user-submit"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("alice"));
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const detail = toastEvents[0]?.detail as { kind?: string; text?: string };
    expect(detail.kind).toBe("ok");
    expect(detail.text).toContain("Deleted user alice");
  });

  it("fires failure toast + onSettled + closes on engine error (one-shot destructive)", async () => {
    deleteSpy.mockRejectedValue(new FlowableError("user has dependents", 409));
    const onClose = vi.fn();
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(<DeleteUserModal user={USER} onClose={onClose} onSettled={onSettled} />);
    await user.click(await screen.findByTestId("delete-user-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSettled).toHaveBeenCalledTimes(1);
    const detail = toastEvents[0]?.detail as { kind?: string; text?: string; sub?: string };
    expect(detail.kind).toBe("err");
    expect(detail.text).toContain("Failed to delete user alice");
    expect(detail.sub).toBe("user has dependents");
  });

  it("Cancel closes without calling the wrapper + restores focus", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Delete";
    document.body.appendChild(trigger);
    const user = userEvent.setup();
    render(
      <DeleteUserModal
        user={USER}
        onClose={onClose}
        onSettled={() => undefined}
        triggerRef={{ current: trigger }}
      />,
    );
    await user.click(await screen.findByTestId("delete-user-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("falls back to fallbackRef when triggerRef detaches (cross-domain N=1)", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const trigger = document.createElement("button");
    trigger.textContent = "Detail trigger";
    document.body.appendChild(trigger);
    const fallback = document.createElement("button");
    fallback.textContent = "Topbar identity";
    document.body.appendChild(fallback);

    const onClose = vi.fn();
    const onSettled = vi.fn(() => {
      // Simulate parent navigating away → trigger unmounts.
      trigger.remove();
    });
    const user = userEvent.setup();
    render(
      <DeleteUserModal
        user={USER}
        onClose={onClose}
        onSettled={onSettled}
        triggerRef={{ current: trigger }}
        fallbackRef={{ current: fallback }}
      />,
    );
    await user.click(await screen.findByTestId("delete-user-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DeleteUserModal user={USER} onClose={onClose} onSettled={() => undefined} />);
    await screen.findByRole("heading", { name: "Delete user?" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Delete button is disabled while in-flight", async () => {
    let resolveDelete: () => void = () => undefined;
    deleteSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<DeleteUserModal user={USER} onClose={() => undefined} onSettled={() => undefined} />);
    const submit = (await screen.findByTestId("delete-user-submit")) as HTMLButtonElement;
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent(/deleting/i);
    resolveDelete();
  });
});
