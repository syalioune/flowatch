// SPDX-License-Identifier: Apache-2.0

/**
 * Create-group modal (Story 22.3) — 23rd modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<CreateUserModal>` (Story 22.1)
 * shape scaled to 3 fields (id + name + type). Anchors the POST-create
 * wrapper family at N=2.
 *
 * `type` is a free string at the wire level (no enum); common values are
 * `security` and `assignment` per Flowable convention. The modal renders a
 * helper line below the type input naming the convention.
 *
 * ARIA convention (Epic 18.2): role="dialog" + aria-modal + aria-labelledby
 * on day one.
 */

import React from "react";
import { api } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const idRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setId("");
    setName("");
    setType("");
    setError(null);
    setBusy(false);
    setTimeout(() => idRef.current?.focus(), 0);
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

  const trimmedId = id.trim();
  const canSubmit = !busy && trimmedId !== "";

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    const body: Parameters<typeof api.createGroup>[0] = { id: trimmedId };
    if (name !== "") body.name = name;
    if (type !== "") body.type = type;
    try {
      await api.createGroup(body);
      setBusy(false);
      onSuccess();
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
      data-testid="create-group-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="create-group-title">Create group</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-disabled={busy}
            aria-label="Close create group modal"
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
                  htmlFor="create-group-id"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  ID
                </label>
                <input
                  ref={idRef}
                  id="create-group-id"
                  data-testid="create-group-id"
                  type="text"
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  placeholder="e.g. accountants"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="create-group-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Name
                </label>
                <input
                  id="create-group-name"
                  data-testid="create-group-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="create-group-type"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Type
                </label>
                <input
                  id="create-group-type"
                  data-testid="create-group-type"
                  type="text"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <p className="mute" style={{ margin: "4px 0 0", fontSize: 11 }}>
                  Common values: <span className="mono">security</span>,{" "}
                  <span className="mono">assignment</span> — free string at the wire level.
                </p>
              </div>
            </div>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="create-group-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="create-group-submit"
              disabled={!canSubmit}
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
