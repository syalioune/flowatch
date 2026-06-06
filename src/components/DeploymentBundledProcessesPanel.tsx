// SPDX-License-Identifier: Apache-2.0

/**
 * Story 25.1: Bundled-processes panel on /deployments/$id. Mounts below the
 * app-definition panel, above the resources panel. Returns null when the
 * deployment carries no BPMN processes — DMN-only or empty deployments stay
 * visually unchanged.
 *
 * Rows click through to /definitions/$id (the project's process-definition
 * detail route — the spec's "/definitions/$key" was wire-renamed to
 * `$id` per the actual route file `src/routes/definitions/$id.tsx`).
 */

import { useNavigate } from "@tanstack/react-router";
import { api, type FlowableProcessDefinition } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

interface Props {
  deploymentId: string;
}

export function DeploymentBundledProcessesPanel({ deploymentId }: Props) {
  const navigate = useNavigate();
  const list = useApi(
    () => api.listProcessDefinitions({ deploymentId, size: 200 }),
    [deploymentId],
  );

  if (!list.loading && !list.error && list.data && list.data.data.length === 0) {
    return null;
  }

  const rows: FlowableProcessDefinition[] = list.data?.data ?? [];

  const go = (id: string) => navigate({ to: "/definitions/$id", params: { id } });

  return (
    <div
      className="panel"
      data-testid="deployment-bundled-processes-panel"
      style={{ marginTop: 18 }}
    >
      <div className="panel-hd">
        <span className="panel-title">Bundled processes</span>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /repository/process-definitions?deploymentId={deploymentId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="bundled-processes-refresh"
          aria-label="Refresh bundled processes"
          onClick={list.reload}
          disabled={list.loading}
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {list.loading && <TableSkeleton columns={4} rows={3} />}
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {!list.loading && !list.error && rows.length > 0 && (
          <table className="tbl" data-testid="bundled-processes-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Key</th>
                <th scope="col">Version</th>
                <th scope="col">ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  data-testid={`bundled-process-row-${p.id}`}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => go(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") go(p.id);
                  }}
                >
                  <td>
                    <b style={{ fontWeight: 500 }}>{p.name || "—"}</b>
                  </td>
                  <td className="mono">{p.key}</td>
                  <td className="mono">v{p.version}</td>
                  <td className="mono mute">{p.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
