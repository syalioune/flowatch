// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /instances/$id.
 *
 * The primary resource is fetched by the route loader; this component
 * receives it via props. Variables are fetched here via useApi.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → "No variables." when the variables list is empty
 *   - data     → property table + variables list + Cancel button
 */

import { Link, useNavigate } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableProcessInstance } from "../api";
import { fmtTime, Icon, PageHead } from "../components";
import { CancelInstanceModal } from "../lib/cancel-instance-modal";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

interface Props {
  instance: FlowableProcessInstance;
}

type InstanceWide = FlowableProcessInstance & {
  processDefinitionName?: string;
  activityId?: string;
  startUserId?: string;
};

export function ProcessInstanceDetail({ instance }: Props) {
  const navigate = useNavigate();
  const variables = useApi(() => api.getProcessInstanceVariables(instance.id), [instance.id]);
  const p = instance as InstanceWide;
  // Story 10.3: Cancel modal target + focus-restore ref for the
  // "Cancel instance" button.
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const cancelTriggerRef = React.useRef<HTMLButtonElement>(null);
  // Navigate-on-both per the 10.3 T-3.5 pragmatic decision: success and
  // failure both navigate back to /instances; the failure toast tells the
  // operator what happened. The engine is the source of truth.
  const handleCancelSettled = () => navigate({ to: "/instances" });

  return (
    <div className="page">
      <PageHead
        title={p.businessKey || p.id}
        subtitle={fmtTime(p.startTime)}
        actions={
          <>
            <Link to="/instances" className="btn" data-variant="ghost">
              <Icon name="chevron" size={12} />
              Back
            </Link>
            {!p.ended && (
              <button
                ref={cancelTriggerRef}
                type="button"
                className="btn"
                data-tone="bad"
                data-testid="cancel-instance"
                onClick={() => setCancelOpen(true)}
              >
                Cancel instance
              </button>
            )}
          </>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Properties</span>
          <span
            className="badge"
            data-tone={p.ended ? "warn" : p.suspended ? "warn" : "ok"}
            style={{ marginLeft: "auto" }}
          >
            <span className="dot" />
            {p.suspended ? "suspended" : p.ended ? "ended" : "active"}
          </span>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  Business key
                </td>
                <td className="mono">{p.businessKey || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Instance ID</td>
                <td className="mono">{p.id}</td>
              </tr>
              <tr>
                <td className="mute">Definition</td>
                <td>
                  <Link
                    to="/definitions/$id"
                    params={{ id: p.processDefinitionId }}
                    className="mono"
                  >
                    {(p.processDefinitionName as string | undefined) || p.processDefinitionKey}
                  </Link>
                </td>
              </tr>
              <tr>
                <td className="mute">Activity</td>
                <td className="mono">{p.activityId || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Started</td>
                <td className="mono">{fmtTime(p.startTime)}</td>
              </tr>
              <tr>
                <td className="mute">Started by</td>
                <td className="mono">{p.startUserId || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Tenant</td>
                <td className="mono">{p.tenantId || <span className="mute">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Variables</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /runtime/process-instances/{p.id}/variables
          </span>
        </div>
        <div className="panel-body">
          {variables.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {variables.error && <ErrorBox error={variables.error} onRetry={variables.reload} />}
          {variables.data && variables.data.length === 0 && (
            <div className="empty">No variables.</div>
          )}
          {variables.data && variables.data.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {variables.data.map((v) => (
                <div
                  key={v.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                  }}
                >
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-soft)" }}>
                    {v.name}
                  </span>
                  <span className="mono" style={{ fontSize: 11.5 }}>
                    {typeof v.value === "string" ? `"${v.value}"` : String(v.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <CancelInstanceModal
        instance={cancelOpen ? instance : null}
        onClose={() => setCancelOpen(false)}
        onSettled={handleCancelSettled}
        triggerRef={cancelTriggerRef}
      />
    </div>
  );
}
