// SPDX-License-Identifier: Apache-2.0

/**
 * Job exception stacktrace panel (Story 12.4).
 *
 * Third panel-as-sibling-component consumer after 10.4's
 * `InstanceVariablesPanel` and 11.3's `TaskFormPanel`. The panel owns its
 * own `useApi(api.jobStacktrace)` fetch, four-state contract, and Copy
 * action. The parent (`JobsRoute`) mounts it as a black box and only
 * passes the stable `jobId` identifier.
 *
 * Per Story 12.4 AC-3 the status-aware error-probe pattern applies: a 404
 * means "engine cleared the stacktrace" and renders as the empty state;
 * any other error renders verbatim via `<ErrorBox>`.
 *
 * NFR-8 reminder: the stacktrace bytes are NOT captured into `API_LOG`
 * (response bodies are intentionally not captured). The `<pre>` panel is
 * the only render surface for the bytes; the Inspector drawer just shows
 * the GET line.
 */

import { api, FlowableError } from "../api";
import { Icon, toast } from "../components";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

// Inline string union (rather than importing from routes/) to keep
// components/ ← routes/ dependency-free.
export type StacktraceJobType = "executable" | "timer" | "deadletter";

// Mirror of 11.3's `fetchTaskForm` status-aware error-probe. 404 → null
// (engine has no recorded stacktrace, or the job already cleared); any
// other error propagates so the operator sees the verbatim engine message.
//
// Live-engine review patch: timer-jobs and dead-letter-jobs live in
// separate namespaces; their stacktrace endpoints are NOT under
// /management/jobs/{id}/exception-stacktrace. Branch on the active tab.
export const fetchStacktrace = async (
  jobId: string,
  jobType: StacktraceJobType = "executable",
): Promise<string | null> => {
  try {
    if (jobType === "timer") return await api.timerJobStacktrace(jobId);
    if (jobType === "deadletter") return await api.deadLetterJobStacktrace(jobId);
    return await api.jobStacktrace(jobId);
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

interface Props {
  jobId: string;
  jobType?: StacktraceJobType;
  /**
   * Optional dismiss callback. When provided, the panel header renders a
   * close (✕) button that calls it. Otherwise the panel has no close
   * affordance — sibling-row mounts in `<JobsRoute>` always pass it; future
   * always-visible mounts may omit it.
   */
  onClose?: () => void;
}

export function JobStacktracePanel({ jobId, jobType = "executable", onClose }: Props) {
  const stack = useApi<string | null>(() => fetchStacktrace(jobId, jobType), [jobId, jobType]);

  const onCopy = async () => {
    if (!stack.data) return;
    try {
      await navigator.clipboard.writeText(stack.data);
      toast({ kind: "ok", text: "Stacktrace copied", ttl: 2500 });
    } catch (err) {
      toast({
        kind: "err",
        text: "Copy failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 6000,
      });
    }
  };

  return (
    <div className="panel" data-testid="job-stacktrace-panel" style={{ marginTop: 8 }}>
      <div className="panel-hd">
        <span className="panel-title">Stacktrace</span>
        <span
          className="mono mute"
          style={{ marginLeft: 8, fontSize: 10, color: "var(--fg-mute)" }}
        >
          {jobId}
        </span>
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-testid="job-stacktrace-copy"
          onClick={() => void onCopy()}
          disabled={!stack.data}
          style={{ marginLeft: "auto" }}
        >
          Copy
        </button>
        {onClose && (
          <button
            type="button"
            className="icon-btn"
            data-testid="job-stacktrace-close"
            onClick={onClose}
            aria-label="Close stacktrace"
            style={{ marginLeft: 8 }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>
      <div className="panel-body">
        {stack.loading && (
          <div className="mute" style={{ padding: "8px 0", fontSize: 11.5 }}>
            Loading stacktrace…
          </div>
        )}
        {stack.error && <ErrorBox error={stack.error} onRetry={stack.reload} />}
        {!stack.loading && !stack.error && (stack.data === null || stack.data === "") && (
          <EmptyState entry={getEmptyState("stacktrace")} />
        )}
        {!stack.loading && !stack.error && stack.data && (
          <pre
            className="stacktrace"
            data-testid="job-stacktrace-pre"
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
            {stack.data}
          </pre>
        )}
      </div>
    </div>
  );
}
