// SPDX-License-Identifier: Apache-2.0

/**
 * Edit-connection modal (Story 23.1) — 27th modal in the catalogue.
 *
 * Retryable-creation archetype with diff-empty no-op Save-disabled guard
 * (Story 21.1 codification, reapplied in `<EditUserModal>` 22.2 +
 * `<EditGroupModal>` 22.3). Pre-populates from the connection snapshot at
 * open; mode-switch arrives in Story 23.2 (segmented-control + per-kind
 * fields). Label collision check is identity-aware — the same-entry no-op
 * label is allowed; collision with a DIFFERENT entry rejects.
 *
 * Story 23.2 forward-alignment: this file gains a segmented-control +
 * per-kind config field group BELOW the legacy fields. The SavedConnection
 * `authStrategyConfig?` slot stays typed-but-unread here.
 */

import React from "react";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";
import { type SavedConnection, updateConnection } from "./saved-connections";

export interface EditConnectionModalProps {
  open: boolean;
  onClose: () => void;
  /** The connection being edited (immutable snapshot; modal reads at open). */
  connection: SavedConnection | null;
  onSuccess: (updated: SavedConnection) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type Inputs = {
  label: string;
  baseUrl: string;
  username: string;
  password: string;
  tenantId: string;
};

const inputsFrom = (c: SavedConnection): Inputs => ({
  label: c.label,
  baseUrl: c.baseUrl,
  username: c.username,
  password: c.password,
  tenantId: c.tenantId,
});

export const EditConnectionModal: React.FC<EditConnectionModalProps> = ({
  open,
  onClose,
  connection,
  onSuccess,
  triggerRef,
}) => {
  const [inputs, setInputs] = React.useState<Inputs>(() =>
    connection
      ? inputsFrom(connection)
      : { label: "", baseUrl: "", username: "", password: "", tenantId: "" },
  );
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const labelRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open || !connection) return;
    setInputs(inputsFrom(connection));
    setError(null);
    setBusy(false);
    setTimeout(() => labelRef.current?.focus(), 0);
  }, [open, connection]);

  React.useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, triggerRef]);

  if (!open || !connection) return null;

  const setField = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const diff: Partial<Omit<SavedConnection, "id">> = {};
  if (inputs.label !== connection.label) diff.label = inputs.label;
  if (inputs.baseUrl !== connection.baseUrl) diff.baseUrl = inputs.baseUrl;
  if (inputs.username !== connection.username) diff.username = inputs.username;
  if (inputs.password !== connection.password) diff.password = inputs.password;
  if (inputs.tenantId !== connection.tenantId) diff.tenantId = inputs.tenantId;

  const diffEmpty = Object.keys(diff).length === 0;
  const canSubmit =
    !busy && !diffEmpty && inputs.label.trim() !== "" && inputs.baseUrl.trim() !== "";

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    if (diff.baseUrl !== undefined) {
      try {
        new URL(diff.baseUrl.trim());
      } catch {
        setError(new Error("Invalid URL"));
        return;
      }
    }
    setBusy(true);
    try {
      const updated = updateConnection(connection.id, diff);
      setBusy(false);
      onSuccess(updated);
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="edit-connection-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-connection-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
      >
        <div className="modal-hd">
          <h3 id="edit-connection-title">Edit connection</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close edit connection modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) submit();
          }}
        >
          <div className="modal-bd">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox error={error} />
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="edit-connection-label"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Label
                </label>
                <input
                  ref={labelRef}
                  id="edit-connection-label"
                  data-testid="edit-connection-label"
                  type="text"
                  required
                  value={inputs.label}
                  onChange={(e) => setField("label", e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-connection-base-url"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Base URL
                </label>
                <input
                  id="edit-connection-base-url"
                  data-testid="edit-connection-base-url"
                  type="text"
                  required
                  value={inputs.baseUrl}
                  onChange={(e) => setField("baseUrl", e.target.value)}
                  disabled={busy}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-connection-username"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Username
                </label>
                <input
                  id="edit-connection-username"
                  data-testid="edit-connection-username"
                  type="text"
                  value={inputs.username}
                  onChange={(e) => setField("username", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-connection-password"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Password
                </label>
                <input
                  id="edit-connection-password"
                  data-testid="edit-connection-password"
                  type="password"
                  value={inputs.password}
                  onChange={(e) => setField("password", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-connection-tenant-id"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Tenant ID <span className="mute">(optional)</span>
                </label>
                <input
                  id="edit-connection-tenant-id"
                  data-testid="edit-connection-tenant-id"
                  type="text"
                  value={inputs.tenantId}
                  onChange={(e) => setField("tenantId", e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
            </div>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="edit-connection-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="edit-connection-submit"
              disabled={!canSubmit}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
