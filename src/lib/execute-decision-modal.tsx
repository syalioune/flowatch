// SPDX-License-Identifier: Apache-2.0

/**
 * `<ExecuteDecisionModal>` (Story 15.3).
 *
 * Introduces the project's FOURTH modal shape: the **console-shape modal**
 * (codified in CLAUDE.md as part of this story). The modal stays OPEN
 * after a successful execution; the result panel renders inline BELOW the
 * input editor. The operator iterates — edit inputs, re-submit, observe —
 * without re-opening the modal.
 *
 * Per-key input cache: a module-scoped Map preserves the operator's last
 * input across modal opens within the same tab session (NOT persisted to
 * localStorage — security footgun for stale credentials in input variables).
 *
 * Reuses the `.modal-back` / `.modal` palette from the BPMN-side modals.
 */

import React from "react";
import {
  api,
  type FlowableDecision,
  type FlowableDecisionExecutionInputVariable,
  type FlowableDecisionExecutionMatchedRule,
  type FlowableDecisionResult,
} from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

// Module-scoped per-key cache (per AC-6). Preserves the operator's last
// input across modal opens within the same tab; discarded on page reload.
// Justification: localStorage would persist potentially-sensitive input
// values across sessions; in-memory is sufficient for the iterate-quickly
// use case.
const _inputCache = new Map<string, string>();

// Test-only helper to clear the cache between unit tests.
export const __clearInputCache = (): void => {
  _inputCache.clear();
};

interface ParsedInput {
  ok: true;
  value: Record<string, unknown>;
}

interface ParseError {
  ok: false;
  message: string;
}

// Exported for unit testing.
export const parseDecisionInput = (raw: string): ParsedInput | ParseError => {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return {
      ok: false,
      message: `Invalid JSON: ${(err as Error)?.message ?? String(err)}`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      message: "Input variables must be a JSON object (received array / string / number / null).",
    };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
};

// Convert a parsed JSON object into the Flowable input-variable array shape.
export const buildInputVariables = (
  parsed: Record<string, unknown>,
): FlowableDecisionExecutionInputVariable[] =>
  Object.entries(parsed).map(([name, value]) => ({
    name,
    type:
      typeof value === "number"
        ? Number.isInteger(value)
          ? "long"
          : "double"
        : typeof value === "boolean"
          ? "boolean"
          : typeof value === "string"
            ? "string"
            : "json",
    value,
  }));

interface OutputVariable {
  name: string;
  type: string;
  value: unknown;
}

// Extract output variables from EITHER `resultVariableMap` (Flowable 7.x)
// or `resultVariables` (legacy shape) — whichever the engine populates.
export const extractOutputVariables = (result: FlowableDecisionResult): OutputVariable[] => {
  const source = result.resultVariableMap ?? result.resultVariables ?? {};
  return Object.entries(source).map(([name, value]) => ({
    name,
    type:
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value === "number"
            ? "number"
            : typeof value === "boolean"
              ? "boolean"
              : typeof value === "string"
                ? "string"
                : "object",
    value,
  }));
};

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return `[unserializable: ${(e as Error).message}]`;
    }
  }
  if (typeof value === "string") return `"${value}"`;
  return String(value);
};

export interface ExecuteDecisionModalProps {
  /** When null, the modal is closed. Pass a decision to open. */
  decision: FlowableDecision | null;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const ExecuteDecisionModal: React.FC<ExecuteDecisionModalProps> = ({
  decision,
  onClose,
  triggerRef,
}) => {
  const [input, setInput] = React.useState<string>(() =>
    decision ? (_inputCache.get(decision.key) ?? "{}") : "{}",
  );
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<FlowableDecisionResult | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  // Reset state on decision change. Restore the operator's last input
  // for this decision key from the module-scoped cache.
  React.useEffect(() => {
    if (!decision) return;
    setInput(_inputCache.get(decision.key) ?? "{}");
    setParseError(null);
    setResult(null);
    setError(null);
    setBusy(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [decision]);

  // Persist input edits into the cache for the current decision key.
  React.useEffect(() => {
    if (!decision) return;
    _inputCache.set(decision.key, input);
  }, [decision, input]);

  React.useEffect(() => {
    if (!decision || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [decision, busy, onClose, triggerRef]);

  if (!decision) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    const parsed = parseDecisionInput(input);
    if (!parsed.ok) {
      setParseError(parsed.message);
      return;
    }
    setParseError(null);
    setError(null);
    setBusy(true);
    try {
      const out = await api.executeDecision({
        decisionKey: decision.key,
        inputVariables: buildInputVariables(parsed.value),
      });
      setResult(out);
      setBusy(false);
      // Modal stays OPEN — console shape. The operator may iterate.
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setResult(null);
      setBusy(false);
    }
  };

  const reset = () => {
    setInput("{}");
    setParseError(null);
    setResult(null);
    setError(null);
  };

  const outputVars = result ? extractOutputVariables(result) : [];
  const matchedRules: FlowableDecisionExecutionMatchedRule[] = result?.matchedRules ?? [];

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target
    <div
      className="modal-back"
      data-testid="execute-decision-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click */}
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-hd">
          <h3>
            Test execute · {decision.name || decision.key}{" "}
            <span className="mute mono" style={{ fontSize: 12 }}>
              (v{decision.version})
            </span>
          </h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close test execute modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd" style={{ overflowY: "auto" }}>
          <label
            htmlFor="execute-decision-input"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Input variables (JSON)
          </label>
          <textarea
            ref={textareaRef}
            id="execute-decision-input"
            data-testid="execute-decision-input"
            placeholder='{ "creditScore": 750, "income": 80000 }'
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (parseError) setParseError(null);
            }}
            disabled={busy}
            rows={8}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
          {parseError && (
            <p
              data-testid="json-parse-error"
              style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bad)" }}
            >
              {parseError}
            </p>
          )}
          {error && (
            <div style={{ marginTop: 12 }}>
              <ErrorBox error={error} />
            </div>
          )}
          {result && (
            <div data-testid="execute-decision-result" style={{ marginTop: 20 }}>
              <div className="panel">
                <div className="panel-hd">
                  <span className="panel-title">Matched rules · {matchedRules.length}</span>
                </div>
                {matchedRules.length === 0 ? (
                  <div className="empty" style={{ padding: 20 }}>
                    No rules matched. The decision returned default outputs.
                  </div>
                ) : (
                  <ol style={{ padding: "12px 24px", margin: 0 }}>
                    {matchedRules.map((r, i) => (
                      <li
                        key={r.ruleId ?? `rule-${r.ruleIndex ?? i}`}
                        data-testid={`matched-rule-${i}`}
                      >
                        <span className="mono">{r.ruleId ?? `rule-${r.ruleIndex ?? i}`}</span>
                        {r.description && <span className="mute"> — {r.description}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panel-hd">
                  <span className="panel-title">Output variables · {outputVars.length}</span>
                </div>
                {outputVars.length === 0 ? (
                  <div className="empty" style={{ padding: 20 }}>
                    (none)
                  </div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputVars.map((v) => (
                        <tr key={v.name} data-testid={`output-variable-${v.name}`}>
                          <td className="mono">{v.name}</td>
                          <td>
                            <span className="badge" data-tone="neutral">
                              {v.type}
                            </span>
                          </td>
                          <td className="mono">{renderValue(v.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="execute-decision-reset"
            onClick={reset}
            disabled={busy}
          >
            Reset
          </button>
          <button type="button" className="btn" onClick={closeWithFocus} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="execute-decision-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Executing…" : "Execute"}
          </button>
        </div>
      </div>
    </div>
  );
};
