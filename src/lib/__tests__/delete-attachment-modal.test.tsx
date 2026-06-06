// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeleteAttachmentModal> (Story 21.3) — 19th modal in the
 * catalogue, 5th instance of the one-shot-destructive alertdialog archetype.
 * Mirrors <DeleteVariableModal> Story 19.2 verbatim.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableAttachment } from "../../api";
import { DeleteAttachmentModal } from "../delete-attachment-modal";

const FILE_ATTACHMENT: FlowableAttachment = {
  id: "att-1",
  name: "report.pdf",
  type: "application/pdf",
};

const URL_ATTACHMENT: FlowableAttachment = {
  id: "att-2",
  name: "External dashboard",
  externalUrl: "https://example.com/dash",
};

describe("<DeleteAttachmentModal>", () => {
  const realDelete = api.deleteTaskAttachment;
  let deleteSpy: ReturnType<typeof vi.fn>;
  const toasts: Array<{ kind?: string; text: string; sub?: string }> = [];
  const toastHandler = (e: Event) => {
    toasts.push((e as CustomEvent<{ kind?: string; text: string; sub?: string }>).detail);
  };

  beforeEach(() => {
    deleteSpy = vi.fn();
    (
      api as unknown as { deleteTaskAttachment: typeof api.deleteTaskAttachment }
    ).deleteTaskAttachment = deleteSpy as unknown as typeof api.deleteTaskAttachment;
    toasts.length = 0;
    window.addEventListener("app:toast", toastHandler as EventListener);
  });

  afterEach(() => {
    (
      api as unknown as { deleteTaskAttachment: typeof api.deleteTaskAttachment }
    ).deleteTaskAttachment = realDelete;
    window.removeEventListener("app:toast", toastHandler as EventListener);
    cleanup();
  });

  it("renders nothing when attachment is null", () => {
    const { container } = render(
      <DeleteAttachmentModal attachment={null} taskId="task-1" onClose={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an alertdialog with ARIA contract on day one", async () => {
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete attachment?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "delete-attachment-title");
    expect(screen.getByTestId("delete-attachment-modal")).toBeInTheDocument();
  });

  it("URL attachment body renders the externalUrl", async () => {
    render(
      <DeleteAttachmentModal
        attachment={URL_ATTACHMENT}
        taskId="task-1"
        onClose={() => undefined}
      />,
    );
    await screen.findByText("Delete attachment?");
    expect(screen.getByText("https://example.com/dash")).toBeInTheDocument();
  });

  it("File attachment body renders the MIME type", async () => {
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={() => undefined}
      />,
    );
    await screen.findByText("Delete attachment?");
    expect(screen.getByText("application/pdf")).toBeInTheDocument();
  });

  it("Confirm success path: wrapper called + success toast + onSettled + onClose fired", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={onClose}
        onSettled={onSettled}
      />,
    );
    await user.click(await screen.findByTestId("delete-attachment-confirm"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("task-1", "att-1"));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      toasts.some((t) => t.kind === "ok" && /Deleted attachment: report\.pdf/.test(t.text)),
    ).toBe(true);
  });

  it("Confirm failure path: error toast + onSettled + onClose STILL fired (modal closes on failure)", async () => {
    deleteSpy.mockRejectedValue(new Error("403 forbidden"));
    const onClose = vi.fn();
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={onClose}
        onSettled={onSettled}
      />,
    );
    await user.click(await screen.findByTestId("delete-attachment-confirm"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const errToast = toasts.find((t) => t.kind === "err");
    expect(errToast?.text).toBe("Delete failed");
    expect(errToast?.sub).toBe("403 forbidden");
  });

  it("Cancel closes the modal without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={onClose}
        triggerRef={triggerRef}
      />,
    );
    await screen.findByText("Delete attachment?");
    await user.click(screen.getByTestId("delete-attachment-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteAttachmentModal attachment={FILE_ATTACHMENT} taskId="task-1" onClose={onClose} />,
    );
    await screen.findByText("Delete attachment?");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the Cancel button on open (safety — avoid accidental Enter→Delete)", async () => {
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={() => undefined}
      />,
    );
    const cancel = await screen.findByTestId("delete-attachment-cancel");
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it("Confirm button is disabled while in-flight", async () => {
    let resolveDelete: () => void = () => undefined;
    deleteSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={() => undefined}
      />,
    );
    const confirm = (await screen.findByTestId("delete-attachment-confirm")) as HTMLButtonElement;
    await user.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    expect(confirm).toHaveTextContent(/deleting/i);
    resolveDelete();
  });

  it("falls back to fallbackRef when triggerRef is detached after delete", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const trigger = document.createElement("button");
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    // trigger NOT appended to DOM — simulates a row removed after delete.
    const triggerRef = { current: trigger };
    const fallbackRef = { current: fallback };
    const user = userEvent.setup();
    render(
      <DeleteAttachmentModal
        attachment={FILE_ATTACHMENT}
        taskId="task-1"
        onClose={() => undefined}
        triggerRef={triggerRef}
        fallbackRef={fallbackRef}
      />,
    );
    await user.click(await screen.findByTestId("delete-attachment-confirm"));
    await waitFor(() => expect(document.activeElement).toBe(fallback));
    fallback.remove();
  });
});
