// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <BatchPartsPanel> — Story 24.1 (FR-53) panel-as-sibling
 * consumer. Covers the four-state contract, status-tone mapping, row-expand
 * stacktrace lifecycle (lazy fetch + cache + 404 → empty state + retry),
 * the cache-clearing useEffect on `batchId` change, and the refresh
 * affordance.
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableBatchPart, FlowableError, type FlowablePage } from "../../api";
import { BatchPartsPanel, fetchBatchPartStacktraceOrNull, statusToTone } from "../BatchPartsPanel";

type ListFn = typeof api.listBatchParts;
type StackFn = typeof api.batchPartStacktrace;
type Host = { listBatchParts: ListFn; batchPartStacktrace: StackFn };

const PART_OK: FlowableBatchPart = {
  id: "part-ok",
  type: "migrate-instance",
  status: "completed",
  createTime: "2026-05-26T10:00:00.000Z",
  completeTime: "2026-05-26T10:00:05.000Z",
};

const PART_FAIL: FlowableBatchPart = {
  id: "part-fail",
  type: "migrate-instance",
  status: "failed",
  createTime: "2026-05-26T10:00:10.000Z",
};

const page = (data: FlowableBatchPart[]): FlowablePage<FlowableBatchPart> => ({
  data,
  total: data.length,
  start: 0,
  size: 100,
  sort: "createTime",
  order: "asc",
});

describe("statusToTone", () => {
  it("maps completed/succeeded/success → ok", () => {
    expect(statusToTone("completed")).toBe("ok");
    expect(statusToTone("succeeded")).toBe("ok");
    expect(statusToTone("success")).toBe("ok");
    expect(statusToTone("COMPLETED")).toBe("ok");
  });
  it("maps failed/error → bad", () => {
    expect(statusToTone("failed")).toBe("bad");
    expect(statusToTone("error")).toBe("bad");
  });
  it("maps in-flight states (waiting/inProgress/running) → warn", () => {
    expect(statusToTone("waiting")).toBe("warn");
    expect(statusToTone("inProgress")).toBe("warn");
    expect(statusToTone("in_progress")).toBe("warn");
    expect(statusToTone("running")).toBe("warn");
  });
  it("maps unknown / undefined → mute", () => {
    expect(statusToTone("queued")).toBe("mute");
    expect(statusToTone(undefined)).toBe("mute");
    expect(statusToTone("")).toBe("mute");
  });
});

describe("fetchBatchPartStacktraceOrNull status-aware probe", () => {
  const real = api.batchPartStacktrace;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).batchPartStacktrace = spy as unknown as StackFn;
  });

  afterEach(() => {
    (api as unknown as Host).batchPartStacktrace = real;
  });

  it("returns the stacktrace body on 200", async () => {
    spy.mockResolvedValue("java.lang.RuntimeException: boom");
    const out = await fetchBatchPartStacktraceOrNull("part-fail");
    expect(out).toBe("java.lang.RuntimeException: boom");
    expect(spy).toHaveBeenCalledWith("part-fail");
  });

  it("returns null on a 404 (part completed without exception)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    expect(await fetchBatchPartStacktraceOrNull("part-ok")).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    spy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchBatchPartStacktraceOrNull("part-fail")).rejects.toThrow("Boom");
  });
});

describe("<BatchPartsPanel>", () => {
  const realList = api.listBatchParts;
  const realStack = api.batchPartStacktrace;
  let listSpy: ReturnType<typeof vi.fn>;
  let stackSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listSpy = vi.fn();
    stackSpy = vi.fn();
    (api as unknown as Host).listBatchParts = listSpy as unknown as ListFn;
    (api as unknown as Host).batchPartStacktrace = stackSpy as unknown as StackFn;
  });

  afterEach(() => {
    (api as unknown as Host).listBatchParts = realList;
    (api as unknown as Host).batchPartStacktrace = realStack;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    listSpy.mockReturnValue(new Promise(() => undefined));
    render(<BatchPartsPanel batchId="b-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("forwards size=100 to the wrapper", async () => {
    listSpy.mockResolvedValue(page([]));
    render(<BatchPartsPanel batchId="b-1" />);
    await waitFor(() => expect(listSpy).toHaveBeenCalledWith("b-1", { size: 100 }));
  });

  it("renders the batchParts empty state when data is []", async () => {
    listSpy.mockResolvedValue(page([]));
    render(<BatchPartsPanel batchId="b-1" />);
    expect(await screen.findByText("No parts for this batch.")).toBeInTheDocument();
  });

  it("renders <ErrorBox> on engine error", async () => {
    listSpy.mockRejectedValue(new FlowableError("Server boom", 500));
    render(<BatchPartsPanel batchId="b-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server boom/)).toBeInTheDocument();
  });

  it("renders rows with status badges + the row-count badge", async () => {
    listSpy.mockResolvedValue(page([PART_OK, PART_FAIL]));
    render(<BatchPartsPanel batchId="b-1" />);
    expect(await screen.findByText("completed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    // row count
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByTestId("batch-part-row-part-ok")).toBeInTheDocument();
    expect(screen.getByTestId("batch-part-row-part-fail")).toBeInTheDocument();
  });

  it("expands the clicked row + fetches the stacktrace lazily", async () => {
    listSpy.mockResolvedValue(page([PART_FAIL]));
    stackSpy.mockResolvedValue("java.lang.RuntimeException: boom");
    render(<BatchPartsPanel batchId="b-1" />);
    const row = await screen.findByTestId("batch-part-row-part-fail");
    expect(stackSpy).not.toHaveBeenCalled();
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.getByTestId("batch-part-stacktrace-part-fail")).toBeInTheDocument(),
    );
    expect(stackSpy).toHaveBeenCalledWith("part-fail");
    expect(screen.getByText(/RuntimeException/)).toBeInTheDocument();
  });

  it("renders the batchPartStacktrace empty-state when the stacktrace endpoint 404s", async () => {
    listSpy.mockResolvedValue(page([PART_OK]));
    stackSpy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<BatchPartsPanel batchId="b-1" />);
    const row = await screen.findByTestId("batch-part-row-part-ok");
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText("No stacktrace available.")).toBeInTheDocument());
  });

  it("renders inline ErrorBox + retry on a non-404 stacktrace error", async () => {
    listSpy.mockResolvedValue(page([PART_FAIL]));
    stackSpy.mockRejectedValueOnce(new FlowableError("Boom", 500));
    render(<BatchPartsPanel batchId="b-1" />);
    const row = await screen.findByTestId("batch-part-row-part-fail");
    fireEvent.click(row);
    const errBox = await screen.findByTestId("error-box");
    expect(errBox).toBeInTheDocument();
    // Retry path
    stackSpy.mockResolvedValueOnce("java.lang.Boom: retried");
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retryBtn);
    await waitFor(() => expect(screen.getByText(/Boom: retried/)).toBeInTheDocument());
  });

  it("caches the stacktrace — re-expand of the same row does NOT re-fetch", async () => {
    listSpy.mockResolvedValue(page([PART_FAIL]));
    stackSpy.mockResolvedValue("trace-1");
    render(<BatchPartsPanel batchId="b-1" />);
    const row = await screen.findByTestId("batch-part-row-part-fail");
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.getByTestId("batch-part-stacktrace-part-fail")).toBeInTheDocument(),
    );
    expect(stackSpy).toHaveBeenCalledTimes(1);
    // Collapse
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.queryByTestId("batch-part-stacktrace-part-fail")).not.toBeInTheDocument(),
    );
    // Re-expand — same row, cache hit
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.getByTestId("batch-part-stacktrace-part-fail")).toBeInTheDocument(),
    );
    expect(stackSpy).toHaveBeenCalledTimes(1);
  });

  it("single-row-at-a-time: opening a second row collapses the first", async () => {
    listSpy.mockResolvedValue(page([PART_OK, PART_FAIL]));
    stackSpy.mockResolvedValue("trace");
    render(<BatchPartsPanel batchId="b-1" />);
    const r1 = await screen.findByTestId("batch-part-row-part-ok");
    const r2 = screen.getByTestId("batch-part-row-part-fail");
    fireEvent.click(r1);
    await waitFor(() =>
      expect(screen.getByTestId("batch-part-detail-part-ok")).toBeInTheDocument(),
    );
    fireEvent.click(r2);
    await waitFor(() =>
      expect(screen.queryByTestId("batch-part-detail-part-ok")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("batch-part-detail-part-fail")).toBeInTheDocument();
  });

  it("clears expand + cache when batchId changes", async () => {
    listSpy.mockResolvedValue(page([PART_FAIL]));
    stackSpy.mockResolvedValue("trace-A");
    const { rerender } = render(<BatchPartsPanel batchId="b-1" />);
    const row = await screen.findByTestId("batch-part-row-part-fail");
    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.getByTestId("batch-part-stacktrace-part-fail")).toBeInTheDocument(),
    );
    expect(stackSpy).toHaveBeenCalledTimes(1);
    // Switch batch — panel must reset (no row expanded; cache cleared)
    listSpy.mockResolvedValue(page([PART_FAIL]));
    stackSpy.mockResolvedValue("trace-B");
    act(() => rerender(<BatchPartsPanel batchId="b-2" />));
    await waitFor(() => expect(listSpy).toHaveBeenLastCalledWith("b-2", { size: 100 }));
    expect(screen.queryByTestId("batch-part-detail-part-fail")).not.toBeInTheDocument();
    // Re-expand on new batch — cache was cleared, must re-fetch
    const row2 = screen.getByTestId("batch-part-row-part-fail");
    fireEvent.click(row2);
    await waitFor(() => expect(stackSpy).toHaveBeenCalledTimes(2));
  });

  it("Refresh button triggers a second list fetch and is disabled while loading", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableBatchPart>) => void;
    listSpy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableBatchPart>>((res) => {
        resolveFirst = res;
      }),
    );
    render(<BatchPartsPanel batchId="b-1" />);
    const btn = await screen.findByTestId("batch-parts-refresh");
    expect(btn).toBeDisabled();
    listSpy.mockResolvedValue(page([PART_OK]));
    resolveFirst(page([PART_OK]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
  });
});
