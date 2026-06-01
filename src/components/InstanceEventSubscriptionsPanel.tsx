// SPDX-License-Identifier: Apache-2.0

/**
 * Instance event subscriptions panel (Story 24.2, FR-54).
 *
 * Panel-as-sibling consumer (steady-state N=many; never extracted per
 * CLAUDE.md "Panel-as-sibling is never extracted into a shared abstraction"
 * Epic 12 retro R-2). Lists the messages / signals / timers a running
 * process instance is waiting on; reads from /runtime/event-subscriptions
 * filtered by processInstanceId.
 *
 * Status-aware error-probe (Epic 11 retro §4.4): 404 → null → empty state.
 * Other errors propagate to <ErrorBox>.
 *
 * Mounted inside <InstanceRuntimePanel> between <InstanceActiveActivitiesPanel>
 * and <InstanceVariablesPanel> — operator-feel ordering of "what's active"
 * → "what's the engine waiting on" → "what variables are in scope."
 */

import { Link } from "@tanstack/react-router";
import { api, FlowableError, type FlowableEventSubscription } from "../api";
import { fmtTime, Icon } from "../components";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

const PAGE_SIZE = 50;

export const fetchEventSubscriptionsOrNull = async (
  instanceId: string,
): Promise<FlowableEventSubscription[] | null> => {
  try {
    const page = await api.listEventSubscriptions({
      processInstanceId: instanceId,
      size: PAGE_SIZE,
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

export function InstanceEventSubscriptionsPanel({ instanceId }: Props) {
  const subs = useApi<FlowableEventSubscription[] | null>(
    () => fetchEventSubscriptionsOrNull(instanceId),
    [instanceId],
  );
  const list = subs.data ?? [];

  return (
    <div
      className="panel"
      data-testid="instance-event-subscriptions-panel"
      style={{ marginTop: 18 }}
    >
      <div className="panel-hd">
        <span className="panel-title">Event subscriptions</span>
        {subs.data && (
          <span
            className="badge"
            data-tone={list.length > 0 ? "ok" : "mute"}
            style={{ marginLeft: 8 }}
          >
            <span className="sr-only">Count: </span>
            {list.length}
          </span>
        )}
        <Link
          to="/events"
          search={{ processInstanceId: instanceId }}
          className="mute"
          data-testid="event-subscriptions-view-all"
          style={{ marginLeft: 8, fontSize: 11 }}
        >
          View all…
        </Link>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /runtime/event-subscriptions?processInstanceId={instanceId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="event-subscriptions-refresh"
          onClick={subs.reload}
          disabled={subs.loading}
          aria-label="Refresh event subscriptions"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {subs.loading && <TableSkeleton columns={4} rows={2} />}
        {subs.error && <ErrorBox error={subs.error} onRetry={subs.reload} />}
        {!subs.loading && !subs.error && list.length === 0 && (
          <EmptyState entry={getEmptyState("eventSubscriptionsForInstance")} />
        )}
        {!subs.loading && !subs.error && list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Name</th>
                <th scope="col">Activity</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} data-testid={`event-subscription-row-${s.id}`}>
                  <td>
                    <span className="badge" data-tone="mute">
                      <span className="sr-only">Event type: </span>
                      {s.eventType ?? "—"}
                    </span>
                  </td>
                  <td className="mono">{s.eventName || <span className="mute">—</span>}</td>
                  <td className="mono mute">{s.activityId || <span className="mute">—</span>}</td>
                  <td className="mute mono">{fmtTime(s.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
