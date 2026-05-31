// SPDX-License-Identifier: Apache-2.0

/**
 * Add-connection modal (Story 23.1) — 26th modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<CreateUserModal>` (Story 22.1)
 * 5-field shape. Persists a new {@link SavedConnection} via the
 * `addConnection` wrapper from `src/lib/saved-connections.ts`; the wrapper
 * dispatches `SAVED_CONNECTIONS_CHANGED` so listeners (Settings Manage panel,
 * Topbar picker) re-read without prop drilling.
 *
 * Failure path renders an in-modal {@link ErrorBox} — label collision OR
 * URL parse failure OR localStorage quota error. Form values preserved on
 * retry per the Story 10.2 retryable-creation convention.
 *
 * ARIA convention (Epic 18.2): role="dialog" + aria-modal + aria-labelledby
 * on day one. The `[data-testid="open-inspector"]` button on the ErrorBox
 * fires harmlessly here (no API_LOG entry for localStorage throws) — kept
 * for shape parity rather than per-source-of-error specialization.
 */

import React from "react";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";
import { addConnection, type SavedConnection } from "./saved-connections";

export interface AddConnectionModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful add. */
  onSuccess: (created: SavedConnection) => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [label, setLabel] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const labelRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLabel("");
    setBaseUrl("");
    setUsername("");
    setPassword("");
    setTenantId("");
    setError(null);
    setBusy(false);
    setTimeout(() => labelRef.current?.focus(), 0);
  }, [open]);

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

  if (!open) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const canSubmit = !busy && label.trim() !== "" && baseUrl.trim() !== "";

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    try {
      // Validate URL before touching storage so the operator sees the same
      // error as a future engine connection attempt would surface.
      new URL(baseUrl.trim());
    } catch {
      setError(new Error("Invalid URL"));
      return;
    }
    setBusy(true);
    try {
      const created = addConnection({
        label: label.trim(),
        baseUrl: baseUrl.trim(),
        username,
        password,
        tenantId,
      });
      setBusy(false);
      onSuccess(created);
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
      data-testid="add-connection-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-connection-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
      >
        <div className="modal-hd">
          <h3 id="add-connection-title">Add connection</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close add connection modal"
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
                  htmlFor="add-connection-label"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Label
                </label>
                <input
                  ref={labelRef}
                  id="add-connection-label"
                  data-testid="add-connection-label"
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  placeholder="e.g. staging"
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-connection-base-url"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Base URL
                </label>
                <input
                  id="add-connection-base-url"
                  data-testid="add-connection-base-url"
                  type="text"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={busy}
                  placeholder="http://localhost:8080/flowable-rest/service"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-connection-username"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Username
                </label>
                <input
                  id="add-connection-username"
                  data-testid="add-connection-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-connection-password"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Password
                </label>
                <input
                  id="add-connection-password"
                  data-testid="add-connection-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-connection-tenant-id"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Tenant ID <span className="mute">(optional)</span>
                </label>
                <input
                  id="add-connection-tenant-id"
                  data-testid="add-connection-tenant-id"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  placeholder="leave blank for default"
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
            </div>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="add-connection-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="add-connection-submit"
              disabled={!canSubmit}
            >
              {busy ? "Adding…" : "Add connection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
