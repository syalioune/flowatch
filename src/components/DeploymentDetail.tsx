// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /deployments/$id.
 *
 * The primary deployment row is fetched by the route loader; this
 * component receives it via props plus the `kind` discriminator the route
 * threads through `?kind=bpmn|dmn`.
 *
 * BPMN and DMN deployments expose DIFFERENT contents:
 *   - BPMN: a flat list of resources (`/repository/deployments/{id}/resources`)
 *     where each entry is a file (the .bpmn XML, embedded form JSONs, etc.).
 *   - DMN: a list of decisions (`/dmn-repository/decision-tables?deploymentId={id}`).
 *     The DMN sub-app does NOT expose a `/resources` endpoint — it returned
 *     500 "No endpoint" on probing — so the panel is fed by the decisions
 *     query instead. Multiple decisions can share the same .dmn file.
 *
 * Pattern P-002 four states apply per panel (loading / error / empty / data).
 */

import { Link, useNavigate } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableDecision, type FlowableDeployment, type FlowableResource } from "../api";
import { fmtTime, Icon, PageHead, toast } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";
import { DeploymentAppDefinitionsPanel } from "./DeploymentAppDefinitionsPanel";
import { DeploymentBundledProcessesPanel } from "./DeploymentBundledProcessesPanel";

interface Props {
  deployment: FlowableDeployment;
  // Defaults to "bpmn" so callers that don't yet thread the kind through
  // (and pre-merge deep links / older tests) keep their existing behaviour.
  // "bar" lives in the BPMN sub-app — uses the same resources panel; the
  // discriminator only changes the subtitle copy + the bundled-artifacts
  // panel mounts (which already null-return on non-app deployments).
  kind?: "bpmn" | "dmn" | "bar";
}

type DeploymentWide = FlowableDeployment & {
  source?: string;
  parentDeploymentId?: string;
};

export function DeploymentDetail({ deployment, kind = "bpmn" }: Props) {
  const navigate = useNavigate();
  const isDmn = kind === "dmn";
  const isBar = kind === "bar";
  const d = deployment as DeploymentWide;
  const subtitleKind = isDmn ? "DMN deployment" : isBar ? "BAR deployment" : "BPMN deployment";

  const remove = async () => {
    if (!confirm("Delete deployment? Cascading will remove instances too.")) return;
    if (isDmn) await api.removeDmnDeployment(d.id, { cascade: true });
    else await api.deleteDeployment(d.id, true);
    navigate({ to: "/deployments" });
  };

  return (
    <div className="page">
      <PageHead
        title={d.name || d.id}
        subtitle={`${subtitleKind} · ${fmtTime(d.deploymentTime)}`}
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

      <DeploymentAppDefinitionsPanel deploymentId={d.id} />
      <DeploymentBundledProcessesPanel deploymentId={d.id} />
      {isDmn ? (
        <DmnDecisionsPanel deploymentId={d.id} />
      ) : (
        <BpmnResourcesPanel deploymentId={d.id} />
      )}
    </div>
  );
}

// ── BPMN resources panel ────────────────────────────────────────────────
function BpmnResourcesPanel({ deploymentId }: { deploymentId: string }) {
  const resources = useApi(() => api.listDeploymentResources(deploymentId), [deploymentId]);
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const handleDownload = async (resource: FlowableResource) => {
    setDownloading(resource.id);
    let url: string | null = null;
    try {
      const res = await api.getDeploymentResource(deploymentId, resource.id);
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
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Resources</span>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /repository/deployments/{deploymentId}/resources
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
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {resources.data.map((r) => (
                <tr key={r.id} data-resource-id={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>
                    <span className="badge" data-tone="neutral">
                      <span className="sr-only">Resource type: </span>
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
  );
}

// ── DMN decisions panel ─────────────────────────────────────────────────
// The DMN sub-app has no `/resources` endpoint (engine returns 500 "No
// endpoint" on probing). Instead, we list the decisions that BELONG TO this
// deployment via `/dmn-repository/decision-tables?deploymentId={id}` — the
// `/decisions` and `/decision-tables` endpoints are aliases. Each row links
// to /decisions/$key (where the XML, inputs, and execute flow already live)
// and exposes a per-decision XML download via getDmnDecisionResource.
function DmnDecisionsPanel({ deploymentId }: { deploymentId: string }) {
  const navigate = useNavigate();
  const list = useApi(() => api.listDecisions({ deploymentId, size: 200 }), [deploymentId]);
  const [downloading, setDownloading] = React.useState<string | null>(null);

  const handleDownload = async (decision: FlowableDecision) => {
    setDownloading(decision.id);
    let url: string | null = null;
    try {
      const xml = await api.getDmnDecisionResource(decision.id);
      const blob = new Blob([xml], { type: "application/xml" });
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const decisionWide = decision as FlowableDecision & { resourceName?: string };
      a.download = decisionWide.resourceName || `${decision.key}.dmn`;
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
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Decisions</span>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /dmn-repository/decision-tables?deploymentId={deploymentId}
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {list.loading && <TableSkeleton columns={5} rows={4} />}
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.data && list.data.data.length === 0 && (
          <div className="empty" style={{ padding: 20 }}>
            No decisions in this deployment.
          </div>
        )}
        {list.data && list.data.data.length > 0 && (
          <table className="tbl" data-testid="deployment-decisions-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Key</th>
                <th scope="col">Version</th>
                <th scope="col">File</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {list.data.data.map((dec) => {
                const decWide = dec as FlowableDecision & {
                  resourceName?: string;
                  decisionType?: string;
                };
                return (
                  <tr
                    key={dec.id}
                    data-decision-id={dec.id}
                    data-decision-key={dec.key}
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate({ to: "/decisions/$key", params: { key: dec.key } })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        navigate({ to: "/decisions/$key", params: { key: dec.key } });
                    }}
                  >
                    <td>
                      <b style={{ fontWeight: 500 }}>{dec.name || "—"}</b>
                    </td>
                    <td className="mono">{dec.key}</td>
                    <td className="mono">v{dec.version}</td>
                    <td className="mono mute">{decWide.resourceName || "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        data-size="sm"
                        data-testid="download-decision"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(dec);
                        }}
                        disabled={downloading === dec.id}
                      >
                        <Icon name="download" size={11} />
                        {downloading === dec.id ? "Downloading…" : "Download"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
