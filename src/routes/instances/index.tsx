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
import type React from "react";
import { api, type FlowableProcessInstance } from "../../api";
import { fmtTime, Icon, PageHead, toast } from "../../components";
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

// Exported for unit testing of the AC-1 tenantId-omission behaviour. Not
// re-used elsewhere — the route's `loader` slot is the only production caller.
export const loadProcessInstances = () => {
  const tenantId = api.config().tenantId;
  return api.listProcessInstances({
    size: 50,
    sort: "startTime",
    order: "desc",
    // Per the 9.1 / 9.4 archetype: only pass tenantId when non-empty. An
    // empty string would tell the engine "filter to tenant ''" — the loader
    // must instead OMIT the param so single-tenant deployments return rows.
    ...(tenantId ? { tenantId } : {}),
  });
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
  const router = useRouter();
  const navigate = useNavigate();

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/instances/" });
  const openDetail = (id: string) => navigate({ to: "/instances/$id", params: { id } });

  if (data.data.length === 0) {
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
          {data.data.map((raw) => {
            const p = raw as InstanceWide;
            const state = stateOf(p);
            const items: RowActionItem[] = [];
            if (!p.ended) {
              items.push({
                label: "Cancel",
                danger: true,
                onSelect: () =>
                  toast({
                    kind: "info",
                    text: "Cancel arrives in Story 10.3",
                    ttl: 4000,
                  }),
                // RowActionItem doesn't declare data-testid in its public
                // interface; the menu renderer doesn't forward arbitrary
                // attrs, but Story 10.3 grep-swaps this menu item by label.
                // The testid wiring lives on the rendered <li> via the
                // shared menu component — added by 10.3's review patch if
                // testid-based selection becomes load-bearing.
              });
            }
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
                <td className="soft">{p.activityId || "—"}</td>
                <td className="mono mute">{p.startUserId || <span className="mute">—</span>}</td>
                <td className="mute mono">{fmtTime(p.startTime)}</td>
                <td>
                  <span className="badge" data-tone={state === "active" ? "ok" : "warn"}>
                    <span className="dot" />
                    {state}
                  </span>
                </td>
                <td>
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
    </PageChrome>
  );
}
