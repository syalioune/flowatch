// SPDX-License-Identifier: Apache-2.0

/**
 * Batches list route (Story 24.1, FR-53).
 *
 * Canonical-archetype list screen — loader + pendingComponent + errorComponent
 * + EmptyState. Backed by `api.listBatches` against `/management/batches`.
 * Read-only surface (no row actions, no batch-mutation modals); per-part
 * stacktrace inspection lives on the detail route's <BatchPartsPanel>.
 */

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type React from "react";
import { api, type FlowableBatch } from "../../api";
import { fmtTime, Icon, PageHead } from "../../components";
import { statusToTone } from "../../components/BatchPartsPanel";
import { EmptyState, getEmptyState } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { TableSkeleton } from "../../lib/table-skeleton";

export const loadBatches = () => api.listBatches({ size: 50 });

export const Route = createFileRoute("/batches/")({
  loader: () => loadBatches(),
  staticData: {
    title: "Batches",
    endpoints: [{ method: "GET", path: "/management/batches", desc: "List batches" }],
  },
  component: BatchesRoute,
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
        title="Batches"
        subtitle="Bulk operations — async housekeeping jobs and their per-part status."
        actions={
          <button
            type="button"
            className="btn"
            data-testid="batches-refresh"
            onClick={onRefresh}
            disabled={!onRefresh}
          >
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function BatchesRoute() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/batches/" });

  if (data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh}>
        <EmptyState entry={getEmptyState("batches")} />
      </PageChrome>
    );
  }

  return (
    <PageChrome onRefresh={refresh}>
      <table className="tbl" data-testid="batches-table">
        <thead>
          <tr>
            <th scope="col">Batch ID</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Started</th>
            <th scope="col">Parts</th>
            <th scope="col">Tenant</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((b: FlowableBatch) => {
            const total = b.totalBatchParts ?? 0;
            const succeeded = b.succeededBatchParts ?? 0;
            const failed = b.failedBatchParts ?? 0;
            return (
              <tr key={b.id} data-batch-id={b.id} data-testid={`batch-row-${b.id}`}>
                <td className="mono">
                  <Link to="/batches/$id" params={{ id: b.id }}>
                    {b.id}
                  </Link>
                </td>
                <td className="mono mute">
                  <span className="badge" data-tone="mute">
                    <span className="sr-only">Batch type: </span>
                    {b.type ?? "—"}
                  </span>
                </td>
                <td>
                  <span className="badge" data-tone={statusToTone(b.status)}>
                    <span className="sr-only">Status: </span>
                    {b.status ?? "—"}
                  </span>
                </td>
                <td className="mute mono">{fmtTime(b.createTime)}</td>
                <td className="mono">
                  <span className="sr-only">Parts: </span>
                  {succeeded} / {total}
                  {failed > 0 && (
                    <span className="badge" data-tone="bad" style={{ marginLeft: 8 }}>
                      <span className="sr-only">Failed: </span>+{failed} failed
                    </span>
                  )}
                </td>
                <td className="mono">{b.tenantId || <span className="mute">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageChrome>
  );
}
