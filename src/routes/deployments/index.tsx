// SPDX-License-Identifier: Apache-2.0

/**
 * Deployments list route — canonical archetype for v1 list screens.
 *
 * Story 9.1 (MN-8) elects the TanStack Router `loader` + `pendingComponent`
 * + `errorComponent` pattern as the v1 canonical for URL-identity list data.
 * Stories 9.4 / 10.1 / 11.1 / 12.1 / 13.1 / 14.1 / 15.1 copy this shape
 * verbatim. See _bmad-output/implementation-artifacts/9-1-*.md for the spec.
 */

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { api } from "../../api";
import { fmtTime, Icon, PageHead, toast } from "../../components";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";

// Exported for unit testing of the AC-12 tenantId-omission behaviour. Not
// re-used elsewhere — the route's `loader` slot is the only production caller.
export const loadDeployments = () => {
  const tenantId = api.config().tenantId;
  return api.listDeployments({
    size: 50,
    sort: "deployTime",
    order: "desc",
    // Per AC-12: only pass tenantId when non-empty. An empty string here
    // would tell the engine "filter to tenant '' " — the loader must instead
    // OMIT the param entirely so single-tenant deployments return all rows.
    ...(tenantId ? { tenantId } : {}),
  });
};

export const Route = createFileRoute("/deployments/")({
  loader: loadDeployments,
  staticData: {
    title: "Deployments",
    endpoints: [
      { method: "GET", path: "/repository/deployments", desc: "List deployments" },
      { method: "POST", path: "/repository/deployments", desc: "Upload .bpmn / .dmn / .bar" },
      { method: "DELETE", path: "/repository/deployments/{deploymentId}", desc: "Remove" },
    ],
  },
  component: DeploymentsRoute,
  pendingComponent: () => (
    <PageChrome>
      <TableSkeleton columns={5} rows={6} />
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
  onUpload?: () => void;
}

/**
 * Shared page chrome so the four states (pending / error / empty / data)
 * share an identical header — pages don't "blank" between transitions.
 */
function PageChrome({ children, onRefresh, onUpload }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Deployments"
        subtitle="Every BAR / BPMN / DMN deployed to this engine."
        actions={
          <>
            <button
              type="button"
              className="btn"
              data-testid="upload-deployment"
              onClick={onUpload}
              disabled={!onUpload}
            >
              <Icon name="upload" size={13} />
              Upload
            </button>
            <button type="button" className="btn" onClick={onRefresh} disabled={!onRefresh}>
              <Icon name="refresh" size={13} />
              Refresh
            </button>
          </>
        }
      />
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function DeploymentsRoute() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const refresh = () => router.invalidate();
  const onUpload = () => {
    toast({ kind: "info", text: "Upload arrives in Story 9.2", ttl: 4000 });
  };

  const deleteDeployment = async (id: string, cascade: boolean) => {
    const label = cascade
      ? "Delete this deployment AND every running instance it produced?"
      : "Delete this deployment? (no cascade — fails if instances exist)";
    if (!confirm(label)) return;
    try {
      await api.deleteDeployment(id, cascade);
      router.invalidate();
    } catch (err) {
      toast({
        kind: "err",
        text: "Delete failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    }
  };

  if (data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh} onUpload={onUpload}>
        {(() => {
          const entry = emptyStates.deployments;
          if (!entry) return null;
          return <EmptyState entry={entry} />;
        })()}
      </PageChrome>
    );
  }

  return (
    <PageChrome onRefresh={refresh} onUpload={onUpload}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>ID</th>
            <th>Tenant</th>
            <th>Deployed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((d) => (
            <tr key={d.id} data-deployment-id={d.id}>
              <td>
                <b style={{ fontWeight: 500 }}>{d.name || "—"}</b>
              </td>
              <td className="mono mute">{d.id}</td>
              <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
              <td className="mute mono">{fmtTime(d.deploymentTime)}</td>
              <td>
                <RowActionMenu
                  ariaLabel={`Actions for deployment ${d.name || d.id}`}
                  items={[
                    {
                      label: "Delete (cascade)",
                      danger: true,
                      onSelect: () => deleteDeployment(d.id, true),
                    },
                    {
                      label: "Delete (no cascade)",
                      danger: true,
                      onSelect: () => deleteDeployment(d.id, false),
                    },
                  ]}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageChrome>
  );
}
