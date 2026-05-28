// SPDX-License-Identifier: Apache-2.0

/**
 * Edit-variable modal (Story 19.1).
 *
 * Retryable-creation archetype — mirrors `<StartInstanceModal>` shape
 * (Story 10.2). The Epic 18 retro AI-3 named console-shape as a candidate;
 * the spec explicitly rejected console-shape because the operator-feel
 * outcome of a successful edit is "show me the updated row," not "let me
 * keep editing the same variable" (see Story 19.1 Dev Notes "Modal-shape
 * decision").
 *
 * The wrapper `api.updateInstanceVariables` always sends an array body per
 * the engine contract (compat.md FR-19), so single-variable edits still pass
 * `[{name, value, type, scope}]`. The modal omits `scope: "global"` from the
 * body (engine treats absent scope as global).
 *
 * ARIA convention (Epic 18.2 codification): role="dialog" + aria-modal +
 * aria-labelledby on day one.
 */

import React from "react";
import { api, type FlowableVariable, type FlowableVariableInput } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

// Flowable variable types the operator can pick from the modal's <select>.
// Mirrors the engine-supported set per docs/api-contracts.md / probe history.
// A future Pattern P-008 guard test could parse this const and assert the
// engine's supported types — deferred until 19.2 + 21.1 add consumers.
export const VARIABLE_TYPES = [
  "string",
  "integer",
  "long",
  "double",
  "boolean",
  "short",
  "json",
  "date",
] as const;

export type VariableType = (typeof VARIABLE_TYPES)[number];

// Exported for unit testing. Converts the operator's textual input to the
// JS value Flowable expects on the wire. The engine is the source of truth
// for type coercion; this helper does the minimum to keep number / boolean
// types from being submitted as strings.
export const coerceVariableValue = (raw: string, type: string): unknown => {
  if (type === "integer" || type === "long" || type === "short" || type === "double") {
    if (raw.trim() === "") return raw;
    const num = Number(raw);
    return Number.isFinite(num) ? num : raw;
  }
  if (type === "boolean") {
    const lowered = raw.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
    return raw;
  }
  if (type === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
};

// Render the current value as the initial textarea / input content.
// Strings render unquoted (operator edits the literal); other types render
// their JSON representation so the operator sees what the engine returned.
export const renderInitialValue = (value: unknown, type?: string): string => {
  if (value === null || value === undefined) return "";
  if (type === "string") return String(value);
  if (type === "json") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export interface EditVariableModalProps {
  /** When null, the modal is closed. Pass a variable to open. */
  variable: FlowableVariable | null;
  instanceId: string;
  onClose: () => void;
  /** Fired after a successful PUT. Parent calls variables.reload(). */
  onSuccess?: () => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const EditVariableModal: React.FC<EditVariableModalProps> = ({
  variable,
  instanceId,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [type, setType] = React.useState<string>("string");
  const [valueText, setValueText] = React.useState("");
  const [scope, setScope] = React.useState<"global" | "local">("global");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const valueRef = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!variable) return;
    const initialType = variable.type ?? "string";
    setType(initialType);
    setValueText(renderInitialValue(variable.value, initialType));
    setScope(variable.scope === "local" ? "local" : "global");
    setError(null);
    setBusy(false);
    setTimeout(() => valueRef.current?.focus(), 0);
  }, [variable]);

  React.useEffect(() => {
    if (!variable || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variable, busy, onClose, triggerRef]);

  if (!variable) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    const input: FlowableVariableInput = {
      name: variable.name,
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
      data-testid="edit-variable-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-variable-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="edit-variable-title">Edit variable</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close edit variable modal"
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
            htmlFor="edit-variable-name"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Name
          </label>
          <input
            id="edit-variable-name"
            type="text"
            value={variable.name}
            readOnly
            disabled
            style={{ width: "100%", marginBottom: 12, fontFamily: "var(--font-mono)" }}
          />
          <label
            htmlFor="edit-variable-type"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Type
          </label>
          <select
            id="edit-variable-type"
            data-testid="edit-variable-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={busy}
            style={{ width: "100%", marginBottom: 12 }}
          >
            {/* If the engine returned a type not in VARIABLE_TYPES (forward-compat
                with future Flowable versions), prepend it as an explicit option so
                the <select> is controlled rather than silently showing "string"
                while state holds the unknown type. */}
            {!(VARIABLE_TYPES as readonly string[]).includes(type) && (
              <option key={type} value={type}>
                {type}
              </option>
            )}
            {VARIABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label
            htmlFor="edit-variable-value"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Value
          </label>
          {isMultiline ? (
            <textarea
              ref={valueRef as React.RefObject<HTMLTextAreaElement>}
              id="edit-variable-value"
              data-testid="edit-variable-value"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              disabled={busy}
              rows={4}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          ) : (
            <input
              ref={valueRef as React.RefObject<HTMLInputElement>}
              id="edit-variable-value"
              data-testid="edit-variable-value"
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
                name="edit-variable-scope"
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
                name="edit-variable-scope"
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
            data-testid="edit-variable-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="edit-variable-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};
