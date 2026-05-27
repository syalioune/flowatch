// SPDX-License-Identifier: Apache-2.0

/**
 * `<ExecuteDecisionModal>` (Story 15.3, evolved).
 *
 * Console-shape modal: stays OPEN after a successful execution, result
 * panel renders inline BELOW the input editor; the operator iterates —
 * edit inputs, re-submit, observe — without re-opening the modal.
 *
 * Two input modes:
 *   - FORM mode (default when the DMN XML parses successfully and every
 *     decision-table input column is a simple identifier): one widget per
 *     input column, type-matched to the `<inputExpression typeRef="…">`,
 *     JSON payload constructed at submit time.
 *   - JSON mode (fallback): the freeform JSON textarea we shipped first.
 *     Activates when the XML can't be fetched, the parser errors, the
 *     decision has no inputs, OR any input column uses a complex JUEL
 *     expression we can't bind to a single form field. (Flowable's DMN
 *     engine evaluates `<inputExpression><text>` as JUEL — DMN S-FEEL is
 *     not supported.)
 *
 * Per-key cache: a module-scoped Map preserves the operator's last input
 * across modal opens within the same tab session — separate slots for
 * JSON and form modes (operators can iterate in either). NOT persisted to
 * localStorage (security footgun: stale credentials in input variables).
 */

import React from "react";
import {
  api,
  type FlowableDecision,
  type FlowableDecisionExecutionInputVariable,
  type FlowableDecisionResult,
} from "../api";
import { Icon } from "../components";
import { type DmnInputColumn, parseDmnDecision } from "./dmn-parser";
import { ErrorBox } from "./error-box";

// Module-scoped per-key caches. Separate slots so a decision that briefly
// renders in JSON mode (e.g. while XML loads) doesn't clobber form values.
const _jsonCache = new Map<string, string>();
const _formCache = new Map<string, Record<string, string>>();

// Test-only helper to clear caches between unit tests.
export const __clearInputCache = (): void => {
  _jsonCache.clear();
  _formCache.clear();
};

interface ParsedInput {
  ok: true;
  value: Record<string, unknown>;
}

interface ParseError {
  ok: false;
  message: string;
}

// JSON-mode parser — exported for unit testing.
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

// FORM-mode coercion: turn the string form values into typed Flowable
// input variables, honouring the parser-reported DMN `typeRef`. Numeric
// types that come back empty are skipped (operator left the field blank
// → no variable sent → engine treats as undefined). Exported for tests.
export interface FormCoercionError {
  name: string;
  message: string;
}
export interface FormCoercionResult {
  variables: FlowableDecisionExecutionInputVariable[];
  errors: FormCoercionError[];
}
export const buildFormInputVariables = (
  inputs: DmnInputColumn[],
  values: Record<string, string>,
): FormCoercionResult => {
  const variables: FlowableDecisionExecutionInputVariable[] = [];
  const errors: FormCoercionError[] = [];
  for (const input of inputs) {
    if (input.isComplex) continue;
    const raw = values[input.name];
    if (raw === undefined || raw === "") continue;
    const t = input.type.toLowerCase();
    if (t === "boolean") {
      // Checkboxes write "true" / "false" strings.
      variables.push({ name: input.name, type: "boolean", value: raw === "true" });
      continue;
    }
    if (t === "long" || t === "integer") {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        errors.push({ name: input.name, message: "Expected an integer." });
        continue;
      }
      variables.push({ name: input.name, type: "long", value: n });
      continue;
    }
    if (t === "double" || t === "decimal") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors.push({ name: input.name, message: "Expected a number." });
        continue;
      }
      variables.push({ name: input.name, type: "double", value: n });
      continue;
    }
    if (t === "number") {
      // DMN's generic `number` — pick long vs double based on the value.
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors.push({ name: input.name, message: "Expected a number." });
        continue;
      }
      variables.push({
        name: input.name,
        type: Number.isInteger(n) ? "long" : "double",
        value: n,
      });
      continue;
    }
    if (t === "date") {
      // HTML5 date input emits `YYYY-MM-DD`. Flowable accepts an ISO-8601
      // date string for the `date` type; pass through verbatim.
      variables.push({ name: input.name, type: "date", value: raw });
      continue;
    }
    // string / unknown — pass through as string.
    variables.push({ name: input.name, type: "string", value: raw });
  }
  return { variables, errors };
};

interface OutputVariable {
  name: string;
  type: string;
  value: unknown;
}

// Flatten the engine's `resultVariables: Array<Array<{name,type,value}>>`
// shape. The OUTER array is one row per result (length 1 for UNIQUE/FIRST,
// >1 for COLLECT/RULE_ORDER); we surface every output variable across all
// rows in submission order. The engine emits `type` directly — no JS-side
// inference needed.
export const extractOutputVariables = (result: FlowableDecisionResult): OutputVariable[] => {
  const rows = result.resultVariables ?? [];
  return rows.flat().map((v) => ({ name: v.name, type: v.type, value: v.value }));
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

type Mode = "form" | "json";

export const ExecuteDecisionModal: React.FC<ExecuteDecisionModalProps> = ({
  decision,
  onClose,
  triggerRef,
}) => {
  const [jsonInput, setJsonInput] = React.useState<string>(() =>
    decision ? (_jsonCache.get(decision.key) ?? "{}") : "{}",
  );
  const [formValues, setFormValues] = React.useState<Record<string, string>>(() =>
    decision ? (_formCache.get(decision.key) ?? {}) : {},
  );
  const [inputs, setInputs] = React.useState<DmnInputColumn[]>([]);
  const [mode, setMode] = React.useState<Mode>("json");
  // While the XML is loading we render a small "Loading inputs…" hint
  // above whichever input surface is current.
  const [xmlLoading, setXmlLoading] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [formErrors, setFormErrors] = React.useState<FormCoercionError[]>([]);
  const [result, setResult] = React.useState<FlowableDecisionResult | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const firstFieldRef = React.useRef<HTMLElement | null>(null);

  // Reset state on decision change AND fetch+parse the XML so we can pick
  // form vs JSON mode. Falls back to JSON on any failure path.
  React.useEffect(() => {
    if (!decision) return;
    setJsonInput(_jsonCache.get(decision.key) ?? "{}");
    setFormValues(_formCache.get(decision.key) ?? {});
    setInputs([]);
    setMode("json");
    setParseError(null);
    setFormErrors([]);
    setResult(null);
    setError(null);
    setBusy(false);
    setXmlLoading(true);
    let cancelled = false;
    api
      .getDmnDecisionResource(decision.id)
      .then((xml) => {
        if (cancelled) return;
        const parsed = parseDmnDecision(xml, decision.key);
        if (parsed.ok && parsed.inputs.length > 0 && parsed.inputs.every((i) => !i.isComplex)) {
          setInputs(parsed.inputs);
          setMode("form");
        }
      })
      .catch(() => {
        // XML fetch failure — silently stay in JSON mode. The operator
        // still has a working textarea.
      })
      .finally(() => {
        if (!cancelled) setXmlLoading(false);
        setTimeout(() => firstFieldRef.current?.focus(), 0);
      });
    return () => {
      cancelled = true;
    };
  }, [decision]);

  // Persist edits to whichever cache matches the current mode.
  React.useEffect(() => {
    if (!decision) return;
    if (mode === "json") _jsonCache.set(decision.key, jsonInput);
    else _formCache.set(decision.key, formValues);
  }, [decision, mode, jsonInput, formValues]);

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

  const submitJson = async (): Promise<void> => {
    const parsed = parseDecisionInput(jsonInput);
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
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const submitForm = async (): Promise<void> => {
    const coerced = buildFormInputVariables(inputs, formValues);
    if (coerced.errors.length > 0) {
      setFormErrors(coerced.errors);
      return;
    }
    setFormErrors([]);
    setError(null);
    setBusy(true);
    try {
      const out = await api.executeDecision({
        decisionKey: decision.key,
        inputVariables: coerced.variables,
      });
      setResult(out);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const submit = mode === "form" ? submitForm : submitJson;

  const reset = () => {
    if (mode === "form") {
      setFormValues({});
      setFormErrors([]);
    } else {
      setJsonInput("{}");
      setParseError(null);
    }
    setResult(null);
    setError(null);
  };

  const setFormField = (name: string, value: string): void => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    if (formErrors.length > 0) setFormErrors([]);
  };

  const errorByName = new Map<string, string>(formErrors.map((e) => [e.name, e.message]));

  const outputVars = result ? extractOutputVariables(result) : [];

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="execute-decision-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-hd">
          <h3 id="execute-decision-title">
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
          {xmlLoading && (
            <div
              data-testid="execute-decision-xml-loading"
              className="mute"
              style={{ fontSize: 12, marginBottom: 8 }}
            >
              Loading decision inputs…
            </div>
          )}

          {mode === "form" ? (
            <div data-testid="execute-decision-form">
              <p className="mute" style={{ margin: "0 0 12px", fontSize: 12 }}>
                Inferred from the decision table. Empty fields are omitted from the request.
              </p>
              <table className="tbl" style={{ marginBottom: 8 }}>
                <tbody>
                  {inputs.map((input, idx) => {
                    const id = `execute-decision-field-${input.name}`;
                    const value = formValues[input.name] ?? "";
                    const fieldErr = errorByName.get(input.name);
                    const t = input.type.toLowerCase();
                    const numeric =
                      t === "long" ||
                      t === "integer" ||
                      t === "double" ||
                      t === "decimal" ||
                      t === "number";
                    const isBool = t === "boolean";
                    const isDate = t === "date";
                    return (
                      <tr key={input.name} data-testid={`execute-decision-row-${input.name}`}>
                        <td className="mute" style={{ width: 160, verticalAlign: "top" }}>
                          <label htmlFor={id} style={{ fontSize: 12 }}>
                            {input.label || input.name}
                          </label>
                          <div className="mono mute" style={{ fontSize: 10, marginTop: 2 }}>
                            {input.name}
                          </div>
                        </td>
                        <td style={{ verticalAlign: "top" }}>
                          {isBool ? (
                            <select
                              id={id}
                              ref={
                                idx === 0
                                  ? (firstFieldRef as React.Ref<HTMLSelectElement>)
                                  : undefined
                              }
                              data-testid={`execute-decision-input-${input.name}`}
                              value={value}
                              onChange={(e) => setFormField(input.name, e.target.value)}
                              disabled={busy}
                              style={{
                                width: "100%",
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                              }}
                            >
                              <option value="">—</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              id={id}
                              ref={
                                idx === 0
                                  ? (firstFieldRef as React.Ref<HTMLInputElement>)
                                  : undefined
                              }
                              data-testid={`execute-decision-input-${input.name}`}
                              type={isDate ? "date" : numeric ? "number" : "text"}
                              step={numeric ? "any" : undefined}
                              value={value}
                              onChange={(e) => setFormField(input.name, e.target.value)}
                              disabled={busy}
                              style={{
                                width: "100%",
                                fontFamily: "var(--font-mono)",
                                fontSize: 12,
                              }}
                            />
                          )}
                          <div className="mono mute" style={{ fontSize: 10, marginTop: 2 }}>
                            type: {input.type}
                          </div>
                          {fieldErr && (
                            <div
                              data-testid={`execute-decision-field-error-${input.name}`}
                              style={{ marginTop: 4, fontSize: 11, color: "var(--bad)" }}
                            >
                              {fieldErr}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <label
                htmlFor="execute-decision-input"
                style={{ display: "block", marginBottom: 4, fontSize: 12 }}
              >
                Input variables (JSON)
              </label>
              <textarea
                ref={firstFieldRef as React.Ref<HTMLTextAreaElement>}
                id="execute-decision-input"
                data-testid="execute-decision-input"
                placeholder='{ "creditScore": 750, "income": 80000 }'
                value={jsonInput}
                onChange={(e) => {
                  setJsonInput(e.target.value);
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
            </>
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
                  <span className="panel-title">Output variables · {outputVars.length}</span>
                </div>
                {outputVars.length === 0 ? (
                  <div className="empty" style={{ padding: 20 }}>
                    No output variables. The decision did not match any rule, or the matched rule
                    produced no outputs.
                  </div>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Type</th>
                        <th scope="col">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputVars.map((v, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: COLLECT hit-policy can emit the same `name` across rows; composite name+index is the minimum unique key
                        <tr key={`${v.name}-${i}`} data-testid={`output-variable-${v.name}`}>
                          <td className="mono">{v.name}</td>
                          <td>
                            <span className="badge" data-tone="neutral">
                              <span className="sr-only">Type: </span>
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
