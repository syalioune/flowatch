// SPDX-License-Identifier: Apache-2.0

/**
 * Event subscriptions list route (Story 24.2, FR-54).
 *
 * Canonical-archetype list screen — loader + pendingComponent + errorComponent
 * + EmptyState. Backed by `api.listEventSubscriptions` against
 * `/runtime/event-subscriptions`. URL filter params: processInstanceId,
 * eventType (enum), eventName (free text), tenantId. Each filter input
 * updates the URL via `navigate({ search })` so the standalone view is
 * shareable + bookmarkable.
 */

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import type React from "react";
import { z } from "zod";
import { api, type FlowableEventSubscription } from "../../api";
import { fmtTime, Icon, PageHead } from "../../components";
import { EmptyState, getEmptyState } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { TableSkeleton } from "../../lib/table-skeleton";

const eventsSearch = z.object({
  processInstanceId: z.string().optional(),
  eventType: z.enum(["message", "signal", "timer", "compensate", "error"]).optional(),
  eventName: z.string().optional(),
  tenantId: z.string().optional(),
});

export type EventsSearch = z.infer<typeof eventsSearch>;

export const loadEventSubscriptions = (params: EventsSearch) =>
  api.listEventSubscriptions({ ...params, size: 50 });

export const Route = createFileRoute("/events/")({
  validateSearch: eventsSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadEventSubscriptions(deps),
  staticData: {
    title: "Event subscriptions",
    endpoints: [
      {
        method: "GET",
        path: "/runtime/event-subscriptions",
        desc: "List event subscriptions",
      },
    ],
  },
  component: EventsRoute,
  pendingComponent: () => (
    <PageChrome>
      <TableSkeleton columns={6} rows={6} />
    </PageChrome>
  ),
  errorComponent: ({ error, reset }) => (
    <PageChrome>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  ),
});

interface PageChromeProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  filters?: React.ReactNode;
}

function PageChrome({ children, onRefresh, filters }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Event subscriptions"
        subtitle="Messages, signals, and timers the engine is waiting on."
        actions={
          <button
            type="button"
            className="btn"
            data-testid="events-refresh"
            onClick={onRefresh}
            disabled={!onRefresh}
          >
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      {filters}
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function EventsRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: "/events/" });

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/events/" });

  const updateFilter = (key: keyof EventsSearch, value: string | undefined) => {
    navigate({
      search: (prev) => {
        const next = { ...prev } as EventsSearch;
        if (value) next[key] = value as never;
        else delete next[key];
        return next;
      },
    });
  };

  const filters = (
    <div
      className="seg-row"
      data-testid="events-filters"
      style={{ padding: "0 0 12px 0", gap: 8, flexWrap: "wrap" }}
    >
      <select
        aria-label="Filter by event type"
        data-testid="events-event-type-filter"
        value={search.eventType ?? ""}
        onChange={(e) => updateFilter("eventType", e.target.value || undefined)}
        className="mono"
        style={{ padding: "4px 8px" }}
      >
        <option value="">All types</option>
        <option value="message">message</option>
        <option value="signal">signal</option>
        <option value="timer">timer</option>
        <option value="compensate">compensate</option>
        <option value="error">error</option>
      </select>
      <input
        type="text"
        aria-label="Filter by event name"
        data-testid="events-event-name-filter"
        placeholder="Event name"
        // `key` remounts the input when the URL changes (back/forward) so
        // `defaultValue` re-reads the search param; commit on blur OR Enter.
        key={`name-${search.eventName ?? ""}`}
        defaultValue={search.eventName ?? ""}
        onBlur={(e) => updateFilter("eventName", e.target.value || undefined)}
        onKeyDown={(e) => {
          if (e.key === "Enter") updateFilter("eventName", e.currentTarget.value || undefined);
        }}
        className="mono"
        style={{ padding: "4px 8px" }}
      />
      <input
        type="text"
        aria-label="Filter by process instance ID"
        data-testid="events-process-instance-id-filter"
        placeholder="Process instance ID"
        key={`pi-${search.processInstanceId ?? ""}`}
        defaultValue={search.processInstanceId ?? ""}
        onBlur={(e) => updateFilter("processInstanceId", e.target.value || undefined)}
        onKeyDown={(e) => {
          if (e.key === "Enter")
            updateFilter("processInstanceId", e.currentTarget.value || undefined);
        }}
        className="mono"
        style={{ padding: "4px 8px" }}
      />
      <input
        type="text"
        aria-label="Filter by tenant ID"
        data-testid="events-tenant-id-filter"
        placeholder="Tenant ID"
        key={`tenant-${search.tenantId ?? ""}`}
        defaultValue={search.tenantId ?? ""}
        onBlur={(e) => updateFilter("tenantId", e.target.value || undefined)}
        onKeyDown={(e) => {
          if (e.key === "Enter") updateFilter("tenantId", e.currentTarget.value || undefined);
        }}
        className="mono"
        style={{ padding: "4px 8px" }}
      />
    </div>
  );

  if (data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh} filters={filters}>
        <EmptyState entry={getEmptyState("eventSubscriptions")} />
      </PageChrome>
    );
  }

  return (
    <PageChrome onRefresh={refresh} filters={filters}>
      <table className="tbl" data-testid="events-table">
        <thead>
          <tr>
            <th scope="col">Subscription ID</th>
            <th scope="col">Type</th>
            <th scope="col">Name</th>
            <th scope="col">Process instance</th>
            <th scope="col">Activity</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((s: FlowableEventSubscription) => (
            <tr
              key={s.id}
              data-event-subscription-id={s.id}
              data-testid={`event-subscription-row-${s.id}`}
            >
              <td className="mono">{s.id}</td>
              <td>
                <span className="badge" data-tone="mute">
                  <span className="sr-only">Event type: </span>
                  {s.eventType ?? "—"}
                </span>
              </td>
              <td className="mono">{s.eventName || <span className="mute">—</span>}</td>
              <td className="mono">
                {s.processInstanceId ? (
                  <Link to="/instances/$id" params={{ id: s.processInstanceId }}>
                    {s.processInstanceId}
                  </Link>
                ) : (
                  <span className="mute">—</span>
                )}
              </td>
              <td className="mono mute">{s.activityId || <span className="mute">—</span>}</td>
              <td className="mute mono">{fmtTime(s.created)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageChrome>
  );
}
