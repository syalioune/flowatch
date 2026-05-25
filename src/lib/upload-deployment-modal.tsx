// SPDX-License-Identifier: Apache-2.0

/**
 * Upload-deployment modal (Story 9.2).
 *
 * Renders a file-picker modal for BPMN uploads. The submit path calls
 * `api.deployBpmn(name, xml)` which routes through `uploadDeployment`
 * (the project's single multipart helper). On success the modal closes
 * and the caller is responsible for refreshing the deployments loader
 * (Story 9.2 wires this via TanStack Router's scoped invalidate). On
 * failure the modal stays open and renders the verbatim engine error
 * via `<ErrorBox>` per Pattern P-003.
 *
 * The modal is intentionally BPMN-specific. A sibling DMN modal arrives
 * with Story 15.2 — extraction into a generic UploadModal waits for the
 * second concrete consumer (Epic 8 retro §3.2: don't pre-abstract).
 */

import React from "react";
import { api, type FlowableDeployment } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface UploadDeploymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (deployment: FlowableDeployment) => void;
  /**
   * Focus-restore target (Epic 9 retro A-4, Story 10.2 AC-7). When set, the
   * trigger element is re-focused on modal close. When omitted, no
   * restoration happens (the previous focus-snapshot pattern is gone — it
   * was fragile when the trigger unmounted during the modal's lifecycle).
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// Exported for direct unit testing — the regex is the source of truth for
// AC-2's `.bpmn` / `.bpmn20.xml` filter; the `accept` attribute on the input
// is a hint to the OS picker only.
export const isValidBpmnExtension = (name: string): boolean => /\.(bpmn|bpmn20\.xml)$/i.test(name);

export const UploadDeploymentModal: React.FC<UploadDeploymentModalProps> = ({
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

  // Reset internal state every time the modal opens — picking a file in one
  // session must not bleed into the next.
  React.useEffect(() => {
    if (!open) return;
    setFile(null);
    setError(null);
    setBusy(false);
    setValidationMsg(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Escape closes — but not while busy: orphaning an in-flight upload would
  // leave the engine processing while the operator sees no feedback.
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
    if (!isValidBpmnExtension(picked.name)) {
      setValidationMsg("Please choose a .bpmn or .bpmn20.xml file.");
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
      const deployment = await api.deployBpmn(file.name, content);
      setBusy(false);
      onSuccess(deployment);
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
      data-testid="upload-deployment-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-hd">
          <h3>Upload BPMN deployment</h3>
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
            accept=".bpmn,.bpmn20.xml,application/xml,text/xml"
            data-testid="upload-deployment-input"
            onChange={onPick}
            disabled={busy}
          />
          {validationMsg && (
            <p className="mute text-xs" data-testid="upload-validation" style={{ marginTop: 8 }}>
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
            data-testid="upload-deployment-submit"
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
