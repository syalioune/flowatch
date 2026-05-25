// SPDX-License-Identifier: Apache-2.0

/**
 * Deployments list route — canonical archetype for v1 list screens.
 *
 * Story 9.1 (MN-8) elects the TanStack Router `loader` + `pendingComponent`
 * + `errorComponent` pattern as the v1 canonical for URL-identity list data.
 * Stories 9.4 / 10.1 / 11.1 / 12.1 / 13.1 / 14.1 / 15.1 copy this shape
 * verbatim. See _bmad-output/implementation-artifacts/9-1-*.md for the spec.
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableDeployment } from "../../api";
import { fmtTime, Icon, PageHead, toast } from "../../components";
import { DeleteDeploymentModal } from "../../lib/delete-deployment-modal";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";
import { UploadDeploymentModal } from "../../lib/upload-deployment-modal";

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
  uploadButtonRef?: React.RefObject<HTMLButtonElement>;
}

/**
 * Shared page chrome so the four states (pending / error / empty / data)
 * share an identical header — pages don't "blank" between transitions.
 */
function PageChrome({ children, onRefresh, onUpload, uploadButtonRef }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Deployments"
        subtitle="Every BAR / BPMN / DMN deployed to this engine."
        actions={
          <>
            <button
              ref={uploadButtonRef}
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
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<FlowableDeployment | null>(null);
  // Story 10.2 AC-7: focus-restore. Upload trigger is the page-level Upload
  // button (single instance). Delete trigger is the last-clicked row's
  // RowActionMenu trigger (per the pragmatic shared-ref alternative).
  const uploadButtonRef = React.useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = React.useRef<HTMLElement | null>(null);
  const refresh = () => router.invalidate();
  const onUpload = () => setUploadOpen(true);
  const openDetail = (id: string) => navigate({ to: "/deployments/$id", params: { id } });
  const handleUploadSuccess = (deployment: { id: string; name: string }) => {
    toast({
      kind: "ok",
      text: `Deployed: ${deployment.name || deployment.id}`,
      sub: `id ${deployment.id}`,
      ttl: 3000,
    });
    router.invalidate({ filter: (r) => r.routeId === "/deployments/" });
  };
  const handleDeleteSettled = () => {
    router.invalidate({ filter: (r) => r.routeId === "/deployments/" });
  };

  const modal = (
    <>
      <UploadDeploymentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        triggerRef={uploadButtonRef}
      />
      <DeleteDeploymentModal
        deployment={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSettled={handleDeleteSettled}
        triggerRef={deleteTriggerRef}
      />
    </>
  );

  if (data.data.length === 0) {
    return (
      <>
        <PageChrome onRefresh={refresh} onUpload={onUpload} uploadButtonRef={uploadButtonRef}>
          {(() => {
            const entry = emptyStates.deployments;
            if (!entry) return null;
            return <EmptyState entry={entry} />;
          })()}
        </PageChrome>
        {modal}
      </>
    );
  }

  return (
    <>
      <PageChrome onRefresh={refresh} onUpload={onUpload} uploadButtonRef={uploadButtonRef}>
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
              <tr
                key={d.id}
                data-deployment-id={d.id}
                // biome-ignore lint/a11y/noNoninteractiveTabindex: row is the nav affordance; Enter triggers via onKeyDown
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => openDetail(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(d.id);
                }}
              >
                <td>
                  <b style={{ fontWeight: 500 }}>{d.name || "—"}</b>
                </td>
                <td className="mono mute">{d.id}</td>
                <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
                <td className="mute mono">{fmtTime(d.deploymentTime)}</td>
                <td
                  // Capture the row's RowActionMenu trigger for focus-restore.
                  onClickCapture={(e) => {
                    const target = e.target as HTMLElement | null;
                    const trigger = target?.closest(
                      '[data-testid="row-action-trigger"]',
                    ) as HTMLElement | null;
                    if (trigger) deleteTriggerRef.current = trigger;
                  }}
                >
                  <RowActionMenu
                    ariaLabel={`Actions for deployment ${d.name || d.id}`}
                    items={[
                      {
                        label: "Delete",
                        danger: true,
                        onSelect: () => setDeleteTarget(d),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageChrome>
      {modal}
    </>
  );
}
