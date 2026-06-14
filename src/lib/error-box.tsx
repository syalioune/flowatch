// SPDX-License-Identifier: Apache-2.0

/**
 * Shared verbatim-error renderer.
 *
 * Per Pattern P-003: error.message is rendered raw — no friendly rewrites,
 * no whitespace collapse (white-space: pre-wrap preserves newlines from
 * stack traces and validation lists byte-for-byte).
 * Per Pattern P-002: this component is the "error" state for the four-state
 * render contract; route errorComponents (Story 3.3 onwards) and screen
 * useApi.error states both render it.
 *
 * Story 7.3 additions: when the underlying error is a FlowableError, the
 * HTTP status is surfaced above the body so operators can distinguish 404
 * from 500 from 401 at a glance (suppressed for status 0 which is the
 * fetch/CORS/abort sentinel — "HTTP 0" carries no diagnostic value). A
 * disabled "Open Inspector ↗" hint is always rendered as a forward-
 * reference to Story 8.2, which will upgrade the <span> to a wired
 * button/link.
 *
 * Extracted from src/screens.tsx during Story 3.3 so route errorComponents
 * (under src/routes/) can import it without taking a dependency on screens.
 */

import { API_LOG } from "../api";
import { errorStatus } from "./error";

export interface ErrorBoxProps {
  error: unknown;
  onRetry?: (() => void) | undefined;
}

export const ErrorBox = ({ error, onRetry }: ErrorBoxProps) => {
  const message = (error as { message?: string } | null)?.message ?? String(error ?? "");
  const status = errorStatus(error);
  // Story 32.2 (D1): use the AA-safe --bad-fg foreground (not the brighter
  // semantic --bad) — the message text inherits this color, and --bad failed
  // axe color-contrast on the lightest bg (terminal/light).
  return (
    <div className="empty" data-testid="error-box" style={{ padding: 24, color: "var(--bad-fg)" }}>
      {status > 0 && (
        <div className="mono" style={{ fontSize: 11, color: "var(--fg-mute)", marginBottom: 4 }}>
          HTTP {status}
        </div>
      )}
      <div className="mono" style={{ fontSize: 12, marginBottom: 8, whiteSpace: "pre-wrap" }}>
        {message}
      </div>
      {onRetry && (
        <button type="button" className="btn" data-size="sm" onClick={onRetry}>
          Retry
        </button>
      )}
      <button
        type="button"
        data-testid="open-inspector"
        className="inspector-link"
        title="Open API Inspector"
        onClick={() => {
          // Best-effort match: find the most recent log entry whose verbatim
          // error body matches the message we're rendering. Undefined match
          // is fine — the drawer still opens, just without scroll-to-row.
          const focusEntryId = API_LOG.find((e) => e.error === message)?.id;
          window.dispatchEvent(
            new CustomEvent("app:open-inspector", {
              detail: focusEntryId ? { focusEntryId } : undefined,
            }),
          );
        }}
      >
        Open Inspector ↗
      </button>
    </div>
  );
};
