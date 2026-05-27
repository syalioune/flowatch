// SPDX-License-Identifier: Apache-2.0

/**
 * Upload-DMN-deployment modal (Story 15.2).
 *
 * Mirrors `<UploadDeploymentModal>` (Story 9.2) for the DMN namespace.
 * The only difference is the wrapper called (`api.deployDmn` vs
 * `api.deployBpmn`) — both go through `uploadDeployment` internally and
 * share the multipart shape. File extension filter accepts `.dmn` or
 * `.xml`.
 *
 * Retryable-creation shape (per CLAUDE.md "Navigate-on-both vs
 * in-modal-ErrorBox decision"): on engine error, the modal stays open
 * and renders the verbatim engine error via `<ErrorBox>`; the operator
 * can fix-and-resubmit without re-typing.
 */

import React from "react";
import { api, type FlowableDeployment } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface UploadDmnDeploymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (deployment: FlowableDeployment) => void;
  /**
   * Focus-restore target (Story 10.2 AC-7). When set, the trigger element
   * is re-focused on modal close.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// Exported for direct unit testing. The `accept` attribute on the input
// is a hint to the OS picker; this regex is the source of truth for AC-2.
export const isValidDmnExtension = (name: string): boolean => /\.(dmn|xml)$/i.test(name);

export const UploadDmnDeploymentModal: React.FC<UploadDmnDeploymentModalProps> = ({
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [validationMsg, setValidationMsg] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setBusy(false);
    setValidationMsg(null);
    setTimeout(() => inputRef.current?.focus(), 0);
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

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      setFile(null);
      setValidationMsg(null);
      return;
    }
    if (!isValidDmnExtension(picked.name)) {
      setValidationMsg("Please choose a .dmn or .xml file.");
      setFile(null);
      return;
    }
    setValidationMsg(null);
    setFile(picked);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const content = await file.text();
      const deployment = await api.deployDmn(file.name, content);
      setBusy(false);
      onSuccess(deployment);
      closeWithFocus();
    } catch (err) {
      // Retryable-creation: render the engine error inline, preserve the
      // selected file, allow re-submit.
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="upload-dmn-deployment-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-dmn-deployment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="upload-dmn-deployment-title">Upload DMN deployment</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close upload modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <input
            ref={inputRef}
            type="file"
            accept=".dmn,.xml,application/xml,text/xml"
            data-testid="upload-dmn-deployment-input"
            onChange={onPick}
            disabled={busy}
          />
          {validationMsg && (
            <p
              className="mute text-xs"
              data-testid="upload-dmn-validation"
              style={{ marginTop: 8 }}
            >
              {validationMsg}
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
            data-testid="upload-dmn-deployment-submit"
            onClick={submit}
            disabled={!file || busy}
          >
            {busy ? "Deploying…" : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
};
