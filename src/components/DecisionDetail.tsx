// SPDX-License-Identifier: Apache-2.0

/**
 * `<DecisionDetail>` — per-decision detail surface that mounts at
 * `/decisions/$key`. Renders a property table + a "Test execute" button
 * that opens `<ExecuteDecisionModal>` (Story 15.3 — the placeholder
 * shipped by Story 15.1 was swapped for the real modal trigger here).
 */

import React from "react";
import { api, type FlowableDecision } from "../api";
import { Icon, PageHead } from "../components";
import { parseDmnDecision } from "../lib/dmn-parser";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { ExecuteDecisionModal } from "../lib/execute-decision-modal";
import { useApi } from "../lib/useApi";

export interface DecisionDetailProps {
  decision: FlowableDecision;
}

interface PropertyRow {
  field: string;
  label: string;
  value: React.ReactNode;
}

export const DecisionDetail: React.FC<DecisionDetailProps> = ({ decision }) => {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [executeOpen, setExecuteOpen] = React.useState(false);

  // Mirror the BPMN definition detail's XML preview via a single direct
  // fetch. Flowable's DMN sub-app exposes the XML keyed by decision-table id
  // (which matches FlowableDecision.id) — no deployment-resources discovery
  // hop needed.
  const xml = useApi<string>(() => api.getDmnDecisionResource(decision.id), [decision.id]);

  // Parse the XML once it's available — surfaces the decision-table inputs
  // and information requirements alongside the raw XML preview. Re-computed
  // only when the XML data changes (memoized by content identity since the
  // useApi result is a stable string between reloads).
  const parsed = React.useMemo(() => {
    if (!xml.data) return null;
    return parseDmnDecision(xml.data, decision.key);
  }, [xml.data, decision.key]);

  const rows: PropertyRow[] = [
    { field: "key", label: "Key", value: <span className="mono">{decision.key}</span> },
    { field: "name", label: "Name", value: decision.name || <span className="mute">—</span> },
    {
      field: "version",
      label: "Version",
      value: <span className="mono">{decision.version}</span>,
    },
    {
      field: "deploymentId",
      label: "Deployment ID",
      value: <span className="mono mute">{decision.deploymentId}</span>,
    },
    {
      field: "category",
      label: "Category",
      value: decision.category || <span className="mute">—</span>,
    },
    {
      field: "tenant",
      label: "Tenant",
      value: decision.tenantId ? (
        <span className="mono">{decision.tenantId}</span>
      ) : (
        <span className="mute">—</span>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHead
        title={decision.name || decision.key}
        subtitle={`DMN decision · key ${decision.key} · v${decision.version}`}
        actions={
          <button
            ref={triggerRef}
            type="button"
            className="btn"
            data-testid="test-execute-from-detail"
            onClick={() => setExecuteOpen(true)}
          >
            <Icon name="play" size={12} />
            Test execute
          </button>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Properties</span>
        </div>
        <table className="tbl">
          <tbody>
            {rows.map((r) => (
              <tr key={r.field} data-testid={`decision-prop-${r.field}`}>
                <td className="mute" style={{ width: 180 }}>
                  {r.label}
                </td>
                <td>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {parsed?.ok && (
        <div className="panel" style={{ marginTop: 18 }} data-testid="decision-inputs-panel">
          <div className="panel-hd">
            <span className="panel-title">
              Inputs · {parsed.inputs.length}
              {parsed.hitPolicy && (
                <span className="mute mono" style={{ marginLeft: 10, fontSize: 11 }}>
                  hit-policy: {parsed.hitPolicy}
                </span>
              )}
            </span>
          </div>
          {parsed.inputs.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>
              No inputs declared on this decision table.
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Label</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {parsed.inputs.map((input) => (
                  <tr
                    key={`${input.name}-${input.expression}`}
                    data-testid={`decision-input-${input.name}`}
                  >
                    <td className="mono">
                      {input.name}
                      {input.isComplex && (
                        <span
                          className="mute"
                          style={{ marginLeft: 8, fontSize: 11 }}
                          title="JUEL expression — not a simple variable reference"
                        >
                          (expression)
                        </span>
                      )}
                    </td>
                    <td>{input.label || <span className="mute">—</span>}</td>
                    <td>
                      <span className="badge" data-tone="neutral">
                        {input.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {parsed?.ok && parsed.requirements.length > 0 && (
        <div className="panel" style={{ marginTop: 18 }} data-testid="decision-requirements-panel">
          <div className="panel-hd">
            <span className="panel-title">
              Information requirements · {parsed.requirements.length}
            </span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Reference</th>
                <th>Label</th>
              </tr>
            </thead>
            <tbody>
              {parsed.requirements.map((req) => (
                <tr key={`${req.kind}-${req.ref}`} data-testid={`decision-requirement-${req.ref}`}>
                  <td>
                    <span className="badge" data-tone="neutral">
                      {req.kind}
                    </span>
                  </td>
                  <td className="mono">{req.ref}</td>
                  <td>{req.label || <span className="mute">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }} data-testid="decision-xml-panel">
        <div className="panel-hd">
          <span className="panel-title">DMN XML</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /dmn-repository/decision-tables/{decision.id}/resourcedata
          </span>
        </div>
        <div className="panel-body">
          {xml.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {xml.error && <ErrorBox error={xml.error} onRetry={xml.reload} />}
          {xml.data !== null && xml.data === "" && (
            <EmptyState entry={getEmptyState("decisionResource")} />
          )}
          {xml.data && (
            <pre
              className="code"
              data-testid="decision-xml-pre"
              style={{ maxHeight: 480, overflow: "auto", whiteSpace: "pre", fontSize: 11 }}
            >
              {xml.data}
            </pre>
          )}
        </div>
      </div>

      <ExecuteDecisionModal
        decision={executeOpen ? decision : null}
        onClose={() => setExecuteOpen(false)}
        triggerRef={triggerRef}
      />
    </div>
  );
};
