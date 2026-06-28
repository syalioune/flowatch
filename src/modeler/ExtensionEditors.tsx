// SPDX-License-Identifier: Apache-2.0

/**
 * Story 30.1 — extensionElements editor sub-components.
 *
 * Presentational widgets for the BPMN properties panel's nested extension
 * lists (task/execution listeners, field injection, in/out mappings). Each
 * owns its own draft-input state; the committed list + add/update/remove
 * callbacks are supplied by <BpmnModeler> (which routes them through the
 * bpmn-js command stack). Extracted from BpmnModeler.tsx for the NFR-21
 * file-size gate — these are reusable field-cluster widgets, NOT the
 * element-type dispatch (that stays an inline switch in the panel).
 */

import React from "react";
import { Icon } from "../components";
import type { AnyEl } from "./event-defs";

export const TASK_LISTENER_EVENTS = ["create", "assignment", "complete", "delete"] as const;
export const EXEC_LISTENER_EVENTS = ["start", "end", "take"] as const;

const ON_TRANSACTION = ["", "before-commit", "committed", "rolled-back"] as const;
const IMPL_KINDS = ["class", "expression", "delegateExpression"] as const;

// Current impl kind (class / expression / delegateExpression) of a listener
// + its value. Listeners store the impl under exactly one of the three attrs.
const listenerKind = (l: AnyEl): (typeof IMPL_KINDS)[number] =>
  l.class != null
    ? "class"
    : l.expression != null
      ? "expression"
      : l.delegateExpression != null
        ? "delegateExpression"
        : "class";
const listenerValue = (l: AnyEl): string => {
  const v = l[listenerKind(l)];
  return v == null ? "" : String(v);
};

interface ListenerEditorProps {
  /** "Task listeners" | "Execution listeners" — operator-feel heading. */
  title: string;
  /** wire-level element type, e.g. "flowable:TaskListener". */
  wireType: string;
  events: readonly string[];
  list: AnyEl[];
  onAdd: (attrs: Record<string, unknown>) => void;
  onUpdate: (child: AnyEl, attrs: Record<string, unknown>) => void;
  onRemove: (child: AnyEl) => void;
}

export const ListenerEditor = ({
  title,
  wireType,
  events,
  list,
  onAdd,
  onUpdate,
  onRemove,
}: ListenerEditorProps) => {
  const [implKind, setImplKind] = React.useState<(typeof IMPL_KINDS)[number]>("class");
  const [implValue, setImplValue] = React.useState("");
  const [event, setEvent] = React.useState(events[0] || "");
  const [onTx, setOnTx] = React.useState("");
  const testidBase = wireType.replace("flowable:", "").toLowerCase();
  return (
    <div className="form-row" data-testid={`bpmn-listeners-${testidBase}`}>
      <label>
        {title} <span className="mono">{wireType}</span>
      </label>
      {list.map((l, i) => {
        const kind = listenerKind(l);
        return (
          <div
            className="ext-entry"
            // biome-ignore lint/suspicious/noArrayIndexKey: moddle elements have no stable id
            key={`${testidBase}:${i}`}
            data-testid={`bpmn-listener-row-${testidBase}-${i}`}
          >
            <select
              className="select"
              value={l.event || events[0] || ""}
              aria-label={`${title} ${i} event`}
              onChange={(e) => onUpdate(l, { event: e.target.value })}
            >
              {events.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={kind}
              aria-label={`${title} ${i} implementation kind`}
              onChange={(e) => {
                const next = e.target.value as (typeof IMPL_KINDS)[number];
                const v = listenerValue(l);
                onUpdate(l, {
                  class: undefined,
                  expression: undefined,
                  delegateExpression: undefined,
                  [next]: v,
                });
              }}
            >
              {IMPL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              className="input mono"
              key={`${testidBase}:${i}:val`}
              defaultValue={listenerValue(l)}
              aria-label={`${title} ${i} implementation value`}
              onBlur={(e) => onUpdate(l, { [kind]: e.target.value })}
            />
            <select
              className="select"
              value={l.onTransaction || ""}
              aria-label={`${title} ${i} onTransaction`}
              onChange={(e) => onUpdate(l, { onTransaction: e.target.value })}
            >
              {ON_TRANSACTION.map((t) => (
                <option key={t || "_none"} value={t}>
                  {t || "onTransaction: (none)"}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              data-size="sm"
              data-variant="ghost"
              aria-label={`Remove ${title} entry ${i}`}
              onClick={() => onRemove(l)}
            >
              <Icon name="x" size={12} /> Remove
            </button>
          </div>
        );
      })}
      <div className="ext-add" style={{ display: "grid", gap: 6 }}>
        <select
          className="select"
          value={event}
          aria-label={`${title} event`}
          onChange={(e) => setEvent(e.target.value)}
        >
          {events.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={implKind}
          aria-label={`${title} implementation kind`}
          onChange={(e) => setImplKind(e.target.value as (typeof IMPL_KINDS)[number])}
        >
          {IMPL_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          className="input mono"
          value={implValue}
          placeholder="com.acme.MyListener"
          aria-label={`${title} implementation value`}
          onChange={(e) => setImplValue(e.target.value)}
        />
        <select
          className="select"
          value={onTx}
          aria-label={`${title} onTransaction`}
          onChange={(e) => setOnTx(e.target.value)}
        >
          {ON_TRANSACTION.map((t) => (
            <option key={t || "_none"} value={t}>
              {t || "onTransaction: (none)"}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid={`bpmn-listener-add-${testidBase}`}
          disabled={!implValue.trim()}
          onClick={() => {
            onAdd({ event, [implKind]: implValue.trim(), onTransaction: onTx });
            setImplValue("");
            setOnTx("");
          }}
        >
          <Icon name="plus" size={12} /> Add listener
        </button>
      </div>
    </div>
  );
};

const fieldKind = (f: AnyEl): "stringValue" | "expression" =>
  f.expression != null ? "expression" : "stringValue";
const fieldValue = (f: AnyEl): string => {
  const v = f[fieldKind(f)];
  return v == null ? "" : String(v);
};

interface FieldInjectionEditorProps {
  list: AnyEl[];
  onAdd: (attrs: Record<string, unknown>) => void;
  onUpdate: (child: AnyEl, attrs: Record<string, unknown>) => void;
  onRemove: (child: AnyEl) => void;
}

export const FieldInjectionEditor = ({
  list,
  onAdd,
  onUpdate,
  onRemove,
}: FieldInjectionEditorProps) => {
  const [name, setName] = React.useState("");
  const [valKind, setValKind] = React.useState<"stringValue" | "expression">("stringValue");
  const [value, setValue] = React.useState("");
  return (
    <div className="form-row" data-testid="bpmn-field-injection">
      <label>
        Field injection <span className="mono">flowable:field</span>
      </label>
      {list.map((f, i) => {
        const kind = fieldKind(f);
        return (
          <div
            className="ext-entry"
            // biome-ignore lint/suspicious/noArrayIndexKey: moddle elements have no stable id
            key={`field:${i}`}
            data-testid={`bpmn-field-row-${i}`}
          >
            <input
              className="input mono"
              key={`field:${i}:name`}
              defaultValue={f.name || ""}
              aria-label={`Field ${i} name`}
              onBlur={(e) => onUpdate(f, { name: e.target.value })}
            />
            <select
              className="select"
              value={kind}
              aria-label={`Field ${i} value kind`}
              onChange={(e) => {
                const next = e.target.value as "stringValue" | "expression";
                const v = fieldValue(f);
                onUpdate(f, { stringValue: undefined, expression: undefined, [next]: v });
              }}
            >
              <option value="stringValue">string</option>
              <option value="expression">expression</option>
            </select>
            <input
              className="input mono"
              key={`field:${i}:val`}
              defaultValue={fieldValue(f)}
              aria-label={`Field ${i} value`}
              onBlur={(e) => onUpdate(f, { [kind]: e.target.value })}
            />
            <button
              type="button"
              className="btn"
              data-size="sm"
              data-variant="ghost"
              aria-label={`Remove field injection ${i}`}
              onClick={() => onRemove(f)}
            >
              <Icon name="x" size={12} /> Remove
            </button>
          </div>
        );
      })}
      <div className="ext-add" style={{ display: "grid", gap: 6 }}>
        <input
          className="input mono"
          value={name}
          placeholder="fieldName"
          aria-label="Field name"
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="select"
          value={valKind}
          aria-label="Field value kind"
          onChange={(e) => setValKind(e.target.value as "stringValue" | "expression")}
        >
          <option value="stringValue">string</option>
          <option value="expression">expression</option>
        </select>
        <input
          className="input mono"
          value={value}
          placeholder="value"
          aria-label="Field value"
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-field-add"
          disabled={!name.trim() || !value.trim()}
          onClick={() => {
            onAdd({ name: name.trim(), [valKind]: value.trim() });
            setName("");
            setValue("");
          }}
        >
          <Icon name="plus" size={12} /> Add field
        </button>
      </div>
    </div>
  );
};

interface InOutEditorProps {
  direction: "in" | "out";
  wireType: string;
  list: AnyEl[];
  onAdd: (attrs: Record<string, unknown>) => void;
  onUpdate: (child: AnyEl, attrs: Record<string, unknown>) => void;
  onRemove: (child: AnyEl) => void;
}

export const InOutEditor = ({
  direction,
  wireType,
  list,
  onAdd,
  onUpdate,
  onRemove,
}: InOutEditorProps) => {
  const [source, setSource] = React.useState("");
  const [target, setTarget] = React.useState("");
  return (
    <div className="form-row" data-testid={`bpmn-inout-${direction}`}>
      <label>
        {direction === "in" ? "In mappings" : "Out mappings"}{" "}
        <span className="mono">{wireType}</span>
      </label>
      {list.map((mp, i) => (
        <div
          className="ext-entry"
          // biome-ignore lint/suspicious/noArrayIndexKey: moddle elements have no stable id
          key={`${direction}:${i}`}
          data-testid={`bpmn-inout-row-${direction}-${i}`}
        >
          <input
            className="input mono"
            key={`${direction}:${i}:src`}
            defaultValue={mp.source || ""}
            placeholder="source"
            aria-label={`${direction} ${i} source`}
            onBlur={(e) => onUpdate(mp, { source: e.target.value })}
          />
          <input
            className="input mono"
            key={`${direction}:${i}:tgt`}
            defaultValue={mp.target || ""}
            placeholder="target"
            aria-label={`${direction} ${i} target`}
            onBlur={(e) => onUpdate(mp, { target: e.target.value })}
          />
          <button
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            aria-label={`Remove ${direction} mapping ${i}`}
            onClick={() => onRemove(mp)}
          >
            <Icon name="x" size={12} /> Remove
          </button>
        </div>
      ))}
      <div className="ext-add" style={{ display: "grid", gap: 6 }}>
        <input
          className="input mono"
          value={source}
          placeholder="source"
          aria-label={`${direction} source`}
          onChange={(e) => setSource(e.target.value)}
        />
        <input
          className="input mono"
          value={target}
          placeholder="target"
          aria-label={`${direction} target`}
          onChange={(e) => setTarget(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid={`bpmn-inout-add-${direction}`}
          disabled={!source.trim() || !target.trim()}
          onClick={() => {
            onAdd({ source: source.trim(), target: target.trim() });
            setSource("");
            setTarget("");
          }}
        >
          <Icon name="plus" size={12} /> Add
        </button>
      </div>
    </div>
  );
};
