// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /deployments/$id.
 *
 * The primary resource (FlowableDeployment) is fetched by the route loader
 * (Story 3.3 / src/routes/deployments/$id.tsx); this component receives it
 * via props. Resources for the deployment are fetched here via useApi.
 *
 * Pattern P-002 four states:
 *   - loading  → handled by the route's pendingComponent
 *   - error    → handled by the route's errorComponent (ErrorBox)
 *   - empty    → resources list shows "No resources." when empty
 *   - data     → property table + resources list
 */

import { Link, useNavigate } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableDeployment, type FlowableResource } from "../api";
import { fmtTime, Icon, PageHead, toast } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

interface Props {
  deployment: FlowableDeployment;
}

type DeploymentWide = FlowableDeployment & {
  source?: string;
  parentDeploymentId?: string;
};

export function DeploymentDetail({ deployment }: Props) {
  const navigate = useNavigate();
  const resources = useApi(() => api.listDeploymentResources(deployment.id), [deployment.id]);
  const d = deployment as DeploymentWide;
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const remove = async () => {
    if (!confirm("Delete deployment? Cascading will remove instances too.")) return;
    await api.deleteDeployment(d.id, true);
    navigate({ to: "/deployments" });
  };

  const handleDownload = async (resource: FlowableResource) => {
    setDownloading(resource.id);
    let url: string | null = null;
    try {
      // Per flowable-rest 7.2: resource.id IS the filename (e.g.
      // "Helpdesk.bpmn20.xml"). The engine has no separate `name` field —
      // id is the human-readable filename AND the resourcedata path segment.
      const res = await api.getDeploymentResource(d.id, resource.id);
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resource.id;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast({
        kind: "err",
        text: "Download failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    } finally {
      if (url) URL.revokeObjectURL(url);
      setDownloading(null);
    }
  };

  return (
    <div className="page">
      <PageHead
        title={d.name || d.id}
        subtitle={fmtTime(d.deploymentTime)}
        actions={
          <>
            <Link to="/deployments" className="btn" data-variant="ghost">
              <Icon name="chevron" size={12} />
              Back
            </Link>
            <button type="button" className="btn" data-tone="bad" onClick={remove}>
              Delete
            </button>
          </>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Properties</span>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  Name
                </td>
                <td>{d.name || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">ID</td>
                <td className="mono">{d.id}</td>
              </tr>
              <tr>
                <td className="mute">Category</td>
                <td>{d.category || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Tenant</td>
                <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Deployed</td>
                <td className="mono">{fmtTime(d.deploymentTime)}</td>
              </tr>
              {d.source !== undefined && (
                <tr>
                  <td className="mute">Source</td>
                  <td className="mono">{d.source || <span className="mute">—</span>}</td>
                </tr>
              )}
              {d.parentDeploymentId !== undefined && (
                <tr>
                  <td className="mute">Parent deployment</td>
                  <td className="mono">
                    {d.parentDeploymentId || <span className="mute">—</span>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Resources</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /repository/deployments/{d.id}/resources
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {resources.loading && <TableSkeleton columns={3} rows={4} />}
          {resources.error && <ErrorBox error={resources.error} onRetry={resources.reload} />}
          {resources.data &&
            resources.data.length === 0 &&
            (() => {
              const entry = emptyStates.deploymentResources;
              return entry ? <EmptyState entry={entry} /> : null;
            })()}
          {resources.data && resources.data.length > 0 && (
            <table className="tbl" data-testid="deployment-resources-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {resources.data.map((r) => (
                  <tr key={r.id} data-resource-id={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>
                      <span className="badge" data-tone="neutral">
                        {r.mediaType}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        data-size="sm"
                        data-testid="download-resource"
                        onClick={() => handleDownload(r)}
                        disabled={downloading === r.id}
                      >
                        <Icon name="download" size={11} />
                        {downloading === r.id ? "Downloading…" : "Download"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
