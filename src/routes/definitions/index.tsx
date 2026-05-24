// SPDX-License-Identifier: Apache-2.0

/**
 * Process definitions list route (Story 9.4) — second application of the
 * Story 9.1 canonical list archetype. Structural copy of
 * src/routes/deployments/index.tsx; the diff is: column rendering,
 * optimistic-UI handler for suspend/activate, and a placeholder
 * Start-instance menu item (forward-reference to Story 10.2).
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableProcessDefinition } from "../../api";
import { Icon, PageHead, toast } from "../../components";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";

// Exported for unit testing of AC-1 / AC-12-style tenantId-omission.
export const loadDefinitions = () => {
  const tenantId = api.config().tenantId;
  return api.listProcessDefinitions({
    size: 50,
    sort: "name",
    ...(tenantId ? { tenantId } : {}),
  });
};

export const Route = createFileRoute("/definitions/")({
  loader: loadDefinitions,
  staticData: {
    title: "Process definitions",
    endpoints: [
      { method: "GET", path: "/repository/process-definitions", desc: "List process definitions" },
      { method: "PUT", path: "/repository/process-definitions/{id}", desc: "Suspend / activate" },
      {
        method: "GET",
        path: "/repository/process-definitions/{id}/resourcedata",
        desc: "Fetch BPMN XML",
      },
    ],
  },
  component: DefinitionsRoute,
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
}

function PageChrome({ children, onRefresh }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Process definitions"
        subtitle="Models that have been deployed. Click a row to inspect, suspend, or start an instance."
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

function DefinitionsRoute() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  // Per-row optimistic-UI state — see story 9.4 AC-6 rationale. Keyed by
  // definition id so parallel toggles on different rows don't conflate.
  const [optimisticSuspended, setOptimisticSuspended] = React.useState<Map<string, boolean>>(
    new Map(),
  );

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/definitions/" });
  const openDetail = (id: string) => navigate({ to: "/definitions/$id", params: { id } });

  const toggleSuspend = async (d: FlowableProcessDefinition) => {
    const current = optimisticSuspended.get(d.id) ?? d.suspended ?? false;
    const next = !current;
    setOptimisticSuspended((m) => new Map(m).set(d.id, next));
    try {
      await api.suspendProcessDefinition(d.id, next);
      toast({
        kind: "ok",
        text: `${next ? "Suspended" : "Activated"}: ${d.name || d.key}`,
        ttl: 3000,
      });
      await router.invalidate({ filter: (r) => r.routeId === "/definitions/" });
      setOptimisticSuspended((m) => {
        const copy = new Map(m);
        copy.delete(d.id);
        return copy;
      });
    } catch (err) {
      // Revert the optimistic flip — engine state is unchanged.
      setOptimisticSuspended((m) => {
        const copy = new Map(m);
        copy.delete(d.id);
        return copy;
      });
      toast({
        kind: "err",
        text: `${next ? "Suspend" : "Activate"} failed`,
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    }
  };

  if (data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh}>
        {(() => {
          const entry = emptyStates.definitions;
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
            <th>Definition</th>
            <th>Key</th>
            <th>Version</th>
            <th>Status</th>
            <th>Tenant</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((d) => {
            const isSuspended = optimisticSuspended.get(d.id) ?? d.suspended ?? false;
            return (
              <tr
                key={d.id}
                data-definition-id={d.id}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: row is the nav affordance; Enter triggers via onKeyDown
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => openDetail(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(d.id);
                }}
              >
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="bpmn" size={14} />
                    <b style={{ fontWeight: 500 }}>{d.name || d.key}</b>
                  </div>
                </td>
                <td className="mono mute">{d.key}</td>
                <td className="mono">v{d.version}</td>
                <td>
                  <span className="badge" data-tone={isSuspended ? "warn" : "ok"}>
                    <span className="dot" />
                    {isSuspended ? "suspended" : "active"}
                  </span>
                </td>
                <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
                <td>
                  <RowActionMenu
                    ariaLabel={`Actions for definition ${d.name || d.key}`}
                    items={[
                      {
                        label: "Open in modeler",
                        onSelect: () => navigate({ to: "/bpmn", search: { definitionId: d.id } }),
                      },
                      {
                        label: isSuspended ? "Activate" : "Suspend",
                        onSelect: () => toggleSuspend(d),
                      },
                      {
                        label: "Start instance",
                        onSelect: () =>
                          toast({
                            kind: "info",
                            text: "Start instance arrives in Story 10.2",
                            ttl: 4000,
                          }),
                      },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageChrome>
  );
}
