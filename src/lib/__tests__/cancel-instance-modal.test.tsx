// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <CancelInstanceModal> (Story 10.3).
 *
 * Covers AC-3 (textarea), AC-4 (with/without deleteReason), AC-5 (success
 * toast + onSettled), AC-6 (failure toast with verbatim engine message +
 * onSettled still fires), AC-7 (Esc / Cancel / backdrop close;
 * busy-suppression), AC-10 (triggerRef focus-restore), AC-12 (button
 * labels).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableProcessInstance } from "../../api";
import { CancelInstanceModal } from "../cancel-instance-modal";

const sampleInstance: FlowableProcessInstance = {
  id: "pi-1",
  processDefinitionId: "loan:1:abc",
  processDefinitionKey: "loan",
  businessKey: "order-42",
  startTime: "2026-05-24T12:00:00.000Z",
};

type DeleteFn = (id: string, reason?: string) => Promise<void>;
type DeleteHost = { deleteProcessInstance: DeleteFn };

const collectToasts = () => {
  const toasts: Array<{ kind?: string; text: string; sub?: string }> = [];
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ kind?: string; text: string; sub?: string }>).detail;
    toasts.push(detail);
  };
  window.addEventListener("app:toast", handler as EventListener);
  return {
    toasts,
    dispose: () => window.removeEventListener("app:toast", handler as EventListener),
  };
};

describe("<CancelInstanceModal>", () => {
  const realDelete = api.deleteProcessInstance;
  let deleteSpy: ReturnType<typeof vi.fn>;
  let toastCollector: ReturnType<typeof collectToasts>;

  beforeEach(() => {
    deleteSpy = vi.fn();
    (api as unknown as DeleteHost).deleteProcessInstance = deleteSpy as unknown as DeleteFn;
    toastCollector = collectToasts();
  });

  afterEach(() => {
    (api as unknown as DeleteHost).deleteProcessInstance = realDelete;
    toastCollector.dispose();
    cleanup();
  });

  it("renders nothing when instance is null", () => {
    render(<CancelInstanceModal instance={null} onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(screen.queryByTestId("cancel-instance-modal")).toBeNull();
  });

  it("renders the business key, id, definition key, and the reason textarea", () => {
    render(<CancelInstanceModal instance={sampleInstance} onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(screen.getByText("order-42")).toBeInTheDocument();
    expect(screen.getByText("pi-1")).toBeInTheDocument();
    expect(screen.getByText("loan")).toBeInTheDocument();
    const textarea = screen.getByTestId("cancel-instance-reason");
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("submit with empty reason calls deleteProcessInstance(id) WITHOUT second arg", async () => {
    const user = userEvent.setup();
    deleteSpy.mockResolvedValue(undefined);
    const onSettled = vi.fn();
    const onClose = vi.fn();
    render(
      <CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={onSettled} />,
    );
    await user.click(screen.getByTestId("cancel-instance-modal-confirm"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(deleteSpy).toHaveBeenCalledWith("pi-1");
    expect(deleteSpy.mock.calls[0]?.length).toBe(1);
    expect(onSettled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(toastCollector.toasts.at(-1)).toMatchObject({
      kind: "ok",
      text: "Cancelled: order-42",
    });
  });

  it("submit with non-empty reason threads the trimmed value", async () => {
    const user = userEvent.setup();
    deleteSpy.mockResolvedValue(undefined);
    render(<CancelInstanceModal instance={sampleInstance} onClose={vi.fn()} onSettled={vi.fn()} />);
    fireEvent.change(screen.getByTestId("cancel-instance-reason"), {
      target: { value: "  duplicate run  " },
    });
    await user.click(screen.getByTestId("cancel-instance-modal-confirm"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(deleteSpy).toHaveBeenCalledWith("pi-1", "duplicate run");
  });

  it("failure emits err toast with verbatim engine message + STILL fires onSettled + closes", async () => {
    const user = userEvent.setup();
    deleteSpy.mockRejectedValue(new FlowableError("Instance not found", 404));
    const onSettled = vi.fn();
    const onClose = vi.fn();
    render(
      <CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={onSettled} />,
    );
    await user.click(screen.getByTestId("cancel-instance-modal-confirm"));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastCollector.toasts.at(-1)).toMatchObject({
      kind: "err",
      text: "Cancel failed",
      sub: "Instance not found",
    });
  });

  it("Cancel button closes without calling API", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={vi.fn()} />);
    await user.click(screen.getByTestId("cancel-instance-modal-cancel"));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    render(<CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click closes; panel click does not", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={vi.fn()} />);
    await user.click(screen.getByTestId("cancel-instance-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    await user.click(screen.getByText("Cancel process instance"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("busy state disables both action buttons + textarea; Escape suppressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveDelete!: () => void;
    deleteSpy.mockReturnValue(
      new Promise<void>((res) => {
        resolveDelete = res;
      }),
    );
    render(<CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={vi.fn()} />);
    await user.click(screen.getByTestId("cancel-instance-modal-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("cancel-instance-modal-confirm")).toHaveTextContent("Cancelling…"),
    );
    expect(screen.getByTestId("cancel-instance-reason")).toBeDisabled();
    expect(screen.getByTestId("cancel-instance-modal-cancel")).toBeDisabled();
    expect(screen.getByTestId("cancel-instance-modal-confirm")).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    resolveDelete();
  });

  it("reason resets when a new instance is set", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CancelInstanceModal instance={sampleInstance} onClose={vi.fn()} onSettled={vi.fn()} />,
    );
    await user.type(screen.getByTestId("cancel-instance-reason"), "first try");
    expect((screen.getByTestId("cancel-instance-reason") as HTMLTextAreaElement).value).toBe(
      "first try",
    );
    rerender(
      <CancelInstanceModal
        instance={{ ...sampleInstance, id: "pi-2", businessKey: "other" }}
        onClose={vi.fn()}
        onSettled={vi.fn()}
      />,
    );
    expect((screen.getByTestId("cancel-instance-reason") as HTMLTextAreaElement).value).toBe("");
  });

  it("restores focus to triggerRef.current after Cancel (AC-10)", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Open Cancel";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <CancelInstanceModal
        instance={sampleInstance}
        onClose={vi.fn()}
        onSettled={vi.fn()}
        triggerRef={triggerRef}
      />,
    );
    await user.click(screen.getByTestId("cancel-instance-modal-cancel"));
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });

  it("does not throw when no triggerRef is provided and the modal closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CancelInstanceModal instance={sampleInstance} onClose={onClose} onSettled={vi.fn()} />);
    await user.click(screen.getByTestId("cancel-instance-modal-cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
