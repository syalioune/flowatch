// SPDX-License-Identifier: Apache-2.0

/**
 * Task Attachments panel (Story 21.2) — 6th sibling panel in the catalogue
 * (after InstanceVariablesPanel 10.4 / TaskFormPanel 11.3 / JobStacktracePanel
 * 12.4 / InstanceHistoricVariablesPanel + InstanceHistoricActivitiesPanel
 * 13.2). FIRST sibling panel mounted on `<TaskDetail>`; the existing
 * Variables flat-grid pre-dates Story 10.4 and is deliberately NOT refactored
 * here.
 *
 * Pattern P-002 four states: loading skeleton → ErrorBox → EmptyState → table.
 * Owns its own `useApi`, refresh affordance, row-count badge, and Add modal.
 * Single stable identifier prop (`taskId`) per CLAUDE.md
 * "Panel-as-sibling-component" R-2 — no callbacks, no state-threading.
 */

import { useRef, useState } from "react";
import { api, type FlowableAttachment } from "../api";
import { fmtTime, Icon } from "../components";
import { AddAttachmentModal } from "../lib/add-attachment-modal";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

interface Props {
  taskId: string;
}

const renderSource = (a: FlowableAttachment) => {
  if (a.externalUrl) {
    return (
      <a
        className="mono"
        href={a.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 11.5 }}
      >
        {a.externalUrl}
      </a>
    );
  }
  return <span className="mute">File</span>;
};

export function TaskAttachmentsPanel({ taskId }: Props) {
  const attachments = useApi(() => api.listTaskAttachments(taskId), [taskId]);
  const list = attachments.data ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="panel" data-testid="task-attachments-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Attachments</span>
        <span className="badge" data-tone="neutral" style={{ marginLeft: 8 }}>
          <span className="sr-only">Count: </span>
          {attachments.data?.length ?? 0}
        </span>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /runtime/tasks/{taskId}/attachments
        </span>
        <button
          ref={addBtnRef}
          type="button"
          className="btn"
          data-size="sm"
          data-testid="task-attachments-add"
          onClick={() => setAddOpen(true)}
          style={{ marginLeft: 8 }}
        >
          Add attachment…
        </button>
        <button
          type="button"
          className="icon-btn"
          data-testid="task-attachments-refresh"
          onClick={attachments.reload}
          disabled={attachments.loading}
          aria-label="Refresh attachments"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {attachments.loading && <TableSkeleton columns={4} rows={3} />}
        {attachments.error && <ErrorBox error={attachments.error} onRetry={attachments.reload} />}
        {!attachments.loading && !attachments.error && list.length === 0 && (
          <EmptyState entry={getEmptyState("attachments")} />
        )}
        {!attachments.loading && !attachments.error && list.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Source</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} data-attachment-id={a.id}>
                  <td>
                    <span className="mono">{a.name || <span className="mute">—</span>}</span>
                  </td>
                  <td>
                    <span className="badge" data-tone="mute">
                      <span className="sr-only">Type: </span>
                      {a.type ?? "—"}
                    </span>
                  </td>
                  <td>{renderSource(a)}</td>
                  <td className="mono">
                    {a.time ? fmtTime(a.time) : <span className="mute">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AddAttachmentModal
        taskId={taskId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => attachments.reload()}
        triggerRef={addBtnRef}
      />
    </div>
  );
}
