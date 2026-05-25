// SPDX-License-Identifier: Apache-2.0

/**
 * Historic process instance panel (Story 13.1) — fifth panel-as-sibling
 * consumer after 10.4 / 11.3 / 12.4 / 13.1-runtime. Project decision
 * (Epic 12 retro R-2): never extract. See CLAUDE.md.
 *
 * Status-aware error-probe pattern (Epic 11 retro §4.4): 404 → null → empty
 * state ("No historic record yet"); other errors → re-throw → <ErrorBox>.
 *
 * Mounted as a sibling of <InstanceRuntimePanel> by /instances/$id under
 * the time-spanning-detail-page contract (Epic 12 retro R-1). The two
 * panels render independently; both 404s (invalid id) is acceptable empty
 * UX for v0.0.2 — future polish may add an aggregated "instance not found"
 * treatment if operator feedback demands it.
 */

import { Link } from "@tanstack/react-router";
import { api, FlowableError, type FlowableHistoricProcessInstance } from "../api";
import { fmtMs, fmtTime, Icon } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

// Engine-returned fields not on the typed FlowableHistoricProcessInstance
// DTO — mirrors the Loose<T> pattern.
type HistoricWide = FlowableHistoricProcessInstance & {
  processDefinitionName?: string;
  deleteReason?: string;
};

export const fetchHistoricOrNull = async (
  id: string,
): Promise<FlowableHistoricProcessInstance | null> => {
  try {
    return await api.getHistoricProcessInstance(id);
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

interface Props {
  instanceId: string;
}

export function InstanceHistoricPanel({ instanceId }: Props) {
  const historic = useApi<FlowableHistoricProcessInstance | null>(
    () => fetchHistoricOrNull(instanceId),
    [instanceId],
  );

  const h = historic.data ? (historic.data as HistoricWide) : null;
  const badgeTone = h?.endTime ? "mute" : "warn";
  const badgeText = h?.endTime ? "ended" : "historic";

  return (
    <div className="panel" data-testid="historic-instance-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Historic record</span>
        {h && (
          <span className="badge" data-tone={badgeTone} style={{ marginLeft: 8 }}>
            {badgeText}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /history/historic-process-instances/{instanceId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="historic-refresh"
          onClick={historic.reload}
          disabled={historic.loading}
          aria-label="Refresh historic record"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {historic.loading && <TableSkeleton columns={2} rows={4} />}
        {historic.error && <ErrorBox error={historic.error} onRetry={historic.reload} />}
        {!historic.loading && !historic.error && historic.data === null && (
          <EmptyState
            entry={emptyStates.historicNoRecord as NonNullable<typeof emptyStates.historicNoRecord>}
          />
        )}
        {!historic.loading && !historic.error && h && (
          <div style={{ overflow: "auto" }}>
            <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
              <tbody>
                <tr>
                  <td className="mute" style={{ width: 200 }}>
                    Business key
                  </td>
                  <td className="mono">{h.businessKey || <span className="mute">—</span>}</td>
                </tr>
                <tr>
                  <td className="mute">Instance ID</td>
                  <td className="mono">{h.id}</td>
                </tr>
                <tr>
                  <td className="mute">Definition</td>
                  <td>
                    <Link
                      to="/definitions/$id"
                      params={{ id: h.processDefinitionId }}
                      className="mono"
                    >
                      {h.processDefinitionName || h.processDefinitionKey}
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td className="mute">Started</td>
                  <td className="mono">{fmtTime(h.startTime)}</td>
                </tr>
                <tr>
                  <td className="mute">Ended</td>
                  <td className="mono">
                    {h.endTime ? fmtTime(h.endTime) : <span className="mute">—</span>}
                  </td>
                </tr>
                <tr>
                  <td className="mute">Duration</td>
                  <td className="mono">{fmtMs(h.durationInMillis)}</td>
                </tr>
                <tr>
                  <td className="mute">Delete reason</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {h.deleteReason || <span className="mute">—</span>}
                  </td>
                </tr>
                <tr>
                  <td className="mute">Tenant</td>
                  <td className="mono mute">{h.tenantId || <span className="mute">—</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
