// SPDX-License-Identifier: Apache-2.0

/**
 * `<DecisionVariableTable>` — shared read-only variable renderer.
 *
 * Used by both Story 15.4 (`<DmnExecutionsList>` row-expand input + output
 * panels) and Story 15.3 (`<ExecuteDecisionModal>` could be refactored to
 * use it — opportunistic fold per Epic 13 retro §3.2 scope-expansion-
 * within-original-intent discipline; not done in this commit because the
 * modal's output renderer also handles a header pluralisation that the
 * generic helper intentionally doesn't).
 *
 * Renders a 3-column Name / Type / Value table or an "(none)" empty state.
 * Safe against `JSON.stringify` throws per RC-7.
 */

import type React from "react";

export interface DecisionVariableTableProps {
  title: string;
  variables?: Record<string, unknown> | null | undefined;
  testIdPrefix?: string;
}

const typeofValue = (v: unknown): string => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
};

const renderValue = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch (e) {
      return `[unserializable: ${(e as Error).message}]`;
    }
  }
  if (typeof v === "string") return `"${v}"`;
  return String(v);
};

export const DecisionVariableTable: React.FC<DecisionVariableTableProps> = ({
  title,
  variables,
  testIdPrefix,
}) => {
  const entries = Object.entries(variables ?? {});
  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-hd">
        <span className="panel-title">
          {title} · {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="empty" style={{ padding: 20 }}>
          (none)
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, value]) => (
              <tr key={name} data-testid={testIdPrefix ? `${testIdPrefix}-${name}` : undefined}>
                <td className="mono">{name}</td>
                <td>
                  <span className="badge" data-tone="neutral">
                    {typeofValue(value)}
                  </span>
                </td>
                <td className="mono">{renderValue(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
