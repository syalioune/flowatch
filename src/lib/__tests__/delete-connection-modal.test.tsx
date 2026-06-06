// SPDX-License-Identifier: Apache-2.0

/**
 * Component suite for <DeleteConnectionModal> (Story 23.1) — 28th modal,
 * 9th alertdialog. Divergent one-shot destructive shape: active-connection
 * guard renders inline ErrorBox + keeps modal open (per spec divergence
 * note).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteConnectionModal } from "../delete-connection-modal";
import { addConnection, loadConnections, type SavedConnection } from "../saved-connections";

const seedTwo = (): { active: SavedConnection; other: SavedConnection } => {
  const state = loadConnections();
  const active = state.connections[0] as SavedConnection;
  const other = addConnection({
    label: "Other",
    baseUrl: "http://o/flowable-rest/service",
    username: "",
    password: "",
    tenantId: "",
  });
  return { active, other };
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  cleanup();
});

describe("<DeleteConnectionModal>", () => {
  it("renders nothing when connection is null", () => {
    const { container } = render(
      <DeleteConnectionModal
        open
        connection={null}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders alertdialog with ARIA contract (Epic 18.2)", async () => {
    const { other } = seedTwo();
    render(
      <DeleteConnectionModal
        open
        connection={other}
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete connection" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "delete-connection-title");
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText(other.baseUrl)).toBeInTheDocument();
  });

  it("Delete on a non-active row calls deleteConnection + onSuccess + onClose", async () => {
    const { other } = seedTwo();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteConnectionModal open connection={other} onClose={onClose} onSuccess={onSuccess} />,
    );
    await user.click(await screen.findByTestId("delete-connection-confirm"));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(loadConnections().connections.find((c) => c.id === other.id)).toBeUndefined();
  });

  it("active-connection guard renders inline ErrorBox + modal stays open", async () => {
    const { active } = seedTwo();
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteConnectionModal open connection={active} onClose={onClose} onSuccess={onSuccess} />,
    );
    await user.click(await screen.findByTestId("delete-connection-confirm"));
    await waitFor(() =>
      expect(
        screen.getByText(/Cannot delete the active connection\. Switch active first\./),
      ).toBeInTheDocument(),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("delete-connection-modal")).toBeInTheDocument();
  });

  it("Cancel restores triggerRef focus + does not delete", async () => {
    const { other } = seedTwo();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteConnectionModal
        open
        connection={other}
        onClose={onClose}
        onSuccess={() => undefined}
        triggerRef={triggerRef}
      />,
    );
    await user.click(await screen.findByTestId("delete-connection-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    expect(loadConnections().connections.find((c) => c.id === other.id)).toBeTruthy();
    trigger.remove();
  });

  it("successful delete falls back to fallbackRef when triggerRef detaches", async () => {
    const { other } = seedTwo();
    const trigger = document.createElement("button");
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    const triggerRef = { current: trigger };
    const fallbackRef = { current: fallback };
    const user = userEvent.setup();
    render(
      <DeleteConnectionModal
        open
        connection={other}
        onClose={() => undefined}
        onSuccess={() => undefined}
        triggerRef={triggerRef}
        fallbackRef={fallbackRef}
      />,
    );
    await user.click(await screen.findByTestId("delete-connection-confirm"));
    await waitFor(() => expect(document.activeElement).toBe(fallback));
    fallback.remove();
  });

  it("Esc closes the modal", async () => {
    const { other } = seedTwo();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteConnectionModal
        open
        connection={other}
        onClose={onClose}
        onSuccess={() => undefined}
      />,
    );
    await screen.findByRole("heading", { name: "Delete connection" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
