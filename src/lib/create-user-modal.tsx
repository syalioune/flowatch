// SPDX-License-Identifier: Apache-2.0

/**
 * Create-user modal (Story 22.1) — 20th modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<EditCategoryModal>` (Story 20.1)
 * and `<AddVariableModal>` (Story 19.2) scaled to a 5-field form (id +
 * firstName + lastName + email + password). The engine validates `id`
 * non-null itself (compat.md FR-46); the modal disables Save when `id` is
 * empty so the operator never sees the engine's `Bad request: Id cannot be
 * null` for trivially-empty inputs. The modal does NOT pre-validate email
 * format or password strength — the engine is the source of truth (Flowable
 * 7.2 is permissive on both surfaces; see Story 22.1 T-9 probe).
 *
 * Body shape: empty optional inputs are omitted from the POST body — the
 * engine treats absent fields as null and round-trips them as such (T-9
 * Probe 3). `tenantId` is NOT included; the engine ignores it on POST per
 * the read-only-on-create FlowableUser DTO contract.
 *
 * Anchors the POST-create wrapper family at N=1 (Story 22.3 createGroup
 * becomes N=2). ARIA convention (Epic 18.2): role="dialog" + aria-modal +
 * aria-labelledby on day one.
 */

import React from "react";
import { api } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface CreateUserModalProps {
  /** When false, the modal is closed. */
  open: boolean;
  onClose: () => void;
  /** Fired after a successful POST. Parent calls `router.invalidate(...)` here. */
  onSuccess: () => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [id, setId] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const idRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setId("");
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setError(null);
    setBusy(false);
    setTimeout(() => idRef.current?.focus(), 0);
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

  const trimmedId = id.trim();
  const canSubmit = !busy && trimmedId !== "";

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    const body: Parameters<typeof api.createUser>[0] = { id: trimmedId };
    if (firstName !== "") body.firstName = firstName;
    if (lastName !== "") body.lastName = lastName;
    if (email !== "") body.email = email;
    if (password !== "") body.password = password;
    try {
      await api.createUser(body);
      setBusy(false);
      onSuccess();
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
      data-testid="create-user-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="create-user-title">Create user</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-disabled={busy}
            aria-label="Close create user modal"
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
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="create-user-id"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  ID
                </label>
                <input
                  ref={idRef}
                  id="create-user-id"
                  data-testid="create-user-id"
                  type="text"
                  required
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  placeholder="e.g. alice"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="create-user-first-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  First name
                </label>
                <input
                  id="create-user-first-name"
                  data-testid="create-user-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="create-user-last-name"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Last name
                </label>
                <input
                  id="create-user-last-name"
                  data-testid="create-user-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="create-user-email"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Email
                </label>
                <input
                  id="create-user-email"
                  data-testid="create-user-email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="create-user-password"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Password
                </label>
                <input
                  id="create-user-password"
                  data-testid="create-user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
            </div>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="create-user-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="create-user-submit"
              disabled={!canSubmit}
            >
              {busy ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
