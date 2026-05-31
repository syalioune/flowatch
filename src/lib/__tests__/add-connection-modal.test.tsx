// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for <AddConnectionModal> (Story 23.1) — 26th modal.
 * Mirrors `<CreateUserModal>` retryable-creation test shape. ARIA on day one.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddConnectionModal } from "../add-connection-modal";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("<AddConnectionModal>", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <AddConnectionModal open={false} onClose={() => undefined} onSuccess={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with ARIA contract (Epic 18.2)", async () => {
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Add connection" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "add-connection-title");
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
  });

  it("focuses the Label input on open", async () => {
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const label = (await screen.findByTestId("add-connection-label")) as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(label));
  });

  it("Save disabled while label or baseUrl is empty", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    const submit = (await screen.findByTestId("add-connection-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("add-connection-label"), "Staging");
    expect(submit).toBeDisabled();
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://staging/flowable-rest/service",
    );
    expect(submit).not.toBeDisabled();
  });

  it("submit happy path → onSuccess + onClose; persisted shape includes id", async () => {
    // Seed migration so addConnection() doesn't re-trigger inside the modal.
    let createdId: string | null = null;
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={() => undefined}
        onSuccess={(c) => {
          createdId = c.id;
        }}
      />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Local");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://localhost:8081/flowable-rest/service",
    );
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(createdId).not.toBeNull());
    const raw = localStorage.getItem("flowatch.connections.v1");
    expect(raw).not.toBeNull();
    expect(
      JSON.parse(raw as string).connections.some((c: { id: string }) => c.id === createdId),
    ).toBe(true);
  });

  it("label collision → inline ErrorBox + modal stays open + form preserved", async () => {
    // Pre-seed via the wrapper so the modal sees an existing "Local" label.
    const { addConnection, loadConnections } = await import("../saved-connections");
    loadConnections();
    addConnection({
      label: "Local",
      baseUrl: "http://x/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
    });
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Local");
    await user.type(
      screen.getByTestId("add-connection-base-url"),
      "http://y/flowable-rest/service",
    );
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() =>
      expect(screen.getByText(/Label 'Local' is already in use/)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
    expect((screen.getByTestId("add-connection-label") as HTMLInputElement).value).toBe("Local");
  });

  it("invalid URL → inline ErrorBox + modal stays open", async () => {
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={() => undefined} onSuccess={() => undefined} />);
    await user.type(await screen.findByTestId("add-connection-label"), "Bad");
    await user.type(screen.getByTestId("add-connection-base-url"), "not-a-url");
    await user.click(screen.getByTestId("add-connection-submit"));
    await waitFor(() => expect(screen.getByText("Invalid URL")).toBeInTheDocument());
    expect(screen.getByTestId("add-connection-modal")).toBeInTheDocument();
  });

  it("Cancel restores focus to triggerRef + does not submit", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <AddConnectionModal
        open
        onClose={onClose}
        onSuccess={() => undefined}
        triggerRef={triggerRef}
      />,
    );
    await user.click(await screen.findByTestId("add-connection-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddConnectionModal open onClose={onClose} onSuccess={() => undefined} />);
    await screen.findByRole("heading", { name: "Add connection" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets state on re-open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(
      <AddConnectionModal open onClose={onClose} onSuccess={() => undefined} />,
    );
    await user.type(await screen.findByTestId("add-connection-label"), "Junk");
    rerender(<AddConnectionModal open={false} onClose={onClose} onSuccess={() => undefined} />);
    rerender(<AddConnectionModal open onClose={onClose} onSuccess={() => undefined} />);
    const label = (await screen.findByTestId("add-connection-label")) as HTMLInputElement;
    expect(label.value).toBe("");
  });
});
