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
import { api, type FlowableDeployment } from "../api";
import { fmtTime, Icon, PageHead } from "../components";
import DATA from "../data";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

interface Props {
  deployment: FlowableDeployment;
  onOpenInspector?: () => void;
}

type DeploymentWide = FlowableDeployment & {
  source?: string;
  parentDeploymentId?: string;
};

export function DeploymentDetail({ deployment, onOpenInspector }: Props) {
  const navigate = useNavigate();
  const resources = useApi(() => api.listDeploymentResources(deployment.id), [deployment.id]);
  const d = deployment as DeploymentWide;

  const remove = async () => {
    if (!confirm("Delete deployment? Cascading will remove instances too.")) return;
    await api.deleteDeployment(d.id, true);
    navigate({ to: "/deployments" });
  };

  return (
    <div className="page">
      <PageHead
        title={d.name || d.id}
        subtitle={fmtTime(d.deploymentTime)}
        endpoints={DATA.endpoints.deployments}
        onOpenInspector={onOpenInspector ? () => onOpenInspector() : undefined}
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
          {resources.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {resources.error && <ErrorBox error={resources.error} onRetry={resources.reload} />}
          {resources.data && resources.data.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              No resources.
            </div>
          )}
          {resources.data?.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid var(--line)",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }} className="mono">
                {r.name}
              </div>
              <span className="badge" data-tone="neutral">
                {r.mediaType}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
