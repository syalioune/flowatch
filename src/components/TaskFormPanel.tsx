// SPDX-License-Identifier: Apache-2.0

/**
 * Task Form panel (Story 11.3).
 *
 * Second panel-as-sibling-component consumer after 10.4's
 * InstanceVariablesPanel. The panel owns its own `useApi(api.getTaskForm)`
 * fetch, its four-state contract, and its submit handler. The parent
 * `<TaskDetail>` mounts it as a black box and only learns about the form's
 * loaded state via the parent-level form fetch used to gate the legacy
 * Complete button (per Story 11.3 AC-9).
 *
 * Field-type rendering follows the AC-2 table (string / long / double /
 * enum / date / boolean) with a generic text-input fallback for unknown
 * engine-extension types. The Submit button calls `api.submitTaskForm`,
 * which atomically completes the task — same retryable-creation shape as
 * 10.2's StartInstanceModal (on failure: in-form ErrorBox + values
 * preserved; no navigation away).
 *
 * On success: dispatches a `nav:invalidate-counts` window event (second
 * consumer of the event from Story 11.2) so the Sidebar Tasks badge
 * refreshes; then calls `onSubmitted()` (the parent navigates back to
 * /tasks).
 */

import { Form } from "@bpmn-io/form-js-viewer";
import React from "react";
import {
  api,
  FlowableError,
  type FlowableFormProperty,
  type FlowableTask,
  type FlowableTaskForm,
} from "../api";
import { Icon } from "../components";
import { ErrorBox } from "../lib/error-box";
import { NAV_INVALIDATE_COUNTS } from "../lib/nav-events";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

// Story 29.1 (FR-23): discriminator over the `getTaskForm` payload. A modern
// `@bpmn-io/form-js` definition carries a `components` array (the form-js
// schema); the legacy Flowable BPMN form (Story 11.3) carries a
// `formProperties` array; neither means "no form attached". Exported for unit
// testing (mirrors the `initialFormValues` / `validateFormValues` convention).
// `components` is checked first so a form-js payload always routes to the
// modern renderer even if the engine were to send both fields.
//
// LIVE-ENGINE REALITY (probed against flowable-rest:7.2.0): a task with NO
// form returns `{ formKey: null, formProperties: [] }` — a PRESENT-but-EMPTY
// array. So a NON-EMPTY length is required for both shapes; an empty array is
// "none". This preserves Story 11.3's parent gate semantics (which required
// `formProperties.length > 0`) — without the length check the no-form Complete
// button would be wrongly hidden on every task (golden-path regression).
export type TaskFormKind = "form-js" | "legacy" | "none";
export const classifyTaskForm = (payload: FlowableTaskForm | null | undefined): TaskFormKind => {
  if (payload && Array.isArray(payload.components) && payload.components.length > 0)
    return "form-js";
  if (payload && Array.isArray(payload.formProperties) && payload.formProperties.length > 0) {
    return "legacy";
  }
  return "none";
};

// Story 29.1: map a form-js submit `data` object (field-key → value) to the
// SAME `{ id, value }` envelope the legacy `buildSubmitProperties` produces, so
// both branches submit wire-identically via `api.submitTaskForm`. Values
// stringify like the legacy serializer (booleans → "true"/"false", numbers →
// their JS string form). Exported for unit testing.
export const mapFormJsData = (
  data: Record<string, unknown>,
): Array<{ id: string; value: string }> =>
  Object.entries(data).map(([id, value]) => ({ id, value: String(value) }));

// Local event-payload interface (Pattern P-006): form-js doesn't publish a
// React-typed `submit` payload, so we name the fields actually observed —
// mirroring `SelectionChangedEvent` in BpmnModeler.tsx. `form.submit()` emits
// this synchronously (see @bpmn-io/form-js-viewer Form#submit).
interface FormJsSubmitEvent {
  data: Record<string, unknown>;
  errors: Record<string, unknown>;
}

// Differentiate "no form attached" (engine 404) from real engine failures
// (e.g. 400 "unknown type 'custom-widget'" — a parse error on a BPMN form
// definition that references an unrecognised property type). 404 → null
// (the panel renders the empty state); everything else propagates so the
// operator sees the verbatim engine message in an ErrorBox.
const fetchTaskForm = async (taskId: string): Promise<FlowableTaskForm | null> => {
  try {
    return await api.getTaskForm(taskId);
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

interface Props {
  taskId: string;
  task: FlowableTask;
  onSubmitted: () => void;
}

type FieldValue = string | boolean;
type Values = Record<string, FieldValue>;
type FieldErrors = Record<string, string>;

// Exported for unit testing. Builds the initial controlled-state map from
// the loaded form. Booleans coerce `"true"` → `true`; everything else falls
// through as the engine's string value (or `""` if absent).
export const initialFormValues = (props: FlowableFormProperty[] | undefined): Values =>
  Object.fromEntries(
    (props ?? []).map((f) => [f.id, f.type === "boolean" ? f.value === "true" : (f.value ?? "")]),
  );

// Exported for unit testing. Pure validation — returns a Record of errors
// keyed by field id; empty object means "valid".
export const validateFormValues = (
  props: FlowableFormProperty[] | undefined,
  values: Values,
): FieldErrors => {
  const errors: FieldErrors = {};
  for (const f of props ?? []) {
    const v = values[f.id];
    // Required-field check: undefined / "" / null fails. Boolean false is
    // valid (the operator made a choice).
    if (f.required) {
      const empty = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
      if (empty) {
        errors[f.id] = "This field is required.";
        continue;
      }
    }
    // Numeric-coercion check: long / double must parse to a finite number
    // when non-empty.
    if ((f.type === "long" || f.type === "double") && typeof v === "string" && v.trim() !== "") {
      if (!Number.isFinite(Number(v))) {
        errors[f.id] = `Must be a valid ${f.type === "long" ? "integer" : "number"}.`;
      }
    }
  }
  return errors;
};

// Exported for unit testing. Serializes the controlled-state map to the
// `{ properties: [{ id, value }] }` envelope Flowable expects on the wire.
// Booleans round-trip as "true" / "false"; numbers stay as their raw string
// form (the user-typed text, not the coerced Number).
export const buildSubmitProperties = (values: Values): Array<{ id: string; value: string }> =>
  Object.entries(values).map(([id, value]) => ({
    id,
    value: typeof value === "boolean" ? String(value) : value,
  }));

// Story 29.1: form-js render branch (Pattern P-006 vanilla wrap). Instantiates
// the vanilla `Form` class in a useEffect on a ref'd <div>, loads the schema
// via `importSchema`, and bridges its submit to the SAME `api.submitTaskForm`
// wire path the legacy branch uses. Native form-js styling is overridden by
// `data-look` tokens via `.form-js-host` hooks in components.css.
function FormJsForm({
  taskId,
  task,
  schema,
  onSubmitted,
}: {
  taskId: string;
  task: FlowableTask;
  schema: FlowableTaskForm;
  onSubmitted: () => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<Form | null>(null);
  const [ready, setReady] = React.useState(false);
  const [importError, setImportError] = React.useState<Error | null>(null);
  const [submitError, setSubmitError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);

  // The submit handler closes over taskId/onSubmitted; keep the latest in a ref
  // so the form-js event subscription (registered once at mount) always calls
  // through to current props without re-subscribing.
  const handleSubmitRef = React.useRef<(e: FormJsSubmitEvent) => void>(() => {});
  handleSubmitRef.current = (e: FormJsSubmitEvent) => {
    // form-js surfaces client-side validation errors natively; block submit.
    if (e.errors && Object.keys(e.errors).length > 0) return;
    setSubmitError(null);
    setBusy(true);
    void (async () => {
      try {
        const properties = mapFormJsData(e.data ?? {});
        await api.submitTaskForm(taskId, { properties });
        window.dispatchEvent(new CustomEvent(NAV_INVALIDATE_COUNTS));
        onSubmitted();
      } catch (err) {
        setSubmitError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setBusy(false);
      }
    })();
  };

  // Re-mount the vanilla form only when the loaded schema changes; the submit
  // handler is read through `handleSubmitRef` so it never needs to be a dep.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let form: Form;
    try {
      form = new Form({ container: el });
    } catch (e) {
      setImportError(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    formRef.current = form;
    const onSubmit = (e: FormJsSubmitEvent) => handleSubmitRef.current(e);
    form.on("submit", onSubmit);
    // The Flowable form-js payload IS the form-js schema (carries components +
    // type + schemaVersion). importSchema returns a promise — a malformed
    // schema rejects → ErrorBox (AC-3), never a blank panel.
    form
      .importSchema(schema as Parameters<Form["importSchema"]>[0])
      .then(() => setReady(true))
      .catch((e: unknown) => setImportError(e instanceof Error ? e : new Error(String(e))));
    return () => {
      try {
        form.off("submit", onSubmit);
        form.destroy();
      } catch {}
      formRef.current = null;
    };
  }, [schema]);

  const triggerSubmit = () => {
    const form = formRef.current;
    if (!form) return;
    try {
      // Emits the "submit" event handled above (validation runs first).
      form.submit();
    } catch (e) {
      setSubmitError(e instanceof Error ? e : new Error(String(e)));
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="mono text-xs mute" style={{ marginBottom: 8 }}>
        formKey: {schema.formKey || "—"} · form-js
      </div>
      {importError && (
        <div data-testid="task-form-js-import-error" style={{ marginBottom: 12 }}>
          <ErrorBox error={importError} />
        </div>
      )}
      <div className="form-js-host" data-testid="task-form-js-viewer" ref={containerRef} />
      {submitError && (
        <div data-testid="task-form-error-box" style={{ marginTop: 12 }}>
          <ErrorBox error={submitError} />
        </div>
      )}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn"
          data-variant="primary"
          data-testid="task-form-js-submit"
          disabled={busy || !ready || !!importError}
          onClick={triggerSubmit}
        >
          {busy ? "Submitting…" : `Submit and complete${task.name ? `: ${task.name}` : ""}`}
        </button>
      </div>
    </div>
  );
}

export function TaskFormPanel({ taskId, task, onSubmitted }: Props) {
  const form = useApi<FlowableTaskForm | null>(() => fetchTaskForm(taskId), [taskId]);
  const kind = classifyTaskForm(form.data);
  const formProperties = form.data?.formProperties;
  const [values, setValues] = React.useState<Values>(() => initialFormValues(formProperties));
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [submitError, setSubmitError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);

  // AC-3: reset controlled state when the loaded form changes (taskId
  // navigation or refresh).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset keyed on the loaded form payload only
  React.useEffect(() => {
    setValues(initialFormValues(formProperties));
    setFieldErrors({});
    setSubmitError(null);
  }, [taskId, form.data?.formKey, formProperties]);

  const setFieldValue = (id: string, next: FieldValue) => setValues((v) => ({ ...v, [id]: next }));

  const onSubmit = async () => {
    if (!formProperties || formProperties.length === 0) return;
    const errors = validateFormValues(formProperties, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const properties = buildSubmitProperties(values);
      await api.submitTaskForm(taskId, { properties });
      // Best-effort: badge invalidation dispatch races with onSubmitted's
      // navigation. Both end up consistent.
      window.dispatchEvent(new CustomEvent(NAV_INVALIDATE_COUNTS));
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  };

  const renderField = (f: FlowableFormProperty) => {
    const v = values[f.id];
    const fieldError = fieldErrors[f.id];
    const labelText = f.name || f.id;
    const isBoolean = f.type === "boolean";
    return (
      <div className="form-row" key={f.id} data-testid={`task-form-field-${f.id}`}>
        {!isBoolean && (
          <label htmlFor={`f-${f.id}`}>
            {labelText}
            {f.required && <span className="req">*</span>}
            <span className="mono">{f.type}</span>
          </label>
        )}
        {f.type === "string" && (
          <input
            id={`f-${f.id}`}
            type="text"
            className="input"
            value={typeof v === "string" ? v : ""}
            onChange={(e) => setFieldValue(f.id, e.target.value)}
          />
        )}
        {f.type === "long" && (
          <input
            id={`f-${f.id}`}
            type="number"
            step="1"
            className="input"
            value={typeof v === "string" ? v : ""}
            onChange={(e) => setFieldValue(f.id, e.target.value)}
          />
        )}
        {f.type === "double" && (
          <input
            id={`f-${f.id}`}
            type="number"
            step="any"
            className="input"
            value={typeof v === "string" ? v : ""}
            onChange={(e) => setFieldValue(f.id, e.target.value)}
          />
        )}
        {f.type === "date" && (
          <input
            id={`f-${f.id}`}
            type="date"
            className="input"
            value={typeof v === "string" ? v : ""}
            onChange={(e) => setFieldValue(f.id, e.target.value)}
          />
        )}
        {f.type === "enum" && Array.isArray(f.enumValues) && f.enumValues.length > 0 && (
          <div className="seg-row">
            {f.enumValues.map((opt) => {
              const key = typeof opt === "string" ? opt : opt.id || opt.name || "";
              const lbl = typeof opt === "string" ? opt : opt.name || opt.id || "";
              return (
                <button
                  type="button"
                  key={key}
                  className="seg-btn"
                  data-on={v === key ? "1" : "0"}
                  onClick={() => setFieldValue(f.id, key)}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        )}
        {f.type === "enum" && (!Array.isArray(f.enumValues) || f.enumValues.length === 0) && (
          <span className="mute" style={{ fontSize: 11.5 }}>
            No options provided by the engine.
          </span>
        )}
        {isBoolean && (
          <label>
            <input
              id={`f-${f.id}`}
              type="checkbox"
              checked={v === true}
              onChange={(e) => setFieldValue(f.id, e.target.checked)}
            />{" "}
            {labelText}
            {f.required && <span className="req">*</span>}
            <span className="mono" style={{ marginLeft: 6 }}>
              {f.type}
            </span>
          </label>
        )}
        {/* Fallback for unknown engine-extension types. */}
        {f.type !== "string" &&
          f.type !== "long" &&
          f.type !== "double" &&
          f.type !== "date" &&
          f.type !== "enum" &&
          f.type !== "boolean" && (
            <input
              id={`f-${f.id}`}
              type="text"
              className="input"
              value={typeof v === "string" ? v : ""}
              onChange={(e) => setFieldValue(f.id, e.target.value)}
            />
          )}
        {fieldError && (
          <span
            className="form-field-error"
            data-testid={`task-form-field-error-${f.id}`}
            style={{ color: "var(--bad)", fontSize: 11.5 }}
          >
            {fieldError}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="panel" data-testid="task-form-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Form</span>
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /form/form-data?taskId={taskId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="task-form-refresh"
          onClick={form.reload}
          disabled={form.loading}
          aria-label="Refresh form"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {form.loading && <TableSkeleton columns={2} rows={3} />}
        {form.error && <ErrorBox error={form.error} onRetry={form.reload} />}
        {!form.loading && !form.error && kind === "none" && (
          <div className="mute" style={{ padding: "8px 0" }}>
            No form attached to this task.
          </div>
        )}
        {/* Story 29.1: form-js branch — modern @bpmn-io/form-js render. */}
        {!form.loading && !form.error && kind === "form-js" && form.data && (
          <FormJsForm taskId={taskId} task={task} schema={form.data} onSubmitted={onSubmitted} />
        )}
        {/* Story 11.3 legacy branch — kept verbatim as the FR-23 fallback. */}
        {!form.loading && !form.error && kind === "legacy" && form.data && (
          <div style={{ maxWidth: 560 }}>
            <div className="mono text-xs mute" style={{ marginBottom: 8 }}>
              formKey: {form.data.formKey || "—"}
            </div>
            {(formProperties ?? []).map(renderField)}
            {submitError && (
              <div data-testid="task-form-error-box" style={{ marginTop: 12 }}>
                <ErrorBox error={submitError} />
              </div>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn"
                data-variant="primary"
                data-testid="task-form-submit"
                disabled={busy || !formProperties || formProperties.length === 0}
                onClick={() => void onSubmit()}
              >
                {busy ? "Submitting…" : `Submit and complete${task.name ? `: ${task.name}` : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
