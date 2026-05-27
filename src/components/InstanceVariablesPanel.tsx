// SPDX-License-Identifier: Apache-2.0

/**
 * Instance Variables panel (Story 10.4).
 *
 * Replaces the inline two-column-grid panel that lived in the legacy
 * ProcessInstanceDetail component (since Story 13.1 the runtime panel is
 * `InstanceRuntimePanel`). Renders the canonical panel-tier four-state
 * contract (loading skeleton → ErrorBox → EmptyState → table) — same
 * shape Story 9.6 used for the Resources panel.
 *
 * Per Story 19.1 forward-reference: the per-row `Edit` button is a
 * disabled placeholder with `data-testid="variable-edit-placeholder"`
 * which 19.1 (milestone 0.0.3) swaps for a real edit modal.
 *
 * Render-side truncation: variable values are bounded to 4 KB at render
 * time so a 100 KB JSON blob in `value` doesn't lock the main thread.
 * Capture-side truncation (`captureBody` for request bodies) is separate
 * — see src/api.ts.
 */

import { api, type FlowableVariable } from "../api";
import { Icon } from "../components";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

export const VALUE_RENDER_BUDGET = 4096;

// Exported for unit testing. JSON.stringify can throw (BigInt, circular ref,
// throwing toJSON); the fallback returns "(non-serializable)" so the cell
// never crashes the panel.
export const prettyJson = (value: unknown): string => {
  let stringified: string | undefined;
  try {
    stringified = JSON.stringify(value, null, 2);
  } catch {
    return "(non-serializable)";
  }
  if (stringified === undefined) return "(non-serializable)";
  if (stringified.length <= VALUE_RENDER_BUDGET) return stringified;
  const more = stringified.length - VALUE_RENDER_BUDGET;
  return `${stringified.slice(0, VALUE_RENDER_BUDGET)}… (truncated; ${more} more chars)`;
};

// Exported for unit testing.
export const typeTone = (type?: string): "ok" | "warn" | "mute" => {
  if (type === "json" || type === "string") return "ok";
  if (
    type === "boolean" ||
    type === "integer" ||
    type === "long" ||
    type === "double" ||
    type === "short"
  ) {
    return "mute";
  }
  return "warn";
};

const truncatePrimitive = (raw: string): string => {
  if (raw.length <= VALUE_RENDER_BUDGET) return raw;
  const more = raw.length - VALUE_RENDER_BUDGET;
  return `${raw.slice(0, VALUE_RENDER_BUDGET)}… (truncated; ${more} more chars)`;
};

const renderValue = (v: FlowableVariable): JSX.Element => {
  if (v.value === null) return <span className="mute">null</span>;
  if (v.value === undefined) return <span className="mute">undefined</span>;
  if (v.type === "json") {
    return (
      <pre
        className="mono"
        style={{ margin: 0, fontSize: 11.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
        title="Full value omitted; copy via the Inspector"
      >
        {prettyJson(v.value)}
      </pre>
    );
  }
  if (v.type === "string") {
    return (
      <span className="mono" style={{ fontSize: 11.5 }}>
        "{truncatePrimitive(String(v.value))}"
      </span>
    );
  }
  return (
    <span className="mono" style={{ fontSize: 11.5 }}>
      {truncatePrimitive(String(v.value))}
    </span>
  );
};

interface Props {
  instance: { id: string };
}

export function InstanceVariablesPanel({ instance }: Props) {
  const variables = useApi(() => api.getProcessInstanceVariables(instance.id), [instance.id]);
  const list = variables.data ?? [];

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Variables</span>
        {variables.data && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            <span className="sr-only">Count: </span>
            {variables.data.length}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /runtime/process-instances/{instance.id}/variables
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="variables-refresh"
          onClick={variables.reload}
          disabled={variables.loading}
          aria-label="Refresh variables"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {variables.loading && <TableSkeleton columns={5} rows={3} />}
        {variables.error && <ErrorBox error={variables.error} onRetry={variables.reload} />}
        {!variables.loading && !variables.error && list.length === 0 && (
          <EmptyState entry={getEmptyState("instanceVariables")} />
        )}
        {!variables.loading && !variables.error && list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Scope</th>
                <th scope="col">Value</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.name} data-variable-name={v.name}>
                  <td>
                    <span className="mono">{v.name}</span>
                  </td>
                  <td>
                    <span className="badge" data-tone={typeTone(v.type)}>
                      <span className="sr-only">Variable type: </span>
                      {v.type ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span className="badge" data-tone="mute">
                      <span className="sr-only">Scope: </span>
                      {v.scope ?? "global"}
                    </span>
                  </td>
                  <td>{renderValue(v)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn"
                      data-size="sm"
                      data-testid="variable-edit-placeholder"
                      title="Available in 0.0.3 (Story 19.1)"
                      disabled
                    >
                      Edit
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
