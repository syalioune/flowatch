// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <CreateUserModal> (Story 22.1) — 20th modal in the
 * catalogue. Mirrors the <AddVariableModal> + <EditCategoryModal> retryable-
 * creation test shape. ARIA on day one (Epic 18.2 codification).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import { CreateUserModal } from "../create-user-modal";

describe("<CreateUserModal>", () => {
  const realCreate = api.createUser;
  let createSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createSpy = vi.fn();
    (api as unknown as { createUser: typeof api.createUser }).createUser =
      createSpy as unknown as typeof api.createUser;
  });

  afterEach(() => {
    (api as unknown as { createUser: typeof api.createUser }).createUser = realCreate;
    cleanup();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <CreateUserModal open={false} onClose={() => undefined} onSuccess={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(<CreateUserModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Create user" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "create-user-title");
    expect(screen.getByTestId("create-user-modal")).toBeInTheDocument();
  });

  it("renders five empty inputs and focuses the ID input on open", async () => {
    render(<CreateUserModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const id = (await screen.findByTestId("create-user-id")) as HTMLInputElement;
    expect((screen.getByTestId("create-user-first-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("create-user-last-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("create-user-email") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("create-user-password") as HTMLInputElement).value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(id));
  });

  it("Save is disabled while ID is empty or whitespace-only", async () => {
    const user = userEvent.setup();
    render(<CreateUserModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const submit = (await screen.findByTestId("create-user-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("create-user-id"), "   ");
    expect(submit).toBeDisabled();
    await user.clear(screen.getByTestId("create-user-id"));
    await user.type(screen.getByTestId("create-user-id"), "alice");
    expect(submit).not.toBeDisabled();
  });

  it("submits the full body and closes on success (retryable-creation contract)", async () => {
    createSpy.mockResolvedValue({ id: "alice", firstName: "Alice" });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CreateUserModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.type(await screen.findByTestId("create-user-id"), "alice");
    await user.type(screen.getByTestId("create-user-first-name"), "Alice");
    await user.type(screen.getByTestId("create-user-last-name"), "Smith");
    await user.type(screen.getByTestId("create-user-email"), "a@b.c");
    await user.type(screen.getByTestId("create-user-password"), "s3cret");
    await user.click(screen.getByTestId("create-user-submit"));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      id: "alice",
      firstName: "Alice",
      lastName: "Smith",
      email: "a@b.c",
      password: "s3cret",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits empty optional fields from the body (AC-7)", async () => {
    createSpy.mockResolvedValue({ id: "bob" });
    const user = userEvent.setup();
    render(<CreateUserModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("create-user-id"), "bob");
    await user.click(screen.getByTestId("create-user-submit"));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({ id: "bob" });
  });

  it("stays open on engine failure + renders verbatim ErrorBox + preserves form", async () => {
    createSpy.mockRejectedValue(new FlowableError("User id already exists", 409));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CreateUserModal open onClose={onClose} onSuccess={onSuccess} />);
    await user.type(await screen.findByTestId("create-user-id"), "dup");
    await user.type(screen.getByTestId("create-user-email"), "x@y");
    await user.click(screen.getByTestId("create-user-submit"));
    await waitFor(() => expect(screen.getByText("User id already exists")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect((screen.getByTestId("create-user-id") as HTMLInputElement).value).toBe("dup");
    expect((screen.getByTestId("create-user-email") as HTMLInputElement).value).toBe("x@y");
    expect(screen.getByTestId("create-user-modal")).toBeInTheDocument();
    expect(screen.getByTestId("open-inspector")).toBeInTheDocument();
  });

  it("Cancel closes without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Create user";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <CreateUserModal
        open
        onClose={onClose}
        onSuccess={() => undefined}
        triggerRef={triggerRef}
      />,
    );
    await screen.findByRole("heading", { name: "Create user" });
    await user.click(screen.getByTestId("create-user-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<CreateUserModal open onClose={onClose} onSuccess={() => undefined} />);
    await screen.findByRole("heading", { name: "Create user" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Save button while in-flight (busy state)", async () => {
    let resolveCreate: () => void = () => undefined;
    createSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<CreateUserModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("create-user-id"), "x");
    const submit = screen.getByTestId("create-user-submit") as HTMLButtonElement;
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent(/creating/i);
    resolveCreate();
  });

  it("resets all field state on re-open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <CreateUserModal open onClose={onClose} onSuccess={() => undefined} />,
    );
    await user.type(await screen.findByTestId("create-user-id"), "alice");
    rerender(<CreateUserModal open={false} onClose={onClose} onSuccess={() => undefined} />);
    rerender(<CreateUserModal open onClose={onClose} onSuccess={() => undefined} />);
    const id = (await screen.findByTestId("create-user-id")) as HTMLInputElement;
    expect(id.value).toBe("");
  });
});
