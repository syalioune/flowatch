// SPDX-License-Identifier: Apache-2.0

/**
 * Add-variable modal (Story 19.2).
 *
 * Retryable-creation archetype — mirrors `<EditVariableModal>` (Story 19.1)
 * minus the read-only name field. Reuses `api.updateInstanceVariables` —
 * Flowable's PUT `/runtime/process-instances/{id}/variables` is upsert
 * (existing names update; new names insert), so the Add path needs no new
 * wrapper. Verified live on flowable-rest 7.2.0 — see Story 19.2 DAR.
 *
 * Duplicate-name handling: when the operator types a name that already
 * exists, a client-side warning hint fires ("Name exists — submitting will
 * OVERWRITE the existing value"). This is operator-feel-friendly — NOT a
 * validation. The engine is the source of truth; the operator can intend
 * the overwrite.
 *
 * ARIA convention (Epic 18.2 codification): role="dialog" + aria-modal +
 * aria-labelledby on day one. (Add is NON-destructive; Delete uses
 * `role="alertdialog"`.)
 */

import React from "react";
import { api, type FlowableVariableInput } from "../api";
import { Icon } from "../components";
import { coerceVariableValue, VARIABLE_TYPES } from "./edit-variable-modal";
import { ErrorBox } from "./error-box";

export interface AddVariableModalProps {
  /** When false, the modal is closed. */
  open: boolean;
  instanceId: string;
  /** For client-side duplicate-name warning (NOT validation — engine is source of truth). */
  existingNames: string[];
  onClose: () => void;
  onSuccess?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const AddVariableModal: React.FC<AddVariableModalProps> = ({
  open,
  instanceId,
  existingNames,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<string>("string");
  const [valueText, setValueText] = React.useState("");
  const [scope, setScope] = React.useState<"global" | "local">("global");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName("");
    setType("string");
    setValueText("");
    setScope("global");
    setError(null);
    setBusy(false);
    setTimeout(() => nameRef.current?.focus(), 0);
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

  const trimmedName = name.trim();
  const isDuplicate = trimmedName !== "" && existingNames.includes(trimmedName);
  const canSubmit = !busy && trimmedName !== "";

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    const input: FlowableVariableInput = {
      name: trimmedName,
      value: coerceVariableValue(valueText, type),
      type,
    };
    if (scope === "local") input.scope = "local";
    try {
      await api.updateInstanceVariables(instanceId, [input]);
      setBusy(false);
      onSuccess?.();
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  const isMultiline = type === "string" || type === "json";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="add-variable-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-variable-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="add-variable-title">Add variable</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close add variable modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          {error && (
            <div style={{ marginBottom: 12 }}>
              <ErrorBox error={error} />
            </div>
          )}
          <label
            htmlFor="add-variable-name"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Name
          </label>
          <input
            ref={nameRef}
            id="add-variable-name"
            type="text"
            data-testid="add-variable-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            placeholder="e.g. tier"
            style={{ width: "100%", marginBottom: 4, fontFamily: "var(--font-mono)" }}
          />
          {isDuplicate && (
            <p
              data-testid="add-variable-duplicate-warning"
              className="mute"
              style={{ margin: "0 0 8px", fontSize: 11, color: "var(--warn)" }}
            >
              Name <span className="mono">{trimmedName}</span> exists — submitting will OVERWRITE
              the existing value.
            </p>
          )}
          <label
            htmlFor="add-variable-type"
            style={{ display: "block", marginTop: 8, marginBottom: 4, fontSize: 12 }}
          >
            Type
          </label>
          <select
            id="add-variable-type"
            data-testid="add-variable-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={busy}
            style={{ width: "100%", marginBottom: 12 }}
          >
            {VARIABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label
            htmlFor="add-variable-value"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Value
          </label>
          {isMultiline ? (
            <textarea
              id="add-variable-value"
              data-testid="add-variable-value"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              disabled={busy}
              rows={4}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          ) : (
            <input
              id="add-variable-value"
              data-testid="add-variable-value"
              type="text"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              disabled={busy}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          )}
          <fieldset style={{ marginTop: 12, border: 0, padding: 0 }}>
            <legend style={{ fontSize: 12, marginBottom: 4 }}>Scope</legend>
            <label style={{ display: "inline-flex", alignItems: "center", marginRight: 16 }}>
              <input
                type="radio"
                name="add-variable-scope"
                value="global"
                checked={scope === "global"}
                onChange={() => setScope("global")}
                disabled={busy}
                style={{ marginRight: 4 }}
              />
              global
            </label>
            <label style={{ display: "inline-flex", alignItems: "center" }}>
              <input
                type="radio"
                name="add-variable-scope"
                value="local"
                checked={scope === "local"}
                onChange={() => setScope("local")}
                disabled={busy}
                style={{ marginRight: 4 }}
              />
              local
            </label>
            <p className="mute" style={{ margin: "6px 0 0", fontSize: 11 }}>
              Scope <span className="mono">local</span> targets the current execution;{" "}
              <span className="mono">global</span> targets the whole instance.
            </p>
          </fieldset>
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="add-variable-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="add-variable-submit"
            onClick={submit}
            disabled={!canSubmit}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
};
