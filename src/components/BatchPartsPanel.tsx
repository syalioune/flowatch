// SPDX-License-Identifier: Apache-2.0

/**
 * Batch parts panel (Story 24.1, FR-53).
 *
 * Panel-as-sibling consumer (steady-state N=many; never extracted per
 * CLAUDE.md "Panel-as-sibling is never extracted into a shared abstraction"
 * Epic 12 retro R-2). Lists the per-part status of a Flowable batch and
 * inline-row-expands the failure stacktrace on click (Story 15.4 row-expand
 * pattern: single row at a time; the row IS the click target; expansion
 * `<tr>` spans `colSpan={5}` immediately below the clicked row; stacktrace
 * is fetched lazily on first expand + cached in component state so re-
 * expanding the same row does NOT re-fetch).
 *
 * Status-aware error-probe (Epic 11 retro §4.4): the per-part stacktrace
 * 404s when the part completed without exception → mapped to null → empty
 * state. Other errors propagate verbatim through `<ErrorBox>` inline within
 * the expanded row.
 */

import React from "react";
import { api, type FlowableBatchPart, FlowableError } from "../api";
import { fmtTime, Icon } from "../components";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

const PARTS_PAGE_SIZE = 100;

export const fetchBatchPartStacktraceOrNull = async (partId: string): Promise<string | null> => {
  try {
    return await api.batchPartStacktrace(partId);
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

export const statusToTone = (status: string | undefined): "ok" | "warn" | "bad" | "mute" => {
  if (!status) return "mute";
  const s = status.toLowerCase();
  if (s === "completed" || s === "succeeded" || s === "success") return "ok";
  if (s === "failed" || s === "error") return "bad";
  // In-flight states (waiting, inProgress, running) surface as warn so the
  // operator can distinguish "still running" from "no status reported".
  if (s === "waiting" || s === "inprogress" || s === "in_progress" || s === "running") {
    return "warn";
  }
  return "mute";
};

interface Props {
  batchId: string;
}

interface StacktraceState {
  loading: boolean;
  data: string | null;
  error: Error | null;
}

export function BatchPartsPanel({ batchId }: Props) {
  const parts = useApi(() => api.listBatchParts(batchId, { size: PARTS_PAGE_SIZE }), [batchId]);
  const [expandedPartId, setExpandedPartId] = React.useState<string | null>(null);
  // Map<partId, StacktraceState> — first-expand fetches; subsequent expand
  // re-uses the cache so re-expand does NOT re-fetch. The cache survives
  // panel-internal re-renders.
  const [stacktraces, setStacktraces] = React.useState<Map<string, StacktraceState>>(new Map());

  // Reset cache + expanded row when the batchId changes — the previous
  // batchId's stacktraces are scoped to ids that aren't in the new list.
  React.useEffect(() => {
    setExpandedPartId(null);
    setStacktraces(new Map());
  }, [batchId]);

  const list = parts.data?.data ?? [];

  const fetchStacktrace = React.useCallback(async (partId: string) => {
    setStacktraces((prev) => {
      const next = new Map(prev);
      next.set(partId, { loading: true, data: null, error: null });
      return next;
    });
    try {
      const data = await fetchBatchPartStacktraceOrNull(partId);
      setStacktraces((prev) => {
        const next = new Map(prev);
        next.set(partId, { loading: false, data, error: null });
        return next;
      });
    } catch (err) {
      setStacktraces((prev) => {
        const next = new Map(prev);
        next.set(partId, {
          loading: false,
          data: null,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        return next;
      });
    }
  }, []);

  const togglePart = (partId: string) => {
    setExpandedPartId((prev) => {
      const next = prev === partId ? null : partId;
      if (next && !stacktraces.has(next)) void fetchStacktrace(next);
      return next;
    });
  };

  const retryStacktrace = (partId: string) => {
    void fetchStacktrace(partId);
  };

  return (
    <div className="panel" data-testid="batch-parts-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Batch parts</span>
        {parts.data && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            <span className="sr-only">Count: </span>
            {list.length}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /management/batches/{batchId}/batch-parts
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="batch-parts-refresh"
          onClick={parts.reload}
          disabled={parts.loading}
          aria-label="Refresh batch parts"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {parts.loading && <TableSkeleton columns={5} rows={3} />}
        {parts.error && <ErrorBox error={parts.error} onRetry={parts.reload} />}
        {!parts.loading && !parts.error && list.length === 0 && (
          <EmptyState entry={getEmptyState("batchParts")} />
        )}
        {!parts.loading && !parts.error && list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Part ID</th>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Started</th>
                <th scope="col">Completed</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p: FlowableBatchPart) => {
                const isOpen = expandedPartId === p.id;
                const trace = stacktraces.get(p.id);
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      data-testid={`batch-part-row-${p.id}`}
                      data-batch-part-id={p.id}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      aria-expanded={isOpen}
                      onClick={() => togglePart(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          togglePart(p.id);
                        }
                      }}
                    >
                      <td className="mono">{p.id}</td>
                      <td className="mono">
                        <span className="badge" data-tone="mute">
                          <span className="sr-only">Type: </span>
                          {p.type ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className="badge" data-tone={statusToTone(p.status)}>
                          <span className="sr-only">Status: </span>
                          {p.status ?? "—"}
                        </span>
                      </td>
                      <td className="mute mono">{fmtTime(p.createTime)}</td>
                      <td className="mute mono">
                        {p.completeTime ? fmtTime(p.completeTime) : <span className="mute">—</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr data-testid={`batch-part-detail-${p.id}`}>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div style={{ padding: 12, background: "var(--bg-elev)" }}>
                            {(!trace || trace.loading) && <TableSkeleton columns={1} rows={3} />}
                            {trace?.error && (
                              <ErrorBox error={trace.error} onRetry={() => retryStacktrace(p.id)} />
                            )}
                            {trace && !trace.loading && !trace.error && trace.data === null && (
                              <EmptyState entry={getEmptyState("batchPartStacktrace")} />
                            )}
                            {trace && !trace.loading && !trace.error && trace.data && (
                              // biome-ignore lint/a11y/useSemanticElements: a <pre> is the correct monospace container for a stacktrace; role="region" only adds the scrollable-region semantics axe wants (Story 32.2 D1).
                              <pre
                                className="stacktrace"
                                data-testid={`batch-part-stacktrace-${p.id}`}
                                role="region"
                                aria-label="Batch part stacktrace"
                                // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG SC 2.1.1 / axe scrollable-region-focusable — the stacktrace scrolls and MUST be keyboard-reachable (Story 32.2 D1).
                                tabIndex={0}
                                style={{
                                  margin: 0,
                                  padding: 12,
                                  fontFamily: "var(--font-mono)",
                                  fontSize: 12,
                                  background: "var(--bg-elev)",
                                  color: "var(--fg)",
                                  borderRadius: 4,
                                  maxHeight: 400,
                                  overflow: "auto",
                                  whiteSpace: "pre",
                                }}
                              >
                                {trace.data}
                              </pre>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
