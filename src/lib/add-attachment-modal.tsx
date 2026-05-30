// SPDX-License-Identifier: Apache-2.0

/**
 * Add-attachment modal (Story 21.2) — 18th modal in the catalogue.
 *
 * Retryable-creation archetype with an inline Link / File mode-toggle (the
 * project's FIRST in-modal segmented-control). The toggle swaps the input
 * fields below it; `name` / `description` / `type` are shared across modes.
 * Mode-switching CLEARS the mode-specific fields (`externalUrl` cleared on
 * Link→File, `file` cleared on File→Link) to prevent stale data leaking
 * across submits.
 *
 * Submit branches:
 *   - Link mode → api.addTaskAttachment(taskId, {kind: "url", ...})
 *     → JSON POST via request() funnel.
 *   - File mode → api.addTaskAttachment(taskId, {kind: "file", ...})
 *     → multipart POST inside src/api.ts (Pattern P-001 preserved).
 *
 * Modal ARIA convention from day one (Epic 18.2 codification).
 */

import React from "react";
import { api } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface AddAttachmentModalProps {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type Mode = "url" | "file";

export const AddAttachmentModal: React.FC<AddAttachmentModalProps> = ({
  taskId,
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [mode, setMode] = React.useState<Mode>("url");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState("");
  const [externalUrl, setExternalUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setMode("url");
    setName("");
    setDescription("");
    setType("");
    setExternalUrl("");
    setFile(null);
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

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "file") setExternalUrl("");
    else setFile(null);
    setMode(next);
  };

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const canSubmit =
    !busy && name.trim() !== "" && (mode === "url" ? externalUrl.trim() !== "" : file !== null);

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "url") {
        const payload: {
          kind: "url";
          name: string;
          externalUrl: string;
          type?: string;
          description?: string;
        } = {
          kind: "url",
          name: name.trim(),
          externalUrl: externalUrl.trim(),
        };
        if (description.trim()) payload.description = description.trim();
        if (type.trim()) payload.type = type.trim();
        await api.addTaskAttachment(taskId, payload);
      } else if (file) {
        const payload: {
          kind: "file";
          name: string;
          file: File;
          type?: string;
          description?: string;
        } = {
          kind: "file",
          name: name.trim(),
          file,
        };
        if (description.trim()) payload.description = description.trim();
        const resolvedType = type.trim() || file.type;
        if (resolvedType) payload.type = resolvedType;
        await api.addTaskAttachment(taskId, payload);
      }
      setBusy(false);
      onSuccess?.();
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  const onFilePick = (next: File | null) => {
    setFile(next);
    if (next && name.trim() === "") setName(next.name);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="add-attachment-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-attachment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 540 }}
      >
        <div className="modal-hd">
          <h3 id="add-attachment-title">Add attachment</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close add attachment modal"
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
            <div
              role="radiogroup"
              aria-label="Attachment kind"
              style={{ display: "flex", gap: 6, marginBottom: 12 }}
            >
              <button
                type="button"
                className="btn"
                data-size="sm"
                data-variant={mode === "url" ? "primary" : "ghost"}
                aria-pressed={mode === "url"}
                data-testid="add-attachment-mode-url"
                onClick={() => switchMode("url")}
                disabled={busy}
              >
                Link (URL)
              </button>
              <button
                type="button"
                className="btn"
                data-size="sm"
                data-variant={mode === "file" ? "primary" : "ghost"}
                aria-pressed={mode === "file"}
                data-testid="add-attachment-mode-file"
                onClick={() => switchMode("file")}
                disabled={busy}
              >
                File (upload)
              </button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="add-attachment-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Name
                </label>
                <input
                  ref={nameRef}
                  id="add-attachment-name"
                  data-testid="add-attachment-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-attachment-description"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Description
                </label>
                <textarea
                  id="add-attachment-description"
                  data-testid="add-attachment-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={busy}
                  rows={2}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-attachment-type"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Type (MIME)
                </label>
                <input
                  id="add-attachment-type"
                  data-testid="add-attachment-type"
                  type="text"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={busy}
                  placeholder={
                    mode === "file" ? "auto-detected from file if blank" : "e.g. text/html"
                  }
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              {mode === "url" ? (
                <div>
                  <label
                    htmlFor="add-attachment-url"
                    style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                  >
                    External URL
                  </label>
                  <input
                    id="add-attachment-url"
                    data-testid="add-attachment-url"
                    type="url"
                    required
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    disabled={busy}
                    placeholder="https://example.com/doc.pdf"
                    style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="add-attachment-file"
                    style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                  >
                    File
                  </label>
                  <input
                    id="add-attachment-file"
                    data-testid="add-attachment-file"
                    type="file"
                    onChange={(e) => onFilePick(e.target.files?.[0] ?? null)}
                    disabled={busy}
                    style={{ width: "100%", fontSize: 12 }}
                  />
                  <p className="mute" style={{ margin: "4px 0 0", fontSize: 11 }}>
                    Large files may be rejected by the engine.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="add-attachment-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="add-attachment-submit"
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
