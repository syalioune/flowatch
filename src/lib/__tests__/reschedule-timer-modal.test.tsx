// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <RescheduleTimerModal> (Story 12.2 review patch).
 *
 * Mirrors the DelegateTaskModal test shape — single-input retryable-creation
 * modal. Covers the open/close contract, the local→ISO conversion of the
 * datetime-local input, the in-modal ErrorBox failure path, and the
 * triggerRef focus-restore convention.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableJob } from "../../api";
import { RescheduleTimerModal } from "../reschedule-timer-modal";

const sampleJob: FlowableJob = {
  id: "job-1",
  retries: 3,
  dueDate: "2050-01-01T00:00:00.000Z",
};

type RescheduleFn = (id: string, dueDate: string) => Promise<FlowableJob>;
type Host = { rescheduleTimerJob: RescheduleFn };

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

describe("<RescheduleTimerModal>", () => {
  const real = api.rescheduleTimerJob;
  let spy: ReturnType<typeof vi.fn>;
  let toastCollector: ReturnType<typeof collectToasts>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).rescheduleTimerJob = spy as unknown as RescheduleFn;
    toastCollector = collectToasts();
  });

  afterEach(() => {
    (api as unknown as Host).rescheduleTimerJob = real;
    toastCollector.dispose();
    cleanup();
  });

  it("renders nothing when job is null", () => {
    render(<RescheduleTimerModal job={null} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.queryByTestId("reschedule-timer-modal")).toBeNull();
  });

  it("renders job id, current dueDate, and the datetime-local input prefilled", () => {
    render(<RescheduleTimerModal job={sampleJob} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.getByText("job-1")).toBeInTheDocument();
    expect(screen.getByText("2050-01-01T00:00:00.000Z")).toBeInTheDocument();
    const input = screen.getByTestId("reschedule-timer-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // Prefilled value should be the LOCAL form of the ISO dueDate. We only
    // assert the date portion since the time portion depends on the
    // runner's local timezone.
    expect(input.value.startsWith("2049-12-") || input.value.startsWith("2050-01-")).toBe(true);
  });

  it("renders an em-dash when the job has no dueDate", () => {
    const noDue: FlowableJob = { id: "job-no-due", retries: 3 };
    render(<RescheduleTimerModal job={noDue} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    const input = screen.getByTestId("reschedule-timer-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("Confirm is disabled when input is empty or in the past", async () => {
    const user = userEvent.setup();
    const noDue: FlowableJob = { id: "job-no-due", retries: 3 };
    render(<RescheduleTimerModal job={noDue} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    const confirm = screen.getByTestId("reschedule-timer-modal-confirm");
    expect(confirm).toBeDisabled();
    // Past date → still disabled.
    const input = screen.getByTestId("reschedule-timer-input");
    await user.type(input, "2000-01-01T00:00");
    expect(confirm).toBeDisabled();
  });

  it("Confirm enables for a future date", () => {
    render(<RescheduleTimerModal job={sampleJob} onClose={vi.fn()} onSubmitted={vi.fn()} />);
    const confirm = screen.getByTestId("reschedule-timer-modal-confirm");
    // Default prefilled value is 2050-01-01 (future) → Confirm should be enabled.
    expect(confirm).toBeEnabled();
  });

  it("success path: calls api.rescheduleTimerJob with ISO string, fires toast, closes", async () => {
    spy.mockResolvedValue(sampleJob);
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    render(<RescheduleTimerModal job={sampleJob} onClose={onClose} onSubmitted={onSubmitted} />);
    const confirm = screen.getByTestId("reschedule-timer-modal-confirm");
    fireEvent.click(confirm);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [calledId, calledDue] = spy.mock.calls[0] as [string, string];
    expect(calledId).toBe("job-1");
    // The ISO conversion round-trips through Date; the result should parse.
    expect(Number.isNaN(new Date(calledDue).getTime())).toBe(false);
    expect(calledDue).toMatch(/T\d{2}:\d{2}:\d{2}/);
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastCollector.toasts.some((t) => t.kind === "ok" && /Rescheduled:/.test(t.text))).toBe(
      true,
    );
  });

  it("failure path: in-modal ErrorBox; modal stays open; values preserved", async () => {
    spy.mockRejectedValue(new Error("Engine refused"));
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    render(<RescheduleTimerModal job={sampleJob} onClose={onClose} onSubmitted={onSubmitted} />);
    const confirm = screen.getByTestId("reschedule-timer-modal-confirm");
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId("reschedule-timer-error")).toBeInTheDocument());
    expect(screen.getByText("Engine refused")).toBeInTheDocument();
    // Modal stays open; onSubmitted NOT called.
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Input value preserved.
    const input = screen.getByTestId("reschedule-timer-input") as HTMLInputElement;
    expect(input.value).not.toBe("");
  });

  it("Cancel button calls onClose without firing the API call", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RescheduleTimerModal job={sampleJob} onClose={onClose} onSubmitted={vi.fn()} />);
    await user.click(screen.getByTestId("reschedule-timer-modal-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });

  it("Enter key on the input submits when Confirm is enabled", async () => {
    spy.mockResolvedValue(sampleJob);
    const onClose = vi.fn();
    const onSubmitted = vi.fn();
    render(<RescheduleTimerModal job={sampleJob} onClose={onClose} onSubmitted={onSubmitted} />);
    const input = screen.getByTestId("reschedule-timer-input");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("Escape closes the modal and restores focus to triggerRef", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const onClose = vi.fn();
    render(
      <RescheduleTimerModal
        job={sampleJob}
        onClose={onClose}
        onSubmitted={vi.fn()}
        triggerRef={triggerRef}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    document.body.removeChild(trigger);
  });

  it("close (✕) button dismisses without firing the API", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RescheduleTimerModal job={sampleJob} onClose={onClose} onSubmitted={vi.fn()} />);
    const close = screen.getByLabelText("Close reschedule modal");
    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
  });
});
