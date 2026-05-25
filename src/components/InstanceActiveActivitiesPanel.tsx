// SPDX-License-Identifier: Apache-2.0

/**
 * Active activities panel — currently-in-flight activities for a running
 * process instance. Eighth panel-as-sibling consumer (after 10.4 / 11.3 /
 * 12.4 / 13.1-runtime / 13.1-historic / 13.2-activities / 13.x-historic-
 * variables). Project decision (Epic 12 retro R-2): never extract.
 *
 * The Flowable runtime DTO only carries a single lead `activityId` per
 * process instance; a parallel-branch instance can have many active
 * activities at once. The historic-activity-instances endpoint with
 * `finished=false` is the supported recipe to enumerate them — the
 * engine writes the historic-activity row at start time, before the
 * activity completes. Calling the historic surface for "active right
 * now" is the operator-feel shortcut Flowable supports (no separate
 * `runtime/active-activities` endpoint exists).
 *
 * Mounted inside <InstanceRuntimePanel> after the properties table and
 * before <InstanceVariablesPanel>. The historic timeline in
 * <InstanceHistoricActivitiesPanel> keeps showing the full audit trail
 * (active + completed) — that's the chronological view; this panel is
 * the "what's running NOW" snapshot.
 *
 * Status-aware error-probe (Epic 11 retro §4.4): 404 → null → empty
 * state. In practice the engine returns `{data:[]}` for an idle or
 * completed instance.
 */

import { api, FlowableError, type FlowableHistoricActivity } from "../api";
import { fmtTime, Icon } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

// Engine-returned fields not on the typed FlowableHistoricActivity DTO.
// Mirrors the 12.1 / 13.2 Loose<T> cast pattern.
type ActiveActivityWide = FlowableHistoricActivity & {
  assignee?: string;
  executionId?: string;
};

const ACTIVE_PAGE_SIZE = 50;

export const fetchActiveActivitiesOrNull = async (
  instanceId: string,
): Promise<FlowableHistoricActivity[] | null> => {
  try {
    const page = await api.listHistoricActivities({
      processInstanceId: instanceId,
      finished: false,
      size: ACTIVE_PAGE_SIZE,
      sort: "startTime",
    });
    return page.data ?? [];
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

interface Props {
  instanceId: string;
}

export function InstanceActiveActivitiesPanel({ instanceId }: Props) {
  const activities = useApi<FlowableHistoricActivity[] | null>(
    () => fetchActiveActivitiesOrNull(instanceId),
    [instanceId],
  );
  const list = activities.data ?? [];

  return (
    <div className="panel" data-testid="instance-active-activities-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Active activities</span>
        {activities.data && list.length > 0 && (
          <span className="badge" data-tone="ok" style={{ marginLeft: 8 }}>
            {list.length}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /history/historic-activity-instances?processInstanceId={instanceId}&finished=false
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="active-activities-refresh"
          onClick={activities.reload}
          disabled={activities.loading}
          aria-label="Refresh active activities"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {activities.loading && <TableSkeleton columns={4} rows={2} />}
        {activities.error && <ErrorBox error={activities.error} onRetry={activities.reload} />}
        {!activities.loading && !activities.error && list.length === 0 && (
          <EmptyState
            entry={emptyStates.activeActivities as NonNullable<typeof emptyStates.activeActivities>}
          />
        )}
        {!activities.loading && !activities.error && list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Type</th>
                <th>Assignee</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {list.map((raw) => {
                const a = raw as ActiveActivityWide;
                return (
                  <tr key={a.id} data-active-activity-id={a.id}>
                    <td>{a.activityName || a.activityId}</td>
                    <td className="mono">
                      <span className="badge" data-tone="mute">
                        {a.activityType}
                      </span>
                    </td>
                    <td className="mono mute">{a.assignee || <span className="mute">—</span>}</td>
                    <td className="mute mono">{fmtTime(a.startTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
