// SPDX-License-Identifier: Apache-2.0

/**
 * Edit-user modal (Story 22.2) — 21st modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<EditTaskModal>` (Story 21.1) shape
 * scaled to four user fields (firstName / lastName / email / password). The
 * `id` field is read-only display ABOVE the form — Flowable's user id is the
 * primary key, immutable after create.
 *
 * Password handling is special-cased: empty password input means "don't
 * touch" — the field is OMITTED from the PUT body. Non-empty password is
 * ALWAYS included regardless of diff (no baseline exists; we can't read the
 * engine's stored password to diff against).
 *
 * Diff-empty no-op guard (Story 21.1 AC-8 inherited): the modal computes a
 * diff between current inputs and the user's current values; Save is disabled
 * when no field changed AND password is empty. A mute hint "No changes to
 * save." reveals once the operator interacts.
 *
 * ARIA convention (Epic 18.2): role="dialog" + aria-modal + aria-labelledby
 * on day one. Third consumer of the PUT-with-partial-fields wrapper family
 * (codification at N=4 with Story 22.3 `updateGroup`).
 */

import React from "react";
import { api, type FlowableUser } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface EditUserModalProps {
  /** When null, the modal is closed. Pass a user to open. */
  user: FlowableUser | null;
  onClose: () => void;
  /** Fired after a successful PUT. Parent reloads the detail route here. */
  onSuccess?: () => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

type Inputs = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

const initialInputs = (user: FlowableUser): Inputs => ({
  firstName: user.firstName ?? "",
  lastName: user.lastName ?? "",
  email: user.email ?? "",
  password: "",
});

type UpdatePayload = Partial<{
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}>;

const computeDiff = (inputs: Inputs, user: FlowableUser): UpdatePayload => {
  const diff: UpdatePayload = {};
  const currentFirst = user.firstName ?? "";
  if (inputs.firstName !== currentFirst) diff.firstName = inputs.firstName;
  const currentLast = user.lastName ?? "";
  if (inputs.lastName !== currentLast) diff.lastName = inputs.lastName;
  const currentEmail = user.email ?? "";
  if (inputs.email !== currentEmail) diff.email = inputs.email;
  // Password is special-cased: non-empty input ALWAYS goes in the body
  // regardless of "diff"; empty input means "don't touch".
  if (inputs.password !== "") diff.password = inputs.password;
  return diff;
};

export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [inputs, setInputs] = React.useState<Inputs>(() =>
    user ? initialInputs(user) : { firstName: "", lastName: "", email: "", password: "" },
  );
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pristine, setPristine] = React.useState(true);
  const firstNameRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setInputs(initialInputs(user));
    setError(null);
    setBusy(false);
    setPristine(true);
    setTimeout(() => firstNameRef.current?.focus(), 0);
  }, [user]);

  React.useEffect(() => {
    if (!user || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [user, busy, onClose, triggerRef]);

  const diff = React.useMemo(
    () => (user ? computeDiff(inputs, user) : ({} as UpdatePayload)),
    [inputs, user],
  );

  if (!user) return null;

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
      await api.updateUser(user.id, diff);
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
      data-testid="edit-user-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="edit-user-title">Edit user</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-disabled={busy}
            aria-label="Close edit user modal"
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
              Editing user <span className="mono">{user.id}</span>
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="edit-user-first-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  First name
                </label>
                <input
                  ref={firstNameRef}
                  id="edit-user-first-name"
                  data-testid="edit-user-first-name"
                  type="text"
                  value={inputs.firstName}
                  onChange={(e) => setField("firstName", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-user-last-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Last name
                </label>
                <input
                  id="edit-user-last-name"
                  data-testid="edit-user-last-name"
                  type="text"
                  value={inputs.lastName}
                  onChange={(e) => setField("lastName", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-user-email"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Email
                </label>
                <input
                  id="edit-user-email"
                  data-testid="edit-user-email"
                  type="text"
                  value={inputs.email}
                  onChange={(e) => setField("email", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-user-password"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Password
                </label>
                <input
                  id="edit-user-password"
                  data-testid="edit-user-password"
                  type="password"
                  value={inputs.password}
                  onChange={(e) => setField("password", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <p className="mute" style={{ margin: "4px 0 0", fontSize: 11 }}>
                  Leave empty to keep the current password.
                </p>
              </div>
            </div>
            {!pristine && diffEmpty && (
              <p
                className="mute"
                data-testid="edit-user-no-changes"
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
              data-testid="edit-user-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="edit-user-submit"
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
