// SPDX-License-Identifier: Apache-2.0

/**
 * Process instance runtime panel (Story 13.1) — fourth panel-as-sibling
 * consumer after 10.4 `InstanceVariablesPanel`, 11.3 `TaskFormPanel`,
 * 12.4 `JobStacktracePanel`. Project decision (Epic 12 retro R-2): never
 * extract. See CLAUDE.md "Panel-as-sibling-component".
 *
 * Status-aware error-probe pattern (Epic 11 retro §4.4): 404 → null → empty
 * state ("This instance has ended"); other errors → re-throw → <ErrorBox>.
 * Mirrors `fetchTaskForm` (11.3) and `fetchStacktrace` (12.4).
 *
 * Mounted as a sibling of <InstanceHistoricPanel> by /instances/$id under
 * the time-spanning-detail-page contract (Epic 12 retro R-1).
 */

import { Link, useNavigate } from "@tanstack/react-router";
import React from "react";
import {
  api,
  FlowableError,
  type FlowableHistoricActivity,
  type FlowableProcessInstance,
} from "../api";
import { fmtTime, Icon } from "../components";
import { CancelInstanceModal } from "../lib/cancel-instance-modal";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";
import {
  fetchActiveActivitiesOrNull,
  InstanceActiveActivitiesPanel,
} from "./InstanceActiveActivitiesPanel";
import { InstanceVariablesPanel } from "./InstanceVariablesPanel";

// Derive a one-line Activity-row summary from the active-activities list.
// The runtime DTO only carries a lead `activityId` (often null for
// parallel-branch instances); this summary fills the gap so the
// properties row stays meaningful. Format:
//   - 0 active            → "—" (instance is idle or has completed)
//   - 1 active            → activity name (fallback to activityId)
//   - N active            → "<first name> (+N-1 more)"
export const summarizeActiveActivities = (
  activities: FlowableHistoricActivity[] | null | undefined,
): string => {
  if (!activities || activities.length === 0) return "—";
  const first = activities[0];
  const label = first?.activityName || first?.activityId || "(unnamed)";
  if (activities.length === 1) return label;
  return `${label} (+${activities.length - 1} more)`;
};

// Engine-returned fields not on the typed FlowableProcessInstance DTO —
// same rationale as the legacy screens.tsx `Loose<T>` pattern.
type InstanceWide = FlowableProcessInstance & {
  processDefinitionName?: string;
  activityId?: string;
  startUserId?: string;
};

// Status-aware error-probe: 404 → null (instance has ended / never existed);
// anything else propagates so the operator sees the verbatim engine message.
export const fetchRuntimeOrNull = async (id: string): Promise<FlowableProcessInstance | null> => {
  try {
    return await api.getProcessInstance(id);
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

interface Props {
  instanceId: string;
}

export function InstanceRuntimePanel({ instanceId }: Props) {
  const navigate = useNavigate();
  const runtime = useApi<FlowableProcessInstance | null>(
    () => fetchRuntimeOrNull(instanceId),
    [instanceId],
  );
  // Parent-level state-gating duplicate of the active-activities call (the
  // same one the nested <InstanceActiveActivitiesPanel> makes) — see
  // CLAUDE.md "Parent-level state-gating fetches are an acceptable
  // duplication, not a refactor target". Used here so the Activity
  // properties row can show a real summary instead of the engine's often-
  // null lead `activityId`. Both calls route through the api funnel and
  // appear in the Inspector by design.
  const activeActivities = useApi<FlowableHistoricActivity[] | null>(
    () => fetchActiveActivitiesOrNull(instanceId),
    [instanceId],
  );
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const cancelTriggerRef = React.useRef<HTMLButtonElement>(null);
  const handleCancelSettled = () => {
    setCancelOpen(false);
    navigate({ to: "/instances" });
  };

  const p = runtime.data ? (runtime.data as InstanceWide) : null;

  return (
    <div className="panel" data-testid="instance-runtime-panel">
      <div className="panel-hd">
        <span className="panel-title">Runtime</span>
        {p && (
          <span
            className="badge"
            data-tone={p.ended ? "warn" : p.suspended ? "warn" : "ok"}
            style={{ marginLeft: 8 }}
          >
            <span className="dot" />
            {p.suspended ? "suspended" : p.ended ? "ended" : "active"}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /runtime/process-instances/{instanceId}
        </span>
        {p && !p.ended && (
          <button
            ref={cancelTriggerRef}
            type="button"
            className="btn"
            data-tone="bad"
            data-size="sm"
            data-testid="cancel-instance"
            onClick={() => setCancelOpen(true)}
            style={{ marginLeft: 8 }}
          >
            Cancel instance
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          data-testid="runtime-refresh"
          onClick={runtime.reload}
          disabled={runtime.loading}
          aria-label="Refresh runtime status"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {runtime.loading && <TableSkeleton columns={2} rows={5} />}
        {runtime.error && <ErrorBox error={runtime.error} onRetry={runtime.reload} />}
        {!runtime.loading && !runtime.error && runtime.data === null && (
          <EmptyState
            entry={emptyStates.runtimeEnded as NonNullable<typeof emptyStates.runtimeEnded>}
          />
        )}
        {!runtime.loading && !runtime.error && p && (
          <div style={{ overflow: "auto" }}>
            <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
              <tbody>
                <tr>
                  <td className="mute" style={{ width: 200 }}>
                    Business key
                  </td>
                  <td className="mono">{p.businessKey || <span className="mute">—</span>}</td>
                </tr>
                <tr>
                  <td className="mute">Instance ID</td>
                  <td className="mono">{p.id}</td>
                </tr>
                <tr>
                  <td className="mute">Definition</td>
                  <td>
                    <Link
                      to="/definitions/$id"
                      params={{ id: p.processDefinitionId }}
                      className="mono"
                    >
                      {p.processDefinitionName || p.processDefinitionKey}
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td className="mute">Activity</td>
                  <td
                    className="mono"
                    data-testid="runtime-activity-summary"
                    title={
                      activeActivities.data && activeActivities.data.length > 0
                        ? activeActivities.data
                            .map((a) => a.activityName || a.activityId)
                            .join(", ")
                        : undefined
                    }
                  >
                    {activeActivities.loading
                      ? "…"
                      : activeActivities.error
                        ? p.activityId || <span className="mute">—</span>
                        : summarizeActiveActivities(activeActivities.data)}
                  </td>
                </tr>
                <tr>
                  <td className="mute">Started</td>
                  <td className="mono">{fmtTime(p.startTime)}</td>
                </tr>
                <tr>
                  <td className="mute">Started by</td>
                  <td className="mono">{p.startUserId || <span className="mute">—</span>}</td>
                </tr>
                <tr>
                  <td className="mute">Tenant</td>
                  <td className="mono">{p.tenantId || <span className="mute">—</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      {p && (
        <>
          <InstanceActiveActivitiesPanel instanceId={p.id} />
          <InstanceVariablesPanel instance={p} />
          <CancelInstanceModal
            instance={cancelOpen ? p : null}
            onClose={() => setCancelOpen(false)}
            onSettled={handleCancelSettled}
            triggerRef={cancelTriggerRef}
          />
        </>
      )}
    </div>
  );
}
