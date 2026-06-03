// SPDX-License-Identifier: Apache-2.0

/**
 * Deploy DMN modal — mirrors `<DeployBpmnModal>` (PR #168 follow-up round 4).
 *
 * Inserts a confirmation step between clicking the modeler's "Deploy"
 * button and posting the multipart deployment to Flowable. Two fields:
 * **definition name** + **definition id** (the DMN model's
 * `<definitions name="…" id="…">` tuple, which is the same metadata
 * dmn-js's `.dmn-definitions-name` / `.dmn-definitions-id` editors at
 * the top of the DRD canvas mutate). Defaults are derived from the
 * current DMN XML, falling back to filename-derived values when the
 * model uses a BLANK template placeholder.
 *
 * Retryable-creation modal shape (CLAUDE.md "Modal conventions"): the
 * parent's `onConfirm` may throw — the modal renders an in-modal
 * ErrorBox so the operator can fix the inputs and resubmit without
 * re-typing. Modal closes ONLY on a successful confirm or explicit
 * cancel.
 *
 * Reuses the `.modal-back` / `.modal` / `.modal-hd` / `.modal-bd` /
 * `.modal-ft` palette.
 */

import React from "react";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface DeployDmnModalTarget {
  /** Pre-filled definition name input — from `<definitions name>`. */
  defaultName: string;
  /** Pre-filled definition id input — from `<definitions id>`. */
  defaultKey: string;
  /** Echoed read-only in the modal body. */
  filename: string;
  /**
   * Story 27.1 — "Save as new version" mode. When true the id input is
   * rendered read-only (changing the decision key would fork a new v1
   * family rather than version the loaded decision). The name stays
   * editable. Additive + backward-compatible; mirrors
   * `DeployBpmnModalTarget.lockKey`.
   */
  lockKey?: boolean;
}

export interface DeployDmnModalProps {
  /** When null, the modal is closed. Pass a target to open. */
  target: DeployDmnModalTarget | null;
  /**
   * Called with the operator-chosen name + key. The parent runs the real
   * deploy (XML rewrite + multipart POST + dropdown refresh + open-action
   * toast). Throw to surface an in-modal ErrorBox.
   */
  onConfirm: (name: string, key: string) => Promise<void>;
  onClose: () => void;
  /** Focus-restore target on close. */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// DMN id grammar follows XML NCName like BPMN — must start with a letter
// or `_` and contain only letters / digits / `-` / `_` / `.`. Mirrors the
// validation in `<DeployBpmnModal>`.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export const DeployDmnModal: React.FC<DeployDmnModalProps> = ({
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

  React.useEffect(() => {
    if (!target) return;
    setName(target.defaultName);
    setKey(target.defaultKey);
    setError(null);
    setKeyError(null);
    setBusy(false);
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [target]);

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
      setKeyError("Definition id is required.");
      return;
    }
    if (!KEY_RE.test(trimmedKey)) {
      setKeyError(
        "Id must start with a letter or underscore and contain only letters, digits, _, -, or .",
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
      data-testid="deploy-dmn-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deploy-dmn-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="deploy-dmn-title">Deploy DMN</h3>
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
            Deploying <strong className="mono">{target.filename}</strong>. Name + id below are
            rewritten into the <code>&lt;definitions&gt;</code> element before posting to Flowable.
          </p>
          <label
            htmlFor="deploy-dmn-name"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Definition name
          </label>
          <input
            ref={nameRef}
            id="deploy-dmn-name"
            type="text"
            data-testid="deploy-dmn-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <label
            htmlFor="deploy-dmn-key"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Definition id
          </label>
          <input
            id="deploy-dmn-key"
            type="text"
            data-testid="deploy-dmn-key"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (keyError) setKeyError(null);
            }}
            disabled={busy}
            readOnly={!!target.lockKey}
            aria-readonly={target.lockKey || undefined}
            style={{
              width: "100%",
              fontFamily: "var(--font-mono)",
              opacity: target.lockKey ? 0.7 : undefined,
            }}
          />
          {target.lockKey && (
            <p
              data-testid="deploy-dmn-key-locked-caption"
              className="mute"
              style={{ margin: "6px 0 0", fontSize: 12 }}
            >
              Id locked — deploying under <code className="mono">{key}</code> creates the next
              version.
            </p>
          )}
          {keyError && (
            <p
              data-testid="deploy-dmn-key-error"
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
            data-testid="deploy-dmn-submit"
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
