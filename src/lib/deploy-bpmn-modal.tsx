// SPDX-License-Identifier: Apache-2.0

/**
 * Deploy BPMN modal (PR #168 follow-up — operator round 4).
 *
 * Inserts a confirmation step between clicking the modeler's "Deploy"
 * button and posting the multipart deployment to Flowable. Two fields:
 * **process definition name** + **process definition key**. Defaults are
 * derived from the BPMN file's `<bpmn:process id="…" name="…">` (or from
 * the filename when the XML still carries the BLANK template's
 * `newProcess` placeholder).
 *
 * Retryable-creation modal shape (CLAUDE.md "Modal conventions"): the
 * parent's `onConfirm` may throw — the modal renders an in-modal
 * ErrorBox so the operator can fix the inputs and resubmit without
 * re-typing. Modal closes ONLY on a successful confirm or explicit
 * cancel.
 *
 * Reuses the `.modal-back` / `.modal` / `.modal-hd` / `.modal-bd` /
 * `.modal-ft` palette established by SettingsModal + 9.2 + 9.3 + 10.2.
 */

import React from "react";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface DeployBpmnModalTarget {
  /** Pre-filled process definition name input. */
  defaultName: string;
  /** Pre-filled process definition key input. */
  defaultKey: string;
  /** Echoed read-only in the modal body so the operator knows what is being deployed. */
  filename: string;
}

export interface DeployBpmnModalProps {
  /** When null, the modal is closed. Pass a target to open. */
  target: DeployBpmnModalTarget | null;
  /**
   * Called with the operator-chosen name + key. The parent runs the real
   * deploy (XML rewrite + multipart POST + dropdown refresh + open-action
   * toast). Throw to surface an in-modal ErrorBox.
   */
  onConfirm: (name: string, key: string) => Promise<void>;
  onClose: () => void;
  /** Epic 9 retro A-4 — focus-restore target on close. */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// Flowable's BPMN id grammar is XML NCName: must start with a letter / `_`
// and contain only letters / digits / `-` / `_` / `.`. We mirror the same
// validation operators saw on `bpmnIdFromFilename` in BpmnModeler.tsx.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export const DeployBpmnModal: React.FC<DeployBpmnModalProps> = ({
  target,
  onConfirm,
  onClose,
  triggerRef,
}) => {
  const [name, setName] = React.useState("");
  const [key, setKey] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);
  const [keyError, setKeyError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  // Reset every time a fresh target is opened. No draft persistence
  // across opens — defaults always reflect the current diagram state.
  React.useEffect(() => {
    if (!target) return;
    setName(target.defaultName);
    setKey(target.defaultKey);
    setError(null);
    setKeyError(null);
    setBusy(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [target]);

  // Esc closes — suppressed while busy.
  React.useEffect(() => {
    if (!target || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, busy, onClose, triggerRef]);

  if (!target) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setKeyError("Process definition key is required.");
      return;
    }
    if (!KEY_RE.test(trimmedKey)) {
      setKeyError(
        "Key must start with a letter or underscore and contain only letters, digits, _, -, or .",
      );
      return;
    }
    setKeyError(null);
    setError(null);
    setBusy(true);
    try {
      await onConfirm(trimmedName || trimmedKey, trimmedKey);
      setBusy(false);
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; Esc handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target
    <div
      className="modal-back"
      data-testid="deploy-bpmn-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="modal-hd">
          <h3>Deploy BPMN</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close deploy modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p className="mute" style={{ margin: "0 0 12px", fontSize: 12 }}>
            Deploying <strong className="mono">{target.filename}</strong>. Name + key below are
            rewritten into the BPMN XML's <code>&lt;bpmn:process&gt;</code> before posting to
            Flowable.
          </p>
          <label
            htmlFor="deploy-bpmn-name"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Process definition name
          </label>
          <input
            ref={nameRef}
            id="deploy-bpmn-name"
            type="text"
            data-testid="deploy-bpmn-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <label
            htmlFor="deploy-bpmn-key"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Process definition key
          </label>
          <input
            id="deploy-bpmn-key"
            type="text"
            data-testid="deploy-bpmn-key"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (keyError) setKeyError(null);
            }}
            disabled={busy}
            style={{ width: "100%", fontFamily: "var(--font-mono)" }}
          />
          {keyError && (
            <p
              data-testid="deploy-bpmn-key-error"
              style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bad)" }}
            >
              {keyError}
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
            data-testid="deploy-bpmn-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Deploying…" : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
};
