// SPDX-License-Identifier: Apache-2.0

/**
 * Tenants list route (Story 14.4) — ninth application of the Story 9.1
 * canonical list archetype. Simplest variant: single-endpoint, single-tab.
 *
 * The derivation `/repository/deployments?size=200 → distinct tenantIds`
 * is owned by api.listTenants() with a 60-second TTL cache (Story 14.4
 * AC-4). The legacy <Tenants> body in src/screens.tsx (32 LOC) is
 * deleted in this same commit; under the 50-LOC Epic 12 §3.4 threshold
 * so no chore(refactor) split is needed.
 */

import { createFileRoute } from "@tanstack/react-router";
import { api, type FlowableTenant } from "../api";
import { Icon, PageHead } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";

// Exported for unit testing of the loader (canonical archetype convention;
// mirrors loadHistoryByType, loadIdentity, loadJobs).
export const loadTenants = () => api.listTenants();

export const Route = createFileRoute("/tenants")({
  staticData: {
    title: "Tenants",
    endpoints: [
      {
        method: "GET",
        path: "/repository/deployments?size=200",
        desc: "Distinct tenantIds (no /identity/tenants in 7.2)",
      },
    ],
  },
  loader: () => loadTenants(),
  component: TenantsRoute,
  errorComponent: ({ error, reset }) => (
    <div className="page">
      <ErrorBox error={error} onRetry={reset} />
    </div>
  ),
  pendingComponent: () => (
    <div className="page">
      <PageHead
        title="Tenants"
        subtitle="Logical isolation boundaries derived from deployment tenantIds (Flowable REST 7.2 has no /identity/tenants endpoint)."
      />
      <TableSkeleton columns={2} rows={4} />
    </div>
  ),
});

function TenantsRoute() {
  const data = Route.useLoaderData();
  const tenants = (data?.data ?? []).filter((t) => t.id);
  return <TenantsList tenants={tenants} />;
}

interface TenantsListProps {
  tenants: FlowableTenant[];
}

function TenantsList({ tenants }: TenantsListProps) {
  return (
    <div className="page">
      <PageHead
        title="Tenants"
        subtitle="Logical isolation boundaries derived from deployment tenantIds (Flowable REST 7.2 has no /identity/tenants endpoint)."
      />
      {tenants.length === 0 ? (
        <EmptyState entry={emptyStates.tenants as NonNullable<typeof emptyStates.tenants>} />
      ) : (
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {tenants.map((t) => (
            <div
              key={t.id}
              className="kpi"
              data-testid={`tenant-card-${t.id}`}
              style={{ padding: 18 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Icon name="tenant" size={16} />
                <div style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</div>
                <span className="mono mute" style={{ marginLeft: "auto", fontSize: 11 }}>
                  {t.id}
                </span>
              </div>
              <div className="text-xs mute">
                Set this as your active tenant from the topbar; subsequent reads will filter to it.
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
