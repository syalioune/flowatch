// SPDX-License-Identifier: Apache-2.0

/**
 * Edit-group modal (Story 22.3) — 24th modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<EditUserModal>` (Story 22.2)
 * shape scaled to 2 editable fields (name + type). Read-only ID display
 * above the form.
 *
 * Diff-empty no-op guard (Story 21.1 / 22.2 inheritance): Save disabled
 * when no field changed; mute hint reveals once operator interacts.
 *
 * ARIA convention (Epic 18.2): role="dialog" + aria-modal + aria-labelledby
 * on day one. PUT-with-partial-fields family N=4 — see CLAUDE.md
 * codification.
 */

import React from "react";
import { api, type FlowableGroup } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface EditGroupModalProps {
  group: FlowableGroup | null;
  onClose: () => void;
  onSuccess?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type Inputs = { name: string; type: string };

const initialInputs = (group: FlowableGroup): Inputs => ({
  name: group.name ?? "",
  type: group.type ?? "",
});

type UpdatePayload = Partial<{ name: string; type: string }>;

const computeDiff = (inputs: Inputs, group: FlowableGroup): UpdatePayload => {
  const diff: UpdatePayload = {};
  const currentName = group.name ?? "";
  if (inputs.name !== currentName) diff.name = inputs.name;
  const currentType = group.type ?? "";
  if (inputs.type !== currentType) diff.type = inputs.type;
  return diff;
};

export const EditGroupModal: React.FC<EditGroupModalProps> = ({
  group,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [inputs, setInputs] = React.useState<Inputs>(() =>
    group ? initialInputs(group) : { name: "", type: "" },
  );
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pristine, setPristine] = React.useState(true);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!group) return;
    setInputs(initialInputs(group));
    setError(null);
    setBusy(false);
    setPristine(true);
    setTimeout(() => nameRef.current?.focus(), 0);
  }, [group]);

  React.useEffect(() => {
    if (!group || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [group, busy, onClose, triggerRef]);

  const diff = React.useMemo(
    () => (group ? computeDiff(inputs, group) : ({} as UpdatePayload)),
    [inputs, group],
  );

  if (!group) return null;

  const diffEmpty = Object.keys(diff).length === 0;
  const canSave = !busy && !diffEmpty;

  const setField = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setPristine(false);
  };

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    setBusy(true);
    try {
      await api.updateGroup(group.id, diff);
      setBusy(false);
      onSuccess?.();
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
      data-testid="edit-group-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-group-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="edit-group-title">Edit group</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-disabled={busy}
            aria-label="Close edit group modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) submit();
          }}
        >
          <div className="modal-bd">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox error={error} />
              </div>
            )}
            <p className="mute" style={{ margin: "0 0 12px", fontSize: 12 }}>
              Editing group <span className="mono">{group.id}</span>
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="edit-group-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Name
                </label>
                <input
                  ref={nameRef}
                  id="edit-group-name"
                  data-testid="edit-group-name"
                  type="text"
                  value={inputs.name}
                  onChange={(e) => setField("name", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-group-type"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Type
                </label>
                <input
                  id="edit-group-type"
                  data-testid="edit-group-type"
                  type="text"
                  value={inputs.type}
                  onChange={(e) => setField("type", e.target.value)}
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
            {!pristine && diffEmpty && (
              <p
                className="mute"
                data-testid="edit-group-no-changes"
                style={{ margin: "10px 0 0", fontSize: 11 }}
              >
                No changes to save.
              </p>
            )}
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="edit-group-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="edit-group-submit"
              disabled={!canSave}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
