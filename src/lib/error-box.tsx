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

import { FlowableError } from "../api";

export interface ErrorBoxProps {
  error: unknown;
  onRetry?: (() => void) | undefined;
}

const isFlowableError = (e: unknown): e is FlowableError =>
  e instanceof FlowableError && typeof e.status === "number";

export const ErrorBox = ({ error, onRetry }: ErrorBoxProps) => {
  const message = (error as { message?: string } | null)?.message ?? String(error ?? "");
  return (
    <div className="empty" style={{ padding: 24, color: "var(--bad)" }}>
      {isFlowableError(error) && error.status > 0 && (
        <div className="mono" style={{ fontSize: 11, color: "var(--fg-mute)", marginBottom: 4 }}>
          HTTP {error.status}
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
      <span
        data-disabled="1"
        aria-disabled="true"
        title="Available once the API Inspector is wired (Story 8.2)"
        style={{
          display: "block",
          marginTop: 6,
          opacity: 0.4,
          cursor: "not-allowed",
          fontSize: 11,
          color: "var(--fg-mute)",
        }}
      >
        Open Inspector ↗
      </span>
    </div>
  );
};
