// SPDX-License-Identifier: Apache-2.0

/**
 * Start-instance modal (Story 10.2).
 *
 * Closes the 9.4 placeholder. Three logical fields: read-only definition
 * context, optional business key, optional Variables (JSON) textarea.
 * Variables JSON is parsed client-side and validated to be a plain object
 * before submit. On success: modal closes, navigates to the new instance's
 * detail page, and surfaces a success toast. On failure: the modal stays
 * open with an in-modal ErrorBox (retry-without-re-typing is meaningful
 * here — caller-supplied JSON shouldn't have to be re-entered after a
 * transient engine 500).
 *
 * Reuses the `.modal-back` / `.modal` / `.modal-hd` / `.modal-bd` /
 * `.modal-ft` palette established by SettingsModal + 9.2 + 9.3.
 *
 * Implements Epic 9 retro A-4 (focus-restore standardisation) via the
 * `triggerRef` prop. The existing 9.2 + 9.3 modals are refactored in the
 * same PR to accept the same prop.
 */

import { useNavigate } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableProcessDefinition, type FlowableProcessInstance } from "../api";
import { Icon, toast } from "../components";
import { ErrorBox } from "./error-box";

export interface FlowableVariableEntry {
  name: string;
  value: unknown;
  type?: string;
}

// Flowable's REST contract for POST /runtime/process-instances accepts variables
// as an array of `{ name, value, type? }`. Operators type a flat JSON object
// because it's more natural; this helper converts on the wire.
export const toFlowableVariables = (vars: Record<string, unknown>): FlowableVariableEntry[] =>
  Object.entries(vars).map(([name, value]) => ({ name, value }));

export interface ParsedVariables {
  ok: true;
  value: Record<string, unknown> | null;
}

export interface ParseError {
  ok: false;
  message: string;
}

// Exported for unit testing of AC-3's JSON parse + object-shape rules.
export const parseVariablesInput = (raw: string): ParsedVariables | ParseError => {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      message: `Variables must be valid JSON. ${(err as Error)?.message ?? String(err)}`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      message: 'Variables must be a JSON object (e.g. { "key": "value" }).',
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
};

export interface StartInstanceModalProps {
  /** When null, the modal is closed. Pass a definition to open. */
  definition: FlowableProcessDefinition | null;
  onClose: () => void;
  /** Fired with the created instance after a successful start. */
  onSuccess?: (instance: FlowableProcessInstance) => void;
  /**
   * Focus-restore target (Epic 9 retro A-4). When set, the trigger element
   * is re-focused on modal close. When omitted, no restoration happens.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const StartInstanceModal: React.FC<StartInstanceModalProps> = ({
  definition,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const navigate = useNavigate();
  const [businessKey, setBusinessKey] = React.useState("");
  const [variablesText, setVariablesText] = React.useState("");
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const businessKeyRef = React.useRef<HTMLInputElement | null>(null);

  // Reset state every time a new definition is targeted. No draft persistence.
  React.useEffect(() => {
    if (!definition) return;
    setBusinessKey("");
    setVariablesText("");
    setParseError(null);
    setError(null);
    setBusy(false);
    setTimeout(() => businessKeyRef.current?.focus(), 0);
  }, [definition]);

  // Esc closes — suppressed while busy (request in flight).
  React.useEffect(() => {
    if (!definition || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [definition, busy, onClose, triggerRef]);

  if (!definition) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    const parsed = parseVariablesInput(variablesText);
    if (!parsed.ok) {
      setParseError(parsed.message);
      return;
    }
    setParseError(null);
    setError(null);
    setBusy(true);
    const trimmedKey = businessKey.trim();
    const body: Record<string, unknown> = { processDefinitionKey: definition.key };
    if (trimmedKey) body.businessKey = trimmedKey;
    if (parsed.value) body.variables = toFlowableVariables(parsed.value);
    try {
      const instance = await api.startProcessInstance(body);
      setBusy(false);
      onSuccess?.(instance);
      toast({
        kind: "ok",
        text: `Started: ${definition.name || definition.key}`,
        sub: `id ${instance.id}`,
        ttl: 4000,
      });
      // Starting an instance increments the Sidebar's `instances` badge AND
      // may also create a `tasks` row immediately (first userTask of the
      // process). The refreshNavCounts listener picks up both in one sweep.
      window.dispatchEvent(new CustomEvent("nav:invalidate-counts"));
      // Close before navigating so the modal unmounts and triggerRef.focus()
      // doesn't fight TanStack Router's focus management on the next page.
      onClose();
      navigate({ to: "/instances/$id", params: { id: instance.id } });
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
      data-testid="start-instance-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="modal-hd">
          <h3>Start process instance</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close start instance modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p className="mute" style={{ margin: "0 0 12px", fontSize: 12 }}>
            Definition: <strong>{definition.name || definition.key}</strong>{" "}
            <span className="mono">
              (key: {definition.key}, version: {definition.version})
            </span>
          </p>
          <label
            htmlFor="start-instance-business-key"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Business key
          </label>
          <input
            ref={businessKeyRef}
            id="start-instance-business-key"
            type="text"
            data-testid="start-instance-business-key"
            placeholder="e.g. order-1234 (optional)"
            value={businessKey}
            onChange={(e) => setBusinessKey(e.target.value)}
            disabled={busy}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <label
            htmlFor="start-instance-variables"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Variables (JSON)
          </label>
          <textarea
            id="start-instance-variables"
            data-testid="start-instance-variables"
            placeholder='{ "amount": 1000, "currency": "EUR" }'
            value={variablesText}
            onChange={(e) => {
              setVariablesText(e.target.value);
              if (parseError) setParseError(null);
            }}
            disabled={busy}
            rows={6}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          {parseError && (
            <p
              data-testid="start-instance-variables-error"
              style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bad)" }}
            >
              {parseError}
            </p>
          )}
          {error && (
            <div style={{ marginTop: 12 }}>
              <ErrorBox error={error} />
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button type="button" className="btn" onClick={closeWithFocus} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="start-instance-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
};
