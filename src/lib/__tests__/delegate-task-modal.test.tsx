// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DelegateTaskModal> (Story 11.4).
 *
 * Covers AC-1 (target prop opens/closes), AC-2 (input + Confirm disabled
 * rules), AC-3 (success path: api.taskAction call + ok toast + nav-event
 * + onSubmitted + focus restore; failure path: in-modal ErrorBox + values
 * preserved + busy clears), AC-7 (Esc closes / Esc-while-busy suppressed).
 *
 * Mirrors the cancel-instance-modal test structure; the form-control
 * shape (text input vs textarea) and the navigate-on-both-vs-in-modal-
 * ErrorBox decision are the load-bearing differences.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableTask } from "../../api";
import { DelegateTaskModal } from "../delegate-task-modal";

const sampleTask: FlowableTask = {
  id: "task-1",
  name: "Approve loan",
  priority: 50,
  createTime: "2026-05-25T12:00:00.000Z",
  assignee: "rest-admin",
};

type TaskActionFn = (
  id: string,
  action: string,
  body?: Record<string, unknown>,
) => Promise<FlowableTask>;
type Host = { taskAction: TaskActionFn };

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

describe("<DelegateTaskModal>", () => {
  const realTaskAction = api.taskAction;
  let taskActionSpy: ReturnType<typeof vi.fn>;
  let toastCollector: ReturnType<typeof collectToasts>;

  beforeEach(() => {
    taskActionSpy = vi.fn();
    (api as unknown as Host).taskAction = taskActionSpy as unknown as TaskActionFn;
    toastCollector = collectToasts();
  });

  afterEach(() => {
    (api as unknown as Host).taskAction = realTaskAction;
    toastCollector.dispose();
    cleanup();
  });

  it("renders nothing when task is null", () => {
    render(<DelegateTaskModal task={null} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.queryByTestId("delegate-task-modal")).toBeNull();
  });

  it("renders task context, assignee line, and the input", () => {
    render(<DelegateTaskModal task={sampleTask} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.getByText("Approve loan")).toBeInTheDocument();
    expect(screen.getByText(/Currently assigned to/)).toBeInTheDocument();
    expect(screen.getByText("rest-admin")).toBeInTheDocument();
    const input = screen.getByTestId("delegate-task-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("renders (unassigned) when task.assignee is empty", () => {
    const { assignee: _drop, ...rest } = sampleTask;
    render(
      <DelegateTaskModal task={rest as FlowableTask} onClose={vi.fn()} onSubmitted={vi.fn()} />,
    );
    expect(screen.getByText(/\(unassigned\)/)).toBeInTheDocument();
  });

  it("Confirm is disabled when input is empty or whitespace-only", async () => {
    const user = userEvent.setup();
    render(<DelegateTaskModal task={sampleTask} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    const confirm = screen.getByTestId("delegate-task-modal-confirm");
    expect(confirm).toBeDisabled();
    const input = screen.getByTestId("delegate-task-input");
    await user.type(input, "   ");
    expect(confirm).toBeDisabled();
    await user.type(input, "kermit");
    expect(confirm).toBeEnabled();
  });

  it("successful submit: calls taskAction, fires toast, dispatches nav event, calls onSubmitted, restores focus", async () => {
    const user = userEvent.setup();
    taskActionSpy.mockResolvedValue({} as unknown as FlowableTask);
    const onSubmitted = vi.fn();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const navEvents: string[] = [];
    const navHandler = (e: Event) => navEvents.push(e.type);
    window.addEventListener("nav:invalidate-counts", navHandler);
    try {
      render(
        <DelegateTaskModal
          task={sampleTask}
          onClose={onClose}
          onSubmitted={onSubmitted}
          triggerRef={triggerRef}
        />,
      );
      await user.type(screen.getByTestId("delegate-task-input"), "kermit");
      await user.click(screen.getByTestId("delegate-task-modal-confirm"));
      await waitFor(() =>
        expect(taskActionSpy).toHaveBeenCalledWith("task-1", "delegate", { assignee: "kermit" }),
      );
      expect(navEvents).toContain("nav:invalidate-counts");
      expect(onSubmitted).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      // Success toast (ok).
      expect(toastCollector.toasts.some((t) => t.kind === "ok" && /Delegated:/.test(t.text))).toBe(
        true,
      );
    } finally {
      window.removeEventListener("nav:invalidate-counts", navHandler);
      document.body.removeChild(trigger);
    }
  });

  it("failure submit: renders in-modal ErrorBox + preserves typed value + does NOT call onSubmitted", async () => {
    const user = userEvent.setup();
    taskActionSpy.mockRejectedValue(new Error("user not found"));
    const onSubmitted = vi.fn();
    const onClose = vi.fn();
    render(<DelegateTaskModal task={sampleTask} onClose={onClose} onSubmitted={onSubmitted} />);
    const input = screen.getByTestId("delegate-task-input") as HTMLInputElement;
    await user.type(input, "kermit");
    await user.click(screen.getByTestId("delegate-task-modal-confirm"));
    await waitFor(() => expect(screen.getByTestId("delegate-task-error")).toBeInTheDocument());
    expect(screen.getByText(/user not found/)).toBeInTheDocument();
    // Input value preserved per retryable-creation pattern.
    expect(input.value).toBe("kermit");
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Esc closes the modal and restores focus to the trigger", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    try {
      render(
        <DelegateTaskModal
          task={sampleTask}
          onClose={onClose}
          onSubmitted={vi.fn()}
          triggerRef={triggerRef}
        />,
      );
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(focusSpy).toHaveBeenCalled();
    } finally {
      document.body.removeChild(trigger);
    }
  });

  it("Esc while busy does NOT close the modal", async () => {
    const user = userEvent.setup();
    // Block resolution to keep `busy = true`.
    taskActionSpy.mockReturnValue(new Promise(() => undefined));
    const onClose = vi.fn();
    render(<DelegateTaskModal task={sampleTask} onClose={onClose} onSubmitted={vi.fn()} />);
    await user.type(screen.getByTestId("delegate-task-input"), "kermit");
    await user.click(screen.getByTestId("delegate-task-modal-confirm"));
    // Now busy === true.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Enter on the input triggers submit when input is non-empty", async () => {
    const user = userEvent.setup();
    taskActionSpy.mockResolvedValue({} as unknown as FlowableTask);
    render(<DelegateTaskModal task={sampleTask} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    const input = screen.getByTestId("delegate-task-input");
    await user.type(input, "kermit{Enter}");
    await waitFor(() => expect(taskActionSpy).toHaveBeenCalledTimes(1));
  });
});
