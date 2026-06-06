// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeleteVariableModal> (Story 19.2).
 *
 * Covers the one-shot destructive contract — close on BOTH success and
 * failure; toast outcome; ARIA = alertdialog (destructive variant per
 * Epic 18.2 codification); focus-restore to triggerRef.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import { DeleteVariableModal } from "../delete-variable-modal";

const toastEvents: CustomEvent[] = [];
const onToast = (e: Event) => {
  toastEvents.push(e as CustomEvent);
};

describe("<DeleteVariableModal>", () => {
  const realDelete = api.deleteInstanceVariable;
  let deleteSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteSpy = vi.fn();
    (
      api as unknown as { deleteInstanceVariable: typeof api.deleteInstanceVariable }
    ).deleteInstanceVariable = deleteSpy as unknown as typeof api.deleteInstanceVariable;
    toastEvents.length = 0;
    window.addEventListener("app:toast", onToast as EventListener);
  });

  afterEach(() => {
    (
      api as unknown as { deleteInstanceVariable: typeof api.deleteInstanceVariable }
    ).deleteInstanceVariable = realDelete;
    window.removeEventListener("app:toast", onToast as EventListener);
    cleanup();
  });

  it("renders nothing when variable is null", () => {
    const { container } = render(
      <DeleteVariableModal variable={null} instanceId="pi-1" onClose={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the alertdialog with ARIA contract on day one (Epic 18.2 destructive variant)", async () => {
    render(
      <DeleteVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete variable?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "delete-variable-title");
  });

  it("renders the variable's name, type, and value preview", async () => {
    render(
      <DeleteVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={() => undefined}
      />,
    );
    await screen.findByText("Delete variable?");
    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.getByText("integer")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
  });

  it("calls deleteInstanceVariable, fires success toast, closes on success", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );
    await user.click(await screen.findByTestId("delete-variable-submit"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith("pi-1", "amount");
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Toast event fired (the project's toast() dispatches an app:toast event).
    expect(toastEvents.length).toBeGreaterThan(0);
    const detail = toastEvents[0]?.detail as { kind?: string; text?: string };
    expect(detail.kind).toBe("ok");
    expect(detail.text).toContain("Variable amount deleted");
  });

  it("fires failure toast + closes anyway on engine error (one-shot destructive)", async () => {
    deleteSpy.mockRejectedValue(new FlowableError("not found", 404));
    const onClose = vi.fn();
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteVariableModal
        variable={{ name: "ghost", value: null, type: "string" }}
        instanceId="pi-1"
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );
    await user.click(await screen.findByTestId("delete-variable-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onDeleted).not.toHaveBeenCalled();
    const detail = toastEvents[0]?.detail as { kind?: string; text?: string; sub?: string };
    expect(detail.kind).toBe("err");
    expect(detail.text).toContain("Failed to delete variable ghost");
    expect(detail.sub).toBe("not found");
  });

  it("Cancel closes without calling the wrapper + restores focus", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <DeleteVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
        triggerRef={triggerRef}
      />,
    );
    await user.click(await screen.findByTestId("delete-variable-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Review patch: focus falls back to fallbackRef when trigger has been removed", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const trigger = document.createElement("button");
    trigger.textContent = "Row trigger";
    document.body.appendChild(trigger);
    const fallback = document.createElement("button");
    fallback.textContent = "Add variable";
    document.body.appendChild(fallback);

    const onClose = vi.fn();
    const onDeleted = vi.fn(() => {
      // Simulate the panel reload removing the row that owned the trigger.
      trigger.remove();
    });
    const user = userEvent.setup();
    render(
      <DeleteVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
        onDeleted={onDeleted}
        triggerRef={{ current: trigger }}
        fallbackRef={{ current: fallback }}
      />,
    );
    await user.click(await screen.findByTestId("delete-variable-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    // Trigger is detached — focus should fall back to the still-mounted fallback.
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteVariableModal
        variable={{ name: "amount", value: 1000, type: "integer" }}
        instanceId="pi-1"
        onClose={onClose}
      />,
    );
    await screen.findByText("Delete variable?");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
