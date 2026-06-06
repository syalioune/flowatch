// SPDX-License-Identifier: Apache-2.0

/**
 * Story 25.1: App-definition panel on /deployments/$id. Mounts ABOVE the
 * existing resources / decisions panel. Returns null when the deployment
 * carries no app definitions — non-app deployments stay visually unchanged.
 *
 * Per CLAUDE.md "Panel-as-sibling-component" (Epic 12 retro R-2): owns its
 * own useApi, four-state contract, refresh affordance, row-count badge.
 * Never extracted.
 */

import { api, type FlowableAppDefinition } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

interface Props {
  deploymentId: string;
}

export function DeploymentAppDefinitionsPanel({ deploymentId }: Props) {
  const apps = useApi(() => api.listAppDefinitions({ deploymentId, size: 50 }), [deploymentId]);

  // Empty-state short-circuit — keeps non-app deployments visually unchanged.
  if (!apps.loading && !apps.error && apps.data && apps.data.data.length === 0) {
    return null;
  }

  const rows: FlowableAppDefinition[] = apps.data?.data ?? [];
  const title = rows.length > 1 ? "App definitions" : "App definition";

  return (
    <div className="panel" data-testid="deployment-app-definitions-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">{title}</span>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /app-repository/app-definitions?deploymentId={deploymentId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="app-definitions-refresh"
          aria-label="Refresh app definitions"
          onClick={apps.reload}
          disabled={apps.loading}
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {apps.loading && <TableSkeleton columns={4} rows={1} />}
        {apps.error && <ErrorBox error={apps.error} onRetry={apps.reload} />}
        {!apps.loading && !apps.error && rows.length > 0 && (
          <table className="tbl" data-testid="app-definitions-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Key</th>
                <th scope="col">Version</th>
                <th scope="col">Tenant</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} data-testid={`app-definition-row-${a.id}`}>
                  <td>
                    <b style={{ fontWeight: 500 }}>{a.name || "—"}</b>
                  </td>
                  <td className="mono">{a.key || "—"}</td>
                  <td className="mono">{a.version !== undefined ? `v${a.version}` : "—"}</td>
                  <td className="mono mute">{a.tenantId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
