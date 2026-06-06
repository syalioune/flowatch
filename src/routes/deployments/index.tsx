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
import { api, type FlowableDeployment, type QueryParams } from "../../api";
import { fmtTime, Icon, PageHead, toast } from "../../components";
import { DeleteDeploymentModal } from "../../lib/delete-deployment-modal";
import { DeleteDmnDeploymentModal } from "../../lib/delete-dmn-deployment-modal";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";
import { UploadDeploymentModal } from "../../lib/upload-deployment-modal";

export type DeploymentKind = "bpmn" | "dmn" | "bar";

export interface TaggedDeployment extends FlowableDeployment {
  kind: DeploymentKind;
}

// Story 25.1: BPMN deployments backed by a .bar upload are CHILDREN of the
// App-sub-app deployment that the AppDeployer spawned for them. Standalone
// BPMN deploys carry `parentDeploymentId === id` (engine sets it = self);
// app-spawned BPMN children carry `parentDeploymentId` pointing at the
// app-deployment id. The mismatch is the BAR discriminator.
const isBarChild = (d: FlowableDeployment): boolean =>
  !!d.parentDeploymentId && d.parentDeploymentId !== d.id;

export interface DeploymentsLoaderData {
  data: TaggedDeployment[];
  // DMN failure is non-fatal — the page still shows BPMN rows. The error
  // message renders inline above the table so the operator knows their view
  // is partial (engines without the dmn-api sub-app are valid configurations).
  dmnError: string | null;
}

// Exported for unit testing of the AC-12 tenantId-omission behaviour AND
// the BPMN+DMN merge. Not re-used elsewhere — the route's `loader` slot is
// the only production caller.
export const loadDeployments = async (): Promise<DeploymentsLoaderData> => {
  const tenantId = api.config().tenantId;
  // Per AC-12: only pass tenantId when non-empty. An empty string here
  // would tell the engine "filter to tenant '' " — the loader must instead
  // OMIT the param entirely so single-tenant deployments return all rows.
  const bpmnParams: QueryParams = {
    size: 50,
    sort: "deployTime",
    order: "desc",
    ...(tenantId ? { tenantId } : {}),
  };
  // DMN's deployment list endpoint accepts a different sort vocabulary —
  // omit sort/order and rely on the post-merge sort below.
  const dmnParams: QueryParams = {
    size: 50,
    ...(tenantId ? { tenantId } : {}),
  };
  const [bpmnRes, dmnRes] = await Promise.allSettled([
    api.listDeployments(bpmnParams),
    api.listDmnDeployments(dmnParams),
  ]);
  if (bpmnRes.status === "rejected") throw bpmnRes.reason;
  const bpmnRows: TaggedDeployment[] = bpmnRes.value.data.map((d) => ({
    ...d,
    kind: isBarChild(d) ? "bar" : "bpmn",
  }));
  const dmnRows: TaggedDeployment[] =
    dmnRes.status === "fulfilled" ? dmnRes.value.data.map((d) => ({ ...d, kind: "dmn" })) : [];
  const dmnError =
    dmnRes.status === "rejected"
      ? dmnRes.reason instanceof Error
        ? dmnRes.reason.message
        : String(dmnRes.reason)
      : null;
  // deploymentTime is ISO-8601 — string compare gives chronological order.
  const data = [...bpmnRows, ...dmnRows].sort((a, b) =>
    (b.deploymentTime || "").localeCompare(a.deploymentTime || ""),
  );
  return { data, dmnError };
};

export const Route = createFileRoute("/deployments/")({
  loader: loadDeployments,
  staticData: {
    title: "Deployments",
    endpoints: [
      { method: "GET", path: "/repository/deployments", desc: "List BPMN deployments" },
      {
        method: "GET",
        path: "/dmn-repository/deployments",
        desc: "List DMN deployments (dmnBase)",
      },
      { method: "POST", path: "/repository/deployments", desc: "Upload .bpmn / .bar" },
      { method: "DELETE", path: "/repository/deployments/{deploymentId}", desc: "Remove BPMN" },
      {
        method: "DELETE",
        path: "/dmn-repository/deployments/{deploymentId}",
        desc: "Remove DMN (dmnBase)",
      },
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
  const [deleteBpmnTarget, setDeleteBpmnTarget] = React.useState<FlowableDeployment | null>(null);
  const [deleteDmnTarget, setDeleteDmnTarget] = React.useState<FlowableDeployment | null>(null);
  // Story 10.2 AC-7: focus-restore. Upload trigger is the page-level Upload
  // button (single instance). Delete trigger is the last-clicked row's
  // RowActionMenu trigger (per the pragmatic shared-ref alternative).
  const uploadButtonRef = React.useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = React.useRef<HTMLElement | null>(null);
  const refresh = () => router.invalidate();
  const onUpload = () => setUploadOpen(true);
  const openDetail = (id: string, kind: DeploymentKind) =>
    navigate({ to: "/deployments/$id", params: { id }, search: { kind } });
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

  // Tab-aware action-verb dispatch (Epic 12 retro §4.2) — the discriminant
  // lives in the row's `kind` and selects the right delete modal.
  const onDelete = (d: TaggedDeployment) => {
    if (d.kind === "dmn") setDeleteDmnTarget(d);
    else setDeleteBpmnTarget(d);
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
        deployment={deleteBpmnTarget}
        onClose={() => setDeleteBpmnTarget(null)}
        onSettled={handleDeleteSettled}
        triggerRef={deleteTriggerRef}
      />
      <DeleteDmnDeploymentModal
        deploymentId={deleteDmnTarget?.id ?? null}
        onClose={() => setDeleteDmnTarget(null)}
        onSettled={handleDeleteSettled}
        triggerRef={deleteTriggerRef}
      />
    </>
  );

  // DMN sub-app may be unreachable on engines that don't expose dmn-api;
  // surface the partial-fetch state inline so the operator knows their view
  // is BPMN-only.
  const dmnWarning = data.dmnError ? (
    <div
      data-testid="dmn-fetch-warning"
      className="mute mono"
      style={{
        margin: "0 0 12px 0",
        padding: "8px 12px",
        border: "1px solid var(--bd)",
        borderRadius: 4,
        fontSize: 12,
      }}
    >
      DMN deployments unavailable: {data.dmnError}
    </div>
  ) : null;

  if (data.data.length === 0) {
    return (
      <>
        <PageChrome onRefresh={refresh} onUpload={onUpload} uploadButtonRef={uploadButtonRef}>
          {dmnWarning}
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
        {dmnWarning}
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">ID</th>
              <th scope="col">Tenant</th>
              <th scope="col">Deployed</th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((d) => (
              <tr
                key={`${d.kind}-${d.id}`}
                data-deployment-id={d.id}
                data-kind={d.kind}
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => openDetail(d.id, d.kind)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(d.id, d.kind);
                }}
              >
                <td>
                  <b style={{ fontWeight: 500 }}>{d.name || "—"}</b>
                </td>
                <td className="mono mute">
                  {d.kind === "bar" ? "BAR" : d.kind === "dmn" ? "DMN" : "BPMN"}
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
                    ariaLabel={`Actions for ${d.kind.toUpperCase()} deployment ${d.name || d.id}`}
                    items={[
                      {
                        label: "Delete",
                        danger: true,
                        onSelect: () => onDelete(d),
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
