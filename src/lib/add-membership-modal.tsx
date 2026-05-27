// SPDX-License-Identifier: Apache-2.0

/**
 * Add-membership modal (Story 14.3).
 *
 * Used by both surfaces:
 *   - <GroupMembersPanel>      mode="add-user-to-group"  groupId fixed
 *   - <UserDetail> memberships mode="add-group-to-user"  userId fixed
 *
 * Retryable-creation failure-path (CLAUDE.md "Navigate-on-both vs
 * in-modal-ErrorBox"): failure renders <ErrorBox> inside the modal and
 * preserves the selected option so the operator can fix-and-resubmit.
 * Success fires a toast, calls onSuccess + onClose, and restores focus
 * to triggerRef per CLAUDE.md "Modal focus-restore via triggerRef".
 */

import React from "react";
import { api, type FlowableGroup, type FlowableUser } from "../api";
import { Icon, toast } from "../components";
import { ErrorBox } from "./error-box";

export type AddMembershipMode = "add-user-to-group" | "add-group-to-user";

export interface AddMembershipModalProps {
  /** When false, the modal is closed. */
  open: boolean;
  /** Add a user to this group (mode="add-user-to-group") OR pick a group for this user (mode="add-group-to-user"). */
  mode: AddMembershipMode;
  /** Required when mode === "add-user-to-group". */
  groupId?: string;
  /** Required when mode === "add-group-to-user". */
  userId?: string;
  onClose: () => void;
  /** Fires AFTER a successful add API call so the parent can `panel.reload()`. */
  onSuccess: () => void;
  /** Focus-restore target per CLAUDE.md modal triggerRef convention. */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

interface PickerOption {
  id: string;
  label: string;
}

const userLabel = (u: FlowableUser): string => {
  const name = `${u.firstName || ""} ${u.lastName || ""}`.trim();
  return name ? `${name} · ${u.id}` : u.id;
};

const groupLabel = (g: FlowableGroup): string =>
  g.name && g.name !== g.id ? `${g.name} · ${g.id}` : g.id;

export const AddMembershipModal: React.FC<AddMembershipModalProps> = ({
  open,
  mode,
  groupId,
  userId,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [options, setOptions] = React.useState<PickerOption[]>([]);
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<Error | null>(null);
  const selectRef = React.useRef<HTMLSelectElement | null>(null);

  // Load options when the modal opens
  React.useEffect(() => {
    if (!open) return;
    setSelected("");
    setSubmitError(null);
    setLoadError(null);
    setLoading(true);
    const fetchOptions = async () => {
      try {
        if (mode === "add-user-to-group") {
          const res = await api.listUsers({ size: 50 });
          setOptions(res.data.map((u) => ({ id: u.id, label: userLabel(u) })));
        } else {
          const res = await api.listGroups({ size: 50 });
          setOptions(res.data.map((g) => ({ id: g.id, label: groupLabel(g) })));
        }
        setLoading(false);
        setTimeout(() => selectRef.current?.focus(), 0);
      } catch (err) {
        setLoadError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
    };
    void fetchOptions();
  }, [open, mode]);

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

  const canSubmit = !busy && !loading && selected.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const targetUserId = mode === "add-user-to-group" ? selected : (userId as string);
      const targetGroupId = mode === "add-user-to-group" ? (groupId as string) : selected;
      const pickedLabel = options.find((o) => o.id === selected)?.label ?? selected;
      const fixedLabel = mode === "add-user-to-group" ? (groupId as string) : (userId as string);
      await api.addUserToGroup(targetUserId, targetGroupId);
      toast({
        kind: "ok",
        text:
          mode === "add-user-to-group"
            ? `Added ${pickedLabel} to ${fixedLabel}.`
            : `Added ${fixedLabel} to ${pickedLabel}.`,
        ttl: 3000,
      });
      onSuccess();
      setBusy(false);
      closeWithFocus();
    } catch (err) {
      setSubmitError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  const title = mode === "add-user-to-group" ? "Add user to group" : "Add user to group";
  const pickerLabel = mode === "add-user-to-group" ? "User" : "Group";
  const helperText =
    mode === "add-user-to-group"
      ? "Showing first 50 users; restart with a ?search= filter (Epic 18) to scope."
      : "Showing first 50 groups; restart with a ?search= filter (Epic 18) to scope.";

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="add-membership-modal"
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
        aria-labelledby="add-membership-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 460 }}
      >
        <div className="modal-hd">
          <h3 id="add-membership-title">{title}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close add-membership modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 4px" }}>
            {mode === "add-user-to-group" ? (
              <>
                Group: <strong className="mono">{groupId}</strong>
              </>
            ) : (
              <>
                User: <strong className="mono">{userId}</strong>
              </>
            )}
          </p>
          <label
            htmlFor="add-membership-select"
            style={{ display: "block", marginBottom: 4, marginTop: 12, fontSize: 12 }}
          >
            {pickerLabel}
          </label>
          {loadError && (
            <div data-testid="add-membership-load-error" style={{ marginBottom: 8 }}>
              <ErrorBox error={loadError} />
            </div>
          )}
          <select
            ref={selectRef}
            id="add-membership-select"
            className="input"
            data-testid="add-membership-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy || loading || !!loadError}
            style={{ width: "100%" }}
          >
            <option value="">{loading ? "Loading…" : "Select…"}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="mute" style={{ display: "block", marginTop: 6, fontSize: 12 }}>
            {helperText}
          </span>
          {submitError && (
            <div data-testid="add-membership-error" style={{ marginTop: 12 }}>
              <ErrorBox error={submitError} />
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="add-membership-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="add-membership-confirm"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
};
