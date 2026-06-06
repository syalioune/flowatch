// SPDX-License-Identifier: Apache-2.0

/**
 * Instance Variables panel (Story 10.4 + Story 19.1 + Story 19.2).
 *
 * Replaces the inline two-column-grid panel that lived in the legacy
 * ProcessInstanceDetail component (since Story 13.1 the runtime panel is
 * `InstanceRuntimePanel`). Renders the canonical panel-tier four-state
 * contract (loading skeleton → ErrorBox → EmptyState → table) — same
 * shape Story 9.6 used for the Resources panel.
 *
 * Story 19.1: per-row Edit button opens `<EditVariableModal>` and reloads
 * the panel on success. Closed the Story 10.4 placeholder-then-real swap
 * (CLAUDE.md "Cross-story sequencing" + Epic 10 retro §3.5).
 *
 * Story 19.2: the plain per-row Edit button is refactored to a
 * `<RowActionMenu>` with Edit + Delete items; a panel-level "Add variable"
 * button mounts an `<AddVariableModal>` that reuses
 * `api.updateInstanceVariables` (PUT upsert semantics — same wrapper
 * handles add + edit). Closes the Epic 19 FR-19 symmetric pair.
 *
 * Render-side truncation: variable values are bounded to 4 KB at render
 * time so a 100 KB JSON blob in `value` doesn't lock the main thread.
 * Capture-side truncation (`captureBody` for request bodies) is separate
 * — see src/api.ts.
 */

import { useRef, useState } from "react";
import { api, type FlowableVariable } from "../api";
import { Icon } from "../components";
import { AddVariableModal } from "../lib/add-variable-modal";
import { DeleteVariableModal } from "../lib/delete-variable-modal";
import { EditVariableModal } from "../lib/edit-variable-modal";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { RowActionMenu } from "../lib/row-action-menu";
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
  const [editing, setEditing] = useState<FlowableVariable | null>(null);
  const [deleting, setDeleting] = useState<FlowableVariable | null>(null);
  const [adding, setAdding] = useState(false);
  // Single shared row-trigger ref reassigned per RowActionMenu interaction —
  // only one modal is open at a time (CLAUDE.md "Modal focus-restore via
  // triggerRef"). The Add button has its own dedicated ref since it lives
  // in the panel header (not a row that can be removed).
  const rowTriggerRef = useRef<HTMLElement | null>(null);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);

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
          ref={addBtnRef}
          type="button"
          className="btn"
          data-size="sm"
          data-testid="add-variable"
          onClick={() => setAdding(true)}
          style={{ marginLeft: 8 }}
        >
          Add variable
        </button>
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
                  <td
                    onClick={(e) => {
                      // Capture the row's RowActionMenu trigger so the modal
                      // can focus-restore to it on close. The RowActionMenu's
                      // trigger button is the click target inside this cell.
                      const target = e.target as HTMLElement;
                      const trigger = target.closest<HTMLButtonElement>(
                        '[data-testid="row-action-trigger"]',
                      );
                      if (trigger) rowTriggerRef.current = trigger;
                    }}
                    onKeyDown={(e) => {
                      const target = e.target as HTMLElement;
                      const trigger = target.closest<HTMLButtonElement>(
                        '[data-testid="row-action-trigger"]',
                      );
                      if (trigger) rowTriggerRef.current = trigger;
                    }}
                  >
                    <RowActionMenu
                      ariaLabel={`Open actions for ${v.name}`}
                      items={[
                        {
                          label: "Edit",
                          onSelect: () => setEditing(v),
                          testId: `variable-edit-${v.name}`,
                        },
                        {
                          label: "Delete",
                          onSelect: () => setDeleting(v),
                          danger: true,
                          testId: `variable-delete-${v.name}`,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <EditVariableModal
        variable={editing}
        instanceId={instance.id}
        onClose={() => setEditing(null)}
        onSuccess={() => variables.reload()}
        triggerRef={rowTriggerRef}
      />
      <AddVariableModal
        open={adding}
        instanceId={instance.id}
        existingNames={list.map((v) => v.name)}
        onClose={() => setAdding(false)}
        onSuccess={() => variables.reload()}
        triggerRef={addBtnRef}
      />
      <DeleteVariableModal
        variable={deleting}
        instanceId={instance.id}
        onClose={() => setDeleting(null)}
        onDeleted={() => variables.reload()}
        triggerRef={rowTriggerRef}
        // After a successful delete, the row that owned rowTriggerRef is
        // removed from the DOM. The modal falls back to the Add button so
        // focus stays in the panel rather than dropping to <body>.
        fallbackRef={addBtnRef}
      />
    </div>
  );
}
