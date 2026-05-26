// SPDX-License-Identifier: Apache-2.0

/**
 * `<DecisionDetail>` (Story 15.1) — the per-decision detail surface that
 * mounts at `/decisions/$key`. Renders a property table + a placeholder
 * "Test execute" button. Story 15.3 swaps the placeholder for the real
 * `<ExecuteDecisionModal>` trigger; the `data-testid="test-execute-from-detail"`
 * attribute is the swap point.
 */

import type React from "react";
import type { FlowableDecision } from "../api";
import { Icon, PageHead, toast } from "../components";

export interface DecisionDetailProps {
  decision: FlowableDecision;
}

interface PropertyRow {
  field: string;
  label: string;
  value: React.ReactNode;
}

export const DecisionDetail: React.FC<DecisionDetailProps> = ({ decision }) => {
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
            type="button"
            className="btn"
            data-testid="test-execute-from-detail"
            onClick={() =>
              toast({
                kind: "info",
                text: "Test execute arrives in Story 15.3.",
                ttl: 3500,
              })
            }
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
    </div>
  );
};
