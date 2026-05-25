// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <JobStacktracePanel> (Story 12.4) — third panel-as-sibling
 * consumer. Mirrors the 10.4 InstanceVariablesPanel / 11.3 TaskFormPanel
 * test shapes. Covers AC-3 (status-aware error-probe + four-state contract),
 * AC-4 (verbatim text + Copy).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import { fetchStacktrace, JobStacktracePanel } from "../JobStacktracePanel";

type StackFn = (id: string) => Promise<string>;
type StackHost = { jobStacktrace: StackFn };

const STACK_TEXT = `org.flowable.engine.FlowableException: oh no
\tat com.example.Service.execute(Service.java:42)
\tat org.flowable.engine.impl.bpmn.behavior.ServiceTaskDelegateExpressionActivityBehavior.execute(ServiceTaskDelegateExpressionActivityBehavior.java:107)`;

describe("fetchStacktrace status-aware probe", () => {
  const realJob = api.jobStacktrace;
  const realTimer = api.timerJobStacktrace;
  const realDead = api.deadLetterJobStacktrace;
  let jobSpy: ReturnType<typeof vi.fn>;
  let timerSpy: ReturnType<typeof vi.fn>;
  let deadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jobSpy = vi.fn();
    timerSpy = vi.fn();
    deadSpy = vi.fn();
    (api as unknown as StackHost).jobStacktrace = jobSpy as unknown as StackFn;
    (api as unknown as { timerJobStacktrace: StackFn }).timerJobStacktrace =
      timerSpy as unknown as StackFn;
    (api as unknown as { deadLetterJobStacktrace: StackFn }).deadLetterJobStacktrace =
      deadSpy as unknown as StackFn;
  });

  afterEach(() => {
    (api as unknown as StackHost).jobStacktrace = realJob;
    (api as unknown as { timerJobStacktrace: StackFn }).timerJobStacktrace = realTimer;
    (api as unknown as { deadLetterJobStacktrace: StackFn }).deadLetterJobStacktrace = realDead;
  });

  it("returns the verbatim text on success (executable default)", async () => {
    jobSpy.mockResolvedValue(STACK_TEXT);
    const out = await fetchStacktrace("job-1");
    expect(out).toBe(STACK_TEXT);
    expect(jobSpy).toHaveBeenCalledWith("job-1");
    expect(timerSpy).not.toHaveBeenCalled();
    expect(deadSpy).not.toHaveBeenCalled();
  });

  it("routes timer-tab requests to the timer-jobs endpoint", async () => {
    timerSpy.mockResolvedValue(STACK_TEXT);
    const out = await fetchStacktrace("job-1", "timer");
    expect(out).toBe(STACK_TEXT);
    expect(timerSpy).toHaveBeenCalledWith("job-1");
    expect(jobSpy).not.toHaveBeenCalled();
  });

  it("routes deadletter-tab requests to the deadletter-jobs endpoint", async () => {
    deadSpy.mockResolvedValue(STACK_TEXT);
    const out = await fetchStacktrace("job-1", "deadletter");
    expect(out).toBe(STACK_TEXT);
    expect(deadSpy).toHaveBeenCalledWith("job-1");
    expect(jobSpy).not.toHaveBeenCalled();
  });

  it("returns null on a 404 (engine cleared the stacktrace)", async () => {
    jobSpy.mockRejectedValue(new FlowableError("Job not found", 404));
    const out = await fetchStacktrace("job-1");
    expect(out).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    jobSpy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchStacktrace("job-1")).rejects.toThrow("Boom");
  });
});

describe("<JobStacktracePanel>", () => {
  const real = api.jobStacktrace;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as StackHost).jobStacktrace = spy as unknown as StackFn;
  });

  afterEach(() => {
    (api as unknown as StackHost).jobStacktrace = real;
    cleanup();
  });

  it("renders loading indicator while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    render(<JobStacktracePanel jobId="job-1" />);
    expect(await screen.findByText(/Loading stacktrace/)).toBeInTheDocument();
  });

  it("renders the verbatim stacktrace in <pre> on success", async () => {
    spy.mockResolvedValue(STACK_TEXT);
    render(<JobStacktracePanel jobId="job-1" />);
    const pre = await screen.findByTestId("job-stacktrace-pre");
    expect(pre.tagName).toBe("PRE");
    expect(pre.textContent).toBe(STACK_TEXT);
  });

  it("renders the empty state on 404 (no stacktrace recorded)", async () => {
    spy.mockRejectedValue(new FlowableError("Job not found", 404));
    render(<JobStacktracePanel jobId="job-1" />);
    expect(await screen.findByText("No stacktrace available.")).toBeInTheDocument();
  });

  it("renders the empty state on an empty-string response", async () => {
    spy.mockResolvedValue("");
    render(<JobStacktracePanel jobId="job-1" />);
    expect(await screen.findByText("No stacktrace available.")).toBeInTheDocument();
  });

  it("renders ErrorBox on a non-404 engine error", async () => {
    spy.mockRejectedValue(new FlowableError("Internal Server Error", 500));
    render(<JobStacktracePanel jobId="job-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Internal Server Error/)).toBeInTheDocument();
  });

  it("Copy button invokes navigator.clipboard.writeText with the stacktrace", async () => {
    spy.mockResolvedValue(STACK_TEXT);
    // jsdom doesn't ship a clipboard by default; @testing-library/user-event
    // installs one on setup(), but we install our own writeText spy so we can
    // assert the exact argument. RC-2: navigator.clipboard's getter is
    // non-configurable on Chromium proper, but jsdom permits the override.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(global.navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText },
    });
    render(<JobStacktracePanel jobId="job-1" />);
    await waitFor(() => expect(screen.getByTestId("job-stacktrace-pre")).toBeInTheDocument());
    // Use fireEvent.click rather than userEvent — userEvent.setup() installs
    // its own clipboard handler that swallows our spy.
    const btn = screen.getByTestId("job-stacktrace-copy");
    btn.click();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(STACK_TEXT));
  });

  it("renders a close button when onClose is provided and fires it on click", async () => {
    spy.mockResolvedValue(STACK_TEXT);
    const onClose = vi.fn();
    render(<JobStacktracePanel jobId="job-1" onClose={onClose} />);
    const closeBtn = await screen.findByTestId("job-stacktrace-close");
    expect(closeBtn).toBeInTheDocument();
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits the close button when onClose is not provided", async () => {
    spy.mockResolvedValue(STACK_TEXT);
    render(<JobStacktracePanel jobId="job-1" />);
    await waitFor(() => expect(screen.getByTestId("job-stacktrace-pre")).toBeInTheDocument());
    expect(screen.queryByTestId("job-stacktrace-close")).toBeNull();
  });

  it("Copy button is disabled when there is no stacktrace data", async () => {
    spy.mockResolvedValue("");
    render(<JobStacktracePanel jobId="job-1" />);
    await waitFor(() => expect(screen.getByText("No stacktrace available.")).toBeInTheDocument());
    expect(screen.getByTestId("job-stacktrace-copy")).toBeDisabled();
  });
});
