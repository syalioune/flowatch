// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /definitions/$id.
 *
 * Primary resource (FlowableProcessDefinition) is fetched by the route loader.
 * BPMN XML preview is fetched lazily here via useApi.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → "No XML available." when the resource fetch returns empty
 *   - data     → property table + status badge + XML preview
 */

import { Link } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableProcessDefinition } from "../api";
import { Icon, PageHead } from "../components";
import { EditCategoryModal } from "../lib/edit-category-modal";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

interface Props {
  definition: FlowableProcessDefinition;
  reload: () => void;
}

type DefinitionWide = FlowableProcessDefinition & {
  description?: string | null;
};

export function ProcessDefinitionDetail({ definition, reload }: Props) {
  const xml = useApi(() => api.getProcessDefinitionResource(definition.id), [definition.id]);
  const d = definition as DefinitionWide;
  // Story 20.1: inline Edit-category affordance + modal. Null target = closed.
  const [editing, setEditing] = React.useState<FlowableProcessDefinition | null>(null);
  const editTriggerRef = React.useRef<HTMLButtonElement | null>(null);

  const toggle = async () => {
    await api.suspendProcessDefinition(d.id, !d.suspended);
    reload();
  };

  return (
    <div className="page">
      <PageHead
        title={d.name || d.key}
        subtitle={`v${d.version}${d.tenantId ? ` · tenant: ${d.tenantId}` : ""}`}
        actions={
          <>
            <Link to="/definitions" className="btn" data-variant="ghost">
              <Icon name="chevron" size={12} />
              Back
            </Link>
            <Link to="/bpmn" search={{ definitionId: d.id }} className="btn">
              <Icon name="bpmn" size={12} />
              Open in modeler
            </Link>
            <button type="button" className="btn" data-variant="ghost" onClick={toggle}>
              {d.suspended ? "Activate" : "Suspend"}
            </button>
          </>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Properties</span>
          <span
            className="badge"
            data-tone={d.suspended ? "warn" : "ok"}
            style={{ marginLeft: "auto" }}
          >
            <span className="dot" />
            <span className="sr-only">Status: </span>
            {d.suspended ? "suspended" : "active"}
          </span>
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
                <td className="mute">Key</td>
                <td className="mono">{d.key}</td>
              </tr>
              <tr>
                <td className="mute">Version</td>
                <td className="mono">v{d.version}</td>
              </tr>
              <tr>
                <td className="mute">ID</td>
                <td className="mono">{d.id}</td>
              </tr>
              <tr>
                <td className="mute">Deployment</td>
                <td>
                  <Link to="/deployments/$id" params={{ id: d.deploymentId }} className="mono">
                    {d.deploymentId}
                  </Link>
                </td>
              </tr>
              <tr>
                <td className="mute">Category</td>
                <td>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span>{d.category || <span className="mute">—</span>}</span>
                    <button
                      ref={editTriggerRef}
                      type="button"
                      className="btn small"
                      data-variant="ghost"
                      data-testid="edit-category-button"
                      onClick={() => setEditing(d)}
                      disabled={d.suspended}
                      aria-disabled={d.suspended}
                      title={
                        d.suspended ? "Reactivate the definition to edit its category" : undefined
                      }
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
              <tr>
                <td className="mute">Tenant</td>
                <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
              </tr>
              {d.description !== undefined && (
                <tr>
                  <td className="mute">Description</td>
                  <td>{d.description || <span className="mute">—</span>}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">BPMN XML</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /repository/process-definitions/{d.id}/resourcedata
          </span>
        </div>
        <div className="panel-body">
          {xml.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {xml.error && <ErrorBox error={xml.error} onRetry={xml.reload} />}
          {xml.data !== null && xml.data === "" && <div className="empty">No XML available.</div>}
          {xml.data && (
            // biome-ignore lint/a11y/useSemanticElements: a <pre> is the correct monospace container for XML; role="region" only adds the scrollable-region semantics axe wants — a <section> would lose the <pre> formatting (Story 32.2 D1).
            <pre
              className="code"
              role="region"
              aria-label="BPMN XML source"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: WCAG SC 2.1.1 / axe scrollable-region-focusable — the XML source scrolls and MUST be keyboard-reachable (Story 32.2 D1).
              tabIndex={0}
              style={{ maxHeight: 480, overflow: "auto", whiteSpace: "pre", fontSize: 11 }}
            >
              {xml.data}
            </pre>
          )}
        </div>
      </div>

      <EditCategoryModal
        definition={editing}
        onClose={() => setEditing(null)}
        onSuccess={reload}
        triggerRef={editTriggerRef}
      />
    </div>
  );
}
