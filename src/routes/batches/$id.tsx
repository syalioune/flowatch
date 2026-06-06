// SPDX-License-Identifier: Apache-2.0

/**
 * Batch detail route (Story 24.1, FR-53).
 *
 * Dual-fetch sibling-panel shape: route loader fetches the single batch
 * (`api.getBatch`); `<BatchPartsPanel>` owns its own parts fetch via
 * `api.listBatchParts`. A parts-fetch failure surfaces inside the panel
 * without 5xx'ing the whole detail page.
 *
 * The detail's back-link button carries `ref={backLinkRef}` so any future
 * destructive modal on this route can use it as a `fallbackRef` per CLAUDE.md
 * "`fallbackRef` focus-restore for destructive modals".
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import React from "react";
import { api } from "../../api";
import { fmtTime, PageHead } from "../../components";
import { BatchPartsPanel, statusToTone } from "../../components/BatchPartsPanel";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/batches/$id")({
  loader: ({ params }) => api.getBatch(params.id),
  staticData: {
    title: "Batch detail",
    endpoints: [
      { method: "GET", path: "/management/batches/{id}", desc: "Get batch" },
      {
        method: "GET",
        path: "/management/batches/{id}/batch-parts",
        desc: "List batch parts",
      },
      {
        method: "GET",
        path: "/management/batch-parts/{id}/exception-stacktrace",
        desc: "Per-part stacktrace",
      },
    ],
  },
  component: BatchDetailRoute,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/batches" className="btn">
          Back to batches
        </Link>
      </div>
    </div>
  ),
});

function BatchDetailRoute() {
  const batch = Route.useLoaderData();
  const backLinkRef = React.useRef<HTMLAnchorElement | null>(null);

  return (
    <div className="page" data-testid="batch-detail-page">
      <PageHead title={batch.id} subtitle="Batch" />
      <div style={{ padding: "0 0 12px 0" }}>
        <Link
          ref={backLinkRef}
          to="/batches"
          className="btn"
          data-size="sm"
          data-testid="batch-detail-back"
        >
          ← Back to batches
        </Link>
      </div>
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Batch</span>
          {batch.status && (
            <span
              className="badge"
              data-tone={statusToTone(batch.status)}
              style={{ marginLeft: 8 }}
            >
              <span className="sr-only">Status: </span>
              {batch.status}
            </span>
          )}
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /management/batches/{batch.id}
          </span>
        </div>
        <div className="panel-body" style={{ overflow: "auto" }}>
          <table
            className="tbl"
            data-testid="batch-properties-table"
            style={{ border: 0, borderRadius: 0 }}
          >
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  Type
                </td>
                <td className="mono">{batch.type || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Status</td>
                <td className="mono">{batch.status || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Started</td>
                <td className="mono">{fmtTime(batch.createTime)}</td>
              </tr>
              <tr>
                <td className="mute">Completed</td>
                <td className="mono">
                  {batch.completeTime ? (
                    fmtTime(batch.completeTime)
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="mute">Total parts</td>
                <td className="mono">{batch.totalBatchParts ?? <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Succeeded</td>
                <td className="mono">
                  {batch.succeededBatchParts ?? <span className="mute">—</span>}
                </td>
              </tr>
              <tr>
                <td className="mute">Failed parts</td>
                <td className="mono">
                  {batch.failedBatchParts ?? <span className="mute">—</span>}
                </td>
              </tr>
              <tr>
                <td className="mute">Completed parts</td>
                <td className="mono">
                  {batch.completedBatchParts ?? <span className="mute">—</span>}
                </td>
              </tr>
              <tr>
                <td className="mute">Tenant</td>
                <td className="mono">{batch.tenantId || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Search key</td>
                <td className="mono">{batch.searchKey || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Search key 2</td>
                <td className="mono">{batch.searchKey2 || <span className="mute">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <BatchPartsPanel batchId={batch.id} />
      {batch.batchDocumentJson && (
        <details data-testid="batch-document-json-collapsible" style={{ marginTop: 18 }}>
          <summary style={{ cursor: "pointer", padding: 8 }}>Batch document JSON (raw)</summary>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 12,
              fontSize: 11,
              background: "var(--bg-elev)",
              maxHeight: 320,
              overflow: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {batch.batchDocumentJson}
          </pre>
        </details>
      )}
    </div>
  );
}
