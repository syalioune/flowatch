// SPDX-License-Identifier: Apache-2.0

/**
 * Process instances list route (Story 10.1) — third application of the
 * Story 9.1 canonical list archetype (loader + four-state contract +
 * EmptyState + RowActionMenu + TableSkeleton). Structural copy of
 * src/routes/definitions/index.tsx. The diff is: column rendering, no
 * optimistic UI (instances don't toggle), and a Cancel placeholder
 * forward-referencing Story 10.3.
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import {
  api,
  type FlowableHistoricActivity,
  type FlowablePage,
  type FlowableProcessInstance,
} from "../../api";
import { fmtTime, Icon, PageHead } from "../../components";
import { summarizeActiveActivities } from "../../components/InstanceRuntimePanel";
import { CancelInstanceModal } from "../../lib/cancel-instance-modal";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { type RowActionItem, RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";

// Engine-returned fields not on the typed FlowableProcessInstance DTO — same
// rationale as the legacy screens.tsx `Loose<T>` pattern. A formal widening
// of FlowableProcessInstance is deferred to a future API-surface story.
type InstanceWide = FlowableProcessInstance & {
  processDefinitionName?: string;
  activityId?: string;
  startUserId?: string;
};

const stateOf = (pi: { suspended?: boolean; ended?: boolean }): string =>
  pi.suspended ? "suspended" : pi.ended ? "ended" : "active";

// One-shot ceiling for the parallel active-activities fetch. Bounded large
// enough to cover most operator-scale engines without paginating; the
// activities-per-instance map is built client-side from this single page.
const ACTIVE_ACTIVITIES_BATCH_SIZE = 500;

export interface InstancesLoaderData {
  instances: FlowablePage<FlowableProcessInstance>;
  activeActivities: FlowablePage<FlowableHistoricActivity>;
}

// Exported for unit testing of the AC-1 tenantId-omission behaviour + the
// parallel active-activities fetch. The active-activities call is a single
// batch (no per-row N+1) — grouped client-side to populate the Activity
// column. Sort/order omitted because the column shows a derived summary
// (first name + count); preserving start-time order keeps the per-instance
// summary stable across reloads.
export const loadProcessInstances = async (): Promise<InstancesLoaderData> => {
  const tenantId = api.config().tenantId;
  const instancesParams = {
    size: 50,
    sort: "startTime",
    order: "desc",
    // Per the 9.1 / 9.4 archetype: only pass tenantId when non-empty. An
    // empty string would tell the engine "filter to tenant ''" — the loader
    // must instead OMIT the param so single-tenant deployments return rows.
    ...(tenantId ? { tenantId } : {}),
  };
  const [instances, activeActivities] = await Promise.all([
    api.listProcessInstances(instancesParams),
    api.listHistoricActivities({
      finished: false,
      size: ACTIVE_ACTIVITIES_BATCH_SIZE,
      sort: "startTime",
    }),
  ]);
  return { instances, activeActivities };
};

// Build a Map<processInstanceId, activities[]> from a flat active-activities
// page. Exported for unit testing.
export const groupActivitiesByInstance = (
  activities: FlowableHistoricActivity[],
): Map<string, FlowableHistoricActivity[]> => {
  const map = new Map<string, FlowableHistoricActivity[]>();
  for (const a of activities) {
    const pid = a.processInstanceId;
    if (!pid) continue;
    const bucket = map.get(pid);
    if (bucket) bucket.push(a);
    else map.set(pid, [a]);
  }
  return map;
};

export const Route = createFileRoute("/instances/")({
  loader: loadProcessInstances,
  staticData: {
    title: "Process instances",
    endpoints: [
      {
        method: "GET",
        path: "/runtime/process-instances",
        desc: "List running instances",
      },
      {
        method: "DELETE",
        path: "/runtime/process-instances/{id}",
        desc: "Cancel instance",
      },
    ],
  },
  component: ProcessInstancesRoute,
  pendingComponent: () => (
    <PageChrome>
      <TableSkeleton columns={7} rows={6} />
    </PageChrome>
  ),
  errorComponent: ({ error, reset }) => (
    <PageChrome>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  ),
});

// Note: the loader's staticData widens to include the historic-activity
// endpoint via the route's combined fetch. We keep the documented
// endpoints concise on the chip row above; the Inspector log surfaces the
// historic-activity-instances?finished=false call as the parallel fetch
// that fills the Activity column.

interface PageChromeProps {
  children: React.ReactNode;
  onRefresh?: () => void;
}

function PageChrome({ children, onRefresh }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Process instances"
        subtitle="Currently-running instances across all definitions."
        actions={
          <button type="button" className="btn" onClick={onRefresh} disabled={!onRefresh}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function ProcessInstancesRoute() {
  const data = Route.useLoaderData();
  const instancesPage = data.instances;
  const activitiesByInstance = React.useMemo(
    () => groupActivitiesByInstance(data.activeActivities.data),
    [data.activeActivities.data],
  );
  const router = useRouter();
  const navigate = useNavigate();
  // Story 10.3: Cancel target (null is closed). Per the 10.2 T-2.4 shared-ref
  // alternative, the focus-restore target is the last-clicked row's
  // RowActionMenu trigger.
  const [cancelTarget, setCancelTarget] = React.useState<FlowableProcessInstance | null>(null);
  const cancelTriggerRef = React.useRef<HTMLElement | null>(null);

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/instances/" });
  const openDetail = (id: string) => navigate({ to: "/instances/$id", params: { id } });
  const handleCancelSettled = () => {
    router.invalidate({ filter: (r) => r.routeId === "/instances/" });
  };

  if (instancesPage.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh}>
        {(() => {
          const entry = emptyStates.instances;
          if (!entry) return null;
          return <EmptyState entry={entry} />;
        })()}
      </PageChrome>
    );
  }

  return (
    <PageChrome onRefresh={refresh}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Business key</th>
            <th>Definition</th>
            <th>Activity</th>
            <th>Started by</th>
            <th>Started</th>
            <th>State</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {instancesPage.data.map((raw) => {
            const p = raw as InstanceWide;
            const state = stateOf(p);
            const items: RowActionItem[] = [];
            if (!p.ended) {
              items.push({
                label: "Cancel",
                danger: true,
                onSelect: () => setCancelTarget(p),
              });
            }
            const activeForRow = activitiesByInstance.get(p.id) ?? [];
            const activitySummary = summarizeActiveActivities(activeForRow);
            const activityTitle =
              activeForRow.length > 0
                ? activeForRow.map((a) => a.activityName || a.activityId).join(", ")
                : undefined;
            return (
              <tr
                key={p.id}
                data-instance-id={p.id}
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => openDetail(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(p.id);
                }}
              >
                <td className="mono">{p.businessKey || p.id}</td>
                <td>{p.processDefinitionName || p.processDefinitionKey}</td>
                <td className="soft" data-testid="instance-activity-summary" title={activityTitle}>
                  {activitySummary}
                </td>
                <td className="mono mute">{p.startUserId || <span className="mute">—</span>}</td>
                <td className="mute mono">{fmtTime(p.startTime)}</td>
                <td>
                  <span className="badge" data-tone={state === "active" ? "ok" : "warn"}>
                    <span className="dot" />
                    {state}
                  </span>
                </td>
                <td
                  // Capture the actually-clicked row's RowActionMenu trigger
                  // for focus-restore (mirrors the 10.2 definitions-route
                  // pattern).
                  onClickCapture={(e) => {
                    const target = e.target as HTMLElement | null;
                    const trigger = target?.closest(
                      '[data-testid="row-action-trigger"]',
                    ) as HTMLElement | null;
                    if (trigger) cancelTriggerRef.current = trigger;
                  }}
                >
                  {items.length > 0 && (
                    <RowActionMenu
                      ariaLabel={`Actions for instance ${p.businessKey || p.id}`}
                      items={items}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <CancelInstanceModal
        instance={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onSettled={handleCancelSettled}
        triggerRef={cancelTriggerRef}
      />
    </PageChrome>
  );
}
