// SPDX-License-Identifier: Apache-2.0

/**
 * Historic activity instances panel (Story 13.2) — sixth panel-as-sibling
 * consumer after 10.4 / 11.3 / 12.4 / 13.1-runtime / 13.1-historic. Project
 * decision (Epic 12 retro R-2): never extract. The pattern's value IS the
 * conformance.
 *
 * Status-aware error-probe pattern (Epic 11 retro §4.4): 404 → null (treated
 * the same as `data: []` — operator distinction is meaningless for a
 * filtered list response); other errors → re-throw → <ErrorBox>.
 *
 * Mounted as the third sibling under /instances/$id (after the runtime +
 * historic panels). Order is fixed: runtime (now) → historic (snapshot) →
 * activities (chronological trail).
 *
 * Renders the activities as a timeline (left-rail dots + connecting line),
 * porting the visual treatment from the legacy src/screens.tsx History
 * component. Per R-3 (Epic 12 retro §5), the default size=200 cap is
 * surfaced as a passive footer note when the cap is hit.
 */

import { api, FlowableError, type FlowableHistoricActivity } from "../api";
import { fmtMs, Icon } from "../components";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

// Engine-returned fields not on the typed FlowableHistoricActivity DTO.
// Mirrors the 12.1 `JobWide` Loose<T> cast pattern.
type ActivityWide = FlowableHistoricActivity & {
  assignee?: string;
};

const ACTIVITIES_PAGE_SIZE = 200;

export const fetchActivitiesOrNull = async (
  instanceId: string,
): Promise<FlowableHistoricActivity[] | null> => {
  try {
    const page = await api.listHistoricActivities({
      processInstanceId: instanceId,
      size: ACTIVITIES_PAGE_SIZE,
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

interface DotTone {
  background: string;
  border: string;
}

const dotTone = (activityType: string): DotTone => {
  if (activityType === "endEvent") {
    return { background: "var(--fg)", border: "1.5px solid var(--fg-soft)" };
  }
  if (activityType === "userTask") {
    return { background: "var(--accent)", border: "1.5px solid var(--accent)" };
  }
  if (activityType === "startEvent") {
    return { background: "transparent", border: "1.5px solid var(--fg-soft)" };
  }
  return { background: "var(--bg-elev)", border: "1.5px solid var(--fg-soft)" };
};

export function InstanceHistoricActivitiesPanel({ instanceId }: Props) {
  const activities = useApi<FlowableHistoricActivity[] | null>(
    () => fetchActivitiesOrNull(instanceId),
    [instanceId],
  );

  const list = activities.data ?? [];
  const showCapNote = list.length === ACTIVITIES_PAGE_SIZE;

  return (
    <div
      className="panel"
      data-testid="instance-historic-activities-panel"
      style={{ marginTop: 18 }}
    >
      <div className="panel-hd">
        <span className="panel-title">Activity audit trail</span>
        {activities.data && list.length > 0 && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            <span className="sr-only">Count: </span>
            {list.length}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /history/historic-activity-instances?processInstanceId={instanceId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="historic-activities-refresh"
          onClick={activities.reload}
          disabled={activities.loading}
          aria-label="Refresh activity audit trail"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {activities.loading && <TableSkeleton columns={3} rows={4} />}
        {activities.error && <ErrorBox error={activities.error} onRetry={activities.reload} />}
        {!activities.loading && !activities.error && list.length === 0 && (
          <EmptyState entry={getEmptyState("historicActivities")} />
        )}
        {!activities.loading && !activities.error && list.length > 0 && (
          <>
            <div
              data-testid="historic-activities-timeline"
              style={{ position: "relative", paddingLeft: 18 }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 7,
                  top: 6,
                  bottom: 6,
                  width: 1,
                  background: "var(--line)",
                }}
              />
              {list.map((raw) => {
                const a = raw as ActivityWide;
                const tone = dotTone(a.activityType);
                return (
                  <div
                    key={a.id}
                    data-activity-id={a.id}
                    style={{ position: "relative", paddingBottom: 14 }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: -15,
                        top: 4,
                        width: 11,
                        height: 11,
                        borderRadius: "50%",
                        background: tone.background,
                        border: tone.border,
                      }}
                    />
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {a.activityName || a.activityId}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                      {a.activityType} · {a.activityId}
                      {a.assignee != null && <> · assignee: {a.assignee}</>}
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: 11, color: "var(--fg-soft)", marginTop: 2 }}
                    >
                      {a.endTime ? fmtMs(a.durationInMillis) : "(in progress)"}
                    </div>
                  </div>
                );
              })}
            </div>
            {showCapNote && (
              <div
                className="mute"
                data-testid="historic-activities-cap-note"
                style={{ fontSize: 11, padding: "8px 0", textAlign: "center" }}
              >
                Showing 200 most recent activities (older activities not shown).
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
