/**
 * Shared verbatim-error renderer.
 *
 * Per Pattern P-003: error.message is rendered raw — no friendly rewrites.
 * Per Pattern P-002: this component is the "error" state for the four-state
 * render contract; route errorComponents (Story 3.3 onwards) and screen
 * useApi.error states both render it.
 *
 * Extracted from src/screens.tsx during Story 3.3 so route errorComponents
 * (under src/routes/) can import it without taking a dependency on screens.
 */

export interface ErrorBoxProps {
  error: unknown;
  onRetry?: (() => void) | undefined;
}

export const ErrorBox = ({ error, onRetry }: ErrorBoxProps) => (
  <div className="empty" style={{ padding: 24, color: "var(--bad)" }}>
    <div className="mono" style={{ fontSize: 12, marginBottom: 8 }}>
      {String((error as { message?: string } | null)?.message || error)}
    </div>
    {onRetry && (
      <button type="button" className="btn" data-size="sm" onClick={onRetry}>
        Retry
      </button>
    )}
  </div>
);
