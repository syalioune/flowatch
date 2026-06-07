// SPDX-License-Identifier: Apache-2.0

/**
 * BpmnModeler — vanilla bpmn-js wrapping (Pattern P-006).
 *
 * Instantiates `bpmn-js/lib/Modeler` directly inside a useEffect, attaches
 * it to a ref'd <div>, and bridges save/deploy actions to api.deployBpmn.
 * Event-bus callbacks (`selection.changed`, `commandStack.changed`) are
 * typed via diagram-js's EventBus.EventTypes (with local payload
 * interfaces because diagram-js doesn't ship strongly-typed payloads
 * for those events).
 *
 * ADR-001 — vanilla wrapping; no bpmn-js-react bindings.
 * Story 16.1 — extracted from src/modeler.tsx; established src/modeler/.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import BpmnModelerClass from "bpmn-js/lib/Modeler";
import type EventBus from "diagram-js/lib/core/EventBus";
import React from "react";
import { api, type FlowableProcessDefinition } from "../api";
import { Icon, toast } from "../components";
import { DeployBpmnModal, type DeployBpmnModalTarget } from "../lib/deploy-bpmn-modal";
import {
  type EventDefSvc,
  eventDefKind,
  firstEventDef,
  setEventRefAttr,
  setTimerDef,
  type TimerKind,
  timerKindOf,
  timerValueOf,
} from "./event-defs";
import flowableModdle from "./flowable-moddle.json";
import { BLANK_BPMN_XML, LOAN_BPMN_XML } from "./starters";

// @migration-any: bpmn-js DI container, event-bus payloads, and BO shapes
// are dynamic. Per ADR-001 consequences, this file is the allowed `any`
// zone — every cast below is documented at use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

// ─── Typed event-bus payloads (Story 16.1 AC-3) ──────────────────────
// diagram-js exports `EventBus<EventMap>` but the BPMN-specific EventMap is
// not published. Local interfaces name the fields actually observed at
// runtime — preserving operator-feel-conservative typing while removing the
// raw `any` from the callback signatures.

interface SelectionChangedEvent {
  newSelection: AnyEl[];
  oldSelection?: AnyEl[];
}

// commandStack.changed has no published payload; the data we read off the
// modeler is its commandStack service (canUndo / canRedo), not the event.
// We type the event as an empty record + the modeler reaches over to the
// commandStack DI service for state. Story 16.2 consumes this typing for
// dirty-state tracking.
interface CommandStackChangedEvent {
  context?: unknown;
}

// ─── Element type helpers ───────────────────────────────────────────
const bpmnKind = (el: AnyEl): string => {
  if (!el || !el.type) return "—";
  return (el.type as string).replace(/^bpmn:/, "");
};
const bpmnIconClass = (el: AnyEl): string => {
  const t = bpmnKind(el);
  if (t === "StartEvent") return "bpmn-icon-start-event-none";
  if (t === "EndEvent") return "bpmn-icon-end-event-none";
  if (t === "UserTask") return "bpmn-icon-user-task";
  if (t === "ServiceTask") return "bpmn-icon-service-task";
  if (t === "BusinessRuleTask") return "bpmn-icon-business-rule-task";
  if (t === "ScriptTask") return "bpmn-icon-script-task";
  if (t === "ExclusiveGateway") return "bpmn-icon-gateway-xor";
  if (t === "ParallelGateway") return "bpmn-icon-gateway-parallel";
  if (t === "SequenceFlow") return "bpmn-icon-connection";
  return "bpmn-icon-task";
};

// PR #168 follow-up: turn an operator-typed filename into a Flowable-safe
// process id. Strips the .bpmn(20).xml extension, replaces non-id chars
// with `-`, trims dashes, and falls back to "newProcess" on empty input.
const bpmnIdFromFilename = (filename: string): string => {
  const base = filename
    .replace(/\.bpmn20?\.xml$/i, "")
    .replace(/\.bpmn$/i, "")
    .replace(/\.xml$/i, "");
  const slug = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "newProcess";
};

// Operator-feel readable name from a filename — strips extension, replaces
// separators with spaces, title-cases. Used as the modal's process-name
// default when the XML only carries an id (no name attribute).
const bpmnReadableNameFromFilename = (filename: string): string => {
  const base = filename
    .replace(/\.bpmn20?\.xml$/i, "")
    .replace(/\.bpmn$/i, "")
    .replace(/\.xml$/i, "");
  const words = base
    .replace(/[_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "New process";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

// XML attribute-value escaper for operator-typed strings going into id /
// name attributes. NCName-conforming keys never need escaping (validated
// in the modal), but the readable name may contain &, <, >, ", '.
const escapeXmlAttr = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Extract the FIRST <bpmn:process id="…" name="…"> tuple from the raw XML.
// Used to seed the deploy modal's default values. Falls back to null
// fields when the attributes aren't present (custom-authored XML).
const extractProcessIdAndName = (xml: string): { id: string | null; name: string | null } => {
  const m = xml.match(/<bpmn:process\b[^>]*>/);
  if (!m) return { id: null, name: null };
  const tag = m[0];
  const idMatch = tag.match(/\bid="([^"]+)"/);
  const nameMatch = tag.match(/\bname="([^"]*)"/);
  return { id: idMatch?.[1] ?? null, name: nameMatch?.[1] ?? null };
};

// Rewrite the <bpmn:process> id + name AND every `bpmnElement="<oldId>"`
// reference (used by BPMNPlane) to the operator-chosen values. Targeted
// string-level rewrite — safer than parsing/serialising via bpmn-moddle
// for this scope, and aligns with how `bpmnIdFromFilename`'s caller in
// the v0 implementation worked.
const rewriteProcessKeyAndName = (xml: string, newKey: string, newName: string): string => {
  const { id: oldId, name: oldName } = extractProcessIdAndName(xml);
  let next = xml;
  if (oldId && oldId !== newKey) {
    // Replace exact `id="<oldId>"` matches (anywhere in the XML — both
    // the <bpmn:process> declaration and any references like
    // `bpmnElement="<oldId>"`).
    const idAttr = new RegExp(`\\bid="${oldId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`, "g");
    const refAttr = new RegExp(
      `\\bbpmnElement="${oldId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`,
      "g",
    );
    next = next.replace(idAttr, `id="${newKey}"`).replace(refAttr, `bpmnElement="${newKey}"`);
  }
  // Rewrite the name attribute on the FIRST <bpmn:process …> tag only.
  const safeName = escapeXmlAttr(newName);
  if (oldName !== null) {
    next = next.replace(
      /<bpmn:process\b([^>]*?)\bname="[^"]*"([^>]*)>/,
      `<bpmn:process$1 name="${safeName}"$2>`,
    );
  } else {
    // No name attribute on the process — inject one right after the tag name.
    next = next.replace(/<bpmn:process\b/, `<bpmn:process name="${safeName}"`);
  }
  return next;
};

function download(name: string, content: BlobPart, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

interface BpmnModelerProps {
  /** Deep-link: pre-select this definition and trigger its XML load on mount. */
  initialDefinitionId?: string | undefined;
}

// ─── Story 30.1 nested-extension editors ────────────────────────────
// Presentational sub-components for the extensionElements editors. They own
// their own draft-input state; the committed list + add/remove callbacks are
// supplied by the parent (which routes them through the command stack). These
// are NOT the element-type dispatch (that stays an inline switch in the
// panel) — they are reusable field-cluster widgets shared across kinds.

const TASK_LISTENER_EVENTS = ["create", "assignment", "complete", "delete"] as const;
const EXEC_LISTENER_EVENTS = ["start", "end", "take"] as const;
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

const ListenerEditor = ({
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

const FieldInjectionEditor = ({ list, onAdd, onUpdate, onRemove }: FieldInjectionEditorProps) => {
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

const InOutEditor = ({
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

// ─── BPMN modeler (real bpmn-js) ───────────────────────────────────
export const BpmnModeler = ({ initialDefinitionId }: BpmnModelerProps) => {
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [selected, setSelected] = React.useState<AnyEl | null>(null);
  const [elements, setElements] = React.useState<AnyEl[]>([]);
  const [dirty, setDirty] = React.useState(false);
  // Story 16.3 follow-up: tracks the "New from scratch" authoring flow.
  // True between `handleNew()` and the next discard / save / deploy / load —
  // pins the operator to the in-progress draft so they don't accidentally
  // switch deployed definitions and lose the draft.
  const [creatingNew, setCreatingNew] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);
  const [definitions, setDefinitions] = React.useState<FlowableProcessDefinition[]>([]);
  const [activeDef, setActiveDef] = React.useState<FlowableProcessDefinition | null>(null);
  const [filename, setFilename] = React.useState("loan-approval.bpmn20.xml");
  // Story 27.1 — "Save as new version": after a version bump the modeler
  // moves to the new version; this snapshot is the back-reference to the
  // version we just came from, rendered as a "View previous version" link.
  // Ephemeral component-local state — null on a fresh mount (no back-link
  // until the operator performs an in-session version bump).
  const [previousVersion, setPreviousVersion] = React.useState<{
    id: string;
    version: number;
  } | null>(null);
  const saveVersionBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // Load list of deployed process definitions for the loader dropdown.
  React.useEffect(() => {
    api
      .listProcessDefinitions({ size: 200, sort: "name" })
      .then((r) => setDefinitions(r.data || []))
      .catch(() => setDefinitions([]));
  }, []);

  // Deep-link: if initialDefinitionId was provided (/bpmn?definitionId=...), load it
  // once the modeler is ready. Defer until both the definitions list AND the
  // modeler instance are present.
  const loadInvokedRef = React.useRef(false);
  React.useEffect(() => {
    if (loadInvokedRef.current) return;
    if (!initialDefinitionId) return;
    if (!modelerRef.current) return;
    if (definitions.length === 0) return;
    loadInvokedRef.current = true;
    loadDefinition(initialDefinitionId);
    // loadDefinition is defined further down — exhaustive-deps would create a
    // cycle, so we intentionally omit it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDefinitionId, definitions]);

  // Hoisted to component scope (PR #168 follow-up) so importAndFit can
  // trigger an outline refresh — `importXML` does NOT reliably fire
  // `commandStack.changed`, so without this call the outline shows the
  // previous diagram's elements after a fresh load / New from scratch.
  const refreshOutline = React.useCallback(() => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const reg = m.get("elementRegistry");
      const all = reg.filter(
        (el: AnyEl) =>
          el.businessObject &&
          el.type !== "label" &&
          el.type !== "bpmn:Process" &&
          el.type !== "bpmn:Collaboration" &&
          el.parent,
      );
      setElements(all);
    } catch {}
  }, []);

  React.useEffect(() => {
    let m: AnyModeler;
    try {
      // @migration-any: bpmn-js constructor accepts `container: HTMLElement`.
      m = new BpmnModelerClass({
        container: containerRef.current as HTMLElement,
        keyboard: { bindTo: window },
        // Story 30.1: register the Flowable moddle descriptor so every
        // flowable: attribute + extensionElements child is TYPED — the
        // load-bearing round-trip foundation (FR-38 / D-8 / ADR-006).
        // Typed properties read via bo.get("flowable:<attr>") and write via
        // modeling.updateProperties / updateModdleProperties; untyped/foreign
        // content still survives via moddle's lax handling (AC-4).
        moddleExtensions: { flowable: flowableModdle },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    modelerRef.current = m;

    m.importXML(LOAN_BPMN_XML)
      .then(() => {
        try {
          m.get("canvas").zoom("fit-viewport", "auto");
        } catch {}
        setDirty(false);
        refreshOutline();
      })
      .catch((e: Error) => setError(String(e.message || e)));

    // Story 16.1 AC-3: typed event-bus callbacks. The cast to `EventBus` lets
    // us call .on/.off with a typed signature; the payload typings are local
    // (diagram-js doesn't publish BPMN-specific event payloads). Story 16.2
    // consumes the CommandStackChangedEvent typing for dirty-state — the
    // event payload itself is unused; we read dirtiness from the modeler's
    // commandStack DI service (`canUndo()`).
    const bus = m.get("eventBus") as EventBus;
    const onSel = (event: SelectionChangedEvent) => {
      const els = event.newSelection || [];
      setSelected(els.length === 1 ? els[0] : null);
      setVersion((v) => v + 1);
    };
    const onChange = (_event: CommandStackChangedEvent) => {
      try {
        const cmdStack = m.get("commandStack");
        // Story 16.2: dirty iff the operator has executed >= 1 undoable
        // command since the last clean state (mount, import, deploy).
        setDirty(!!cmdStack?.canUndo?.());
      } catch {
        // Defensive: if the DI service throws, fall back to "edits happened".
        setDirty(true);
      }
      setVersion((v) => v + 1);
      refreshOutline();
    };
    bus.on("selection.changed", onSel);
    bus.on("commandStack.changed", onChange);

    return () => {
      try {
        m.destroy();
      } catch {}
      modelerRef.current = null;
    };
  }, [refreshOutline]);

  // Story 16.2 AC-3: every import is followed by zoom-to-fit + dirty reset.
  // Centralizing this means we cannot drift across the multiple import sites
  // (mount, dropdown pick, "New from scratch" in Story 16.3).
  const importAndFit = React.useCallback(
    async (xml: string) => {
      const m = modelerRef.current;
      if (!m) return;
      await m.importXML(xml);
      try {
        m.get("canvas").zoom("fit-viewport", "auto");
      } catch {}
      // commandStack is a fresh slate after a successful import — the
      // commandStack.changed listener will see canUndo() === false and reset
      // dirty, but we reset explicitly here as a belt-and-braces.
      setDirty(false);
      // bpmn-js doesn't reliably fire `commandStack.changed` on a fresh
      // import, so the outline-tree listener in useEffect can hold stale
      // elements from the previous diagram. Refresh explicitly here.
      refreshOutline();
    },
    [refreshOutline],
  );

  const loadDefinition = async (id: string) => {
    // Loading any definition clears the "View previous version" back-link.
    // The version-bump path (doDeploy) re-sets it AFTER awaiting this call.
    // LOAD-BEARING INVARIANT (Story 27.1): version-mode in doDeploy sets
    // activeDef DIRECTLY and does NOT call loadDefinition — precisely so this
    // clear does not wipe the freshly-set back-link. Do NOT route version-mode
    // through loadDefinition without re-sequencing setPreviousVersion.
    setPreviousVersion(null);
    if (!id) {
      setActiveDef(null);
      try {
        await importAndFit(BLANK_BPMN_XML);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
      setFilename("new-process.bpmn20.xml");
      // Loading a deployed definition (or the empty placeholder) ends any
      // in-progress "New from scratch" draft.
      setCreatingNew(false);
      return;
    }
    const def = definitions.find((d) => d.id === id);
    setActiveDef(def || null);
    setFilename((def?.key || "process") + ".bpmn20.xml");
    try {
      const xml = await api.getProcessDefinitionResource(id);
      await importAndFit(xml);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
    setCreatingNew(false);
  };

  // Story 16.2 AC-5 / AC-6: dropdown pick = load + URL update + confirm on
  // dirty. The dropdown is the operator's "switch to a different deployed
  // definition" affordance; the URL bookmark reflects the active definition.
  const handleDropdownChange = async (newId: string, prevId: string) => {
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes. Discard and load the selected definition?",
      );
      if (!ok) {
        // Restore the <select>'s value to the currently-loaded definition.
        // Because activeDef.id drives the controlled value, we just return —
        // React re-renders with the unchanged activeDef and the dropdown
        // snaps back. The `prevId` arg is retained for explicit
        // documentation that the cancel path keeps prevId active.
        void prevId;
        return;
      }
    }
    await loadDefinition(newId);
    // Sync the URL to the new definition (or clear when the placeholder is
    // re-picked). Use `replace: true` to avoid stuffing the history stack
    // with every dropdown pick.
    navigate({
      to: "/bpmn",
      search: newId ? { definitionId: newId } : {},
      replace: true,
    });
  };

  const updateName = (val: string) => {
    const m = modelerRef.current;
    if (!m || !selected) return;
    m.get("modeling").updateProperties(selected, { name: val });
  };
  // Story 30.1 — Flowable extension read/write helpers.
  //
  // Reads go through the TYPED moddle accessor `bo.get("flowable:<attr>")`
  // (the descriptor registered in the constructor names every flowable:
  // attribute). Writes go through `modeling.updateProperties` with the
  // `flowable:`-qualified key so the value serializes under the right
  // namespace and round-trips losslessly.

  // Typed read of a flowable: attribute off the current selection's BO.
  const readExtAttr = (attr: string): string => {
    if (!bo) return "";
    const v = (bo as { get?: (k: string) => unknown }).get?.(`flowable:${attr}`);
    return v == null ? "" : String(v);
  };
  // Typed read of a boolean flowable: flag (Flowable serializes these as the
  // string "true"; the descriptor types them Boolean so moddle coerces).
  const readExtBool = (attr: string): boolean => {
    if (!bo) return false;
    const v = (bo as { get?: (k: string) => unknown }).get?.(`flowable:${attr}`);
    return v === true || v === "true";
  };

  // Write (or clear) a simple flowable: attribute. Empty string / null clears
  // the attribute entirely (absence is the clean default — keeps round-trip
  // diffs honest, matching Flowable's own serializer; never writes "").
  const updateExtAttr = (attr: string, val: unknown) => {
    const m = modelerRef.current;
    if (!m || !selected) return;
    const modeling = m.get("modeling");
    const cleared = val === "" || val === null || val === undefined || val === false;
    const props: Record<string, unknown> = { [`flowable:${attr}`]: cleared ? undefined : val };
    try {
      modeling.updateProperties(selected, props);
    } catch {
      // SDR fix: fallback must keep the flowable: namespace key (the
      // command-stack path writes the qualified name) — a bare attr key
      // would lose the namespace on rejection.
      (selected.businessObject as Record<string, unknown>)[`flowable:${attr}`] = cleared
        ? undefined
        : val;
      setVersion((v) => v + 1);
    }
  };

  // Boolean flag write: checked → string "true"; unchecked → clear the
  // attribute (Flowable treats absence as false — never write "false").
  const updateExtBool = (attr: string, checked: boolean) => {
    updateExtAttr(attr, checked ? "true" : "");
  };

  // ── Nested extensionElements helpers (listeners / field injection / in-out)
  //
  // Per the modeling-service write discipline (Dev Notes): create the moddle
  // element with bpmnFactory, ensure a bpmn:ExtensionElements container, and
  // commit the new values array via modeling.updateModdleProperties so the
  // edit goes through the command stack (undo + dirty tracking for free).
  // NEVER mutate businessObject.extensionElements directly.

  // List the current extensionElements children of a given flowable: type.
  const listExtChildren = (type: string): AnyEl[] => {
    if (!bo || !bo.extensionElements || !Array.isArray(bo.extensionElements.values)) return [];
    return bo.extensionElements.values.filter((v: AnyEl) => v && v.$type === type);
  };

  // Append a freshly-created flowable: moddle element to extensionElements.
  const addExtChild = (type: string, attrs: Record<string, unknown>) => {
    const m = modelerRef.current;
    if (!m || !selected) return;
    const modeling = m.get("modeling");
    const bpmnFactory = m.get("bpmnFactory");
    const moddle = m.get("moddle");
    const boLocal = selected.businessObject as AnyEl;
    // Drop empty-string attrs so we don't serialize blank attributes.
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(attrs)) {
      if (val !== "" && val != null) clean[k] = val;
    }
    const child = bpmnFactory.create(type, clean);
    let ext = boLocal.extensionElements;
    if (!ext) {
      ext = moddle.create("bpmn:ExtensionElements", { values: [] });
      ext.$parent = boLocal;
    }
    const values = [...(ext.values || []), child];
    try {
      modeling.updateModdleProperties(selected, ext, { values });
      if (!boLocal.extensionElements) {
        modeling.updateProperties(selected, { extensionElements: ext });
      }
    } catch {
      // Defensive fallback — keep the model consistent even if the command
      // stack rejects (e.g. a stub modeler in tests).
      boLocal.extensionElements = ext;
      ext.values = values;
    }
    // Single re-render regardless of path (SDR fix: was double-incrementing
    // on the catch path).
    setVersion((v) => v + 1);
  };

  // Remove an extensionElements child by reference.
  const removeExtChild = (child: AnyEl) => {
    const m = modelerRef.current;
    if (!m || !selected || !bo || !bo.extensionElements) return;
    const modeling = m.get("modeling");
    const ext = bo.extensionElements;
    const values = (ext.values || []).filter((v: AnyEl) => v !== child);
    try {
      modeling.updateModdleProperties(selected, ext, { values });
    } catch {
      ext.values = values;
    }
    // Single re-render regardless of path (SDR fix).
    setVersion((v) => v + 1);
  };

  // Update properties on an EXISTING extensionElements child in place. Empty-
  // string values clear the attribute (absence is the clean default). Goes
  // through the command stack like the create/remove paths (undo + dirty).
  const updateExtChild = (child: AnyEl, attrs: Record<string, unknown>) => {
    const m = modelerRef.current;
    if (!m || !selected) return;
    const modeling = m.get("modeling");
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(attrs)) {
      clean[k] = val === "" || val == null ? undefined : val;
    }
    try {
      modeling.updateModdleProperties(selected, child, clean);
    } catch {
      Object.assign(child, clean);
    }
    setVersion((v) => v + 1);
  };

  const saveXML = async () => {
    const m = modelerRef.current;
    if (!m) return;
    const { xml } = await m.saveXML({ format: true });
    download(filename, xml, "application/xml");
    setDirty(false);
  };
  const saveSVG = async () => {
    const m = modelerRef.current;
    if (!m) return;
    const { svg } = await m.saveSVG();
    download(filename.replace(/\.bpmn.*$/, ".svg"), svg, "image/svg+xml");
  };
  // PR #168 follow-up round 4: deploy now opens a confirmation modal
  // asking for the process definition NAME + KEY, pre-filled from the
  // XML's <bpmn:process id name> tuple (or filename-derived defaults when
  // creatingNew). The modal calls back into `doDeploy(name, key)`, which
  // rewrites the XML and runs the actual multipart deploy.
  const [deployTarget, setDeployTarget] = React.useState<DeployBpmnModalTarget | null>(null);
  const deployBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // Open the deploy modal with sensible defaults read off the current XML.
  const handleDeployClick = async () => {
    const m = modelerRef.current;
    if (!m) return;
    let xml = "";
    try {
      const out = await m.saveXML({ format: true });
      xml = out.xml as string;
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      toast({ kind: "error", text: `Could not read BPMN XML: ${msg}` });
      return;
    }
    const { id: xmlId, name: xmlName } = extractProcessIdAndName(xml);
    // Defaults:
    //   - draft: filename-derived key + readable name
    //   - loaded def: prefer the XML's existing id + name; fall back to
    //     activeDef.key / activeDef.name for definitions deployed via
    //     bpmn-js paths that strip the name attribute.
    const fallbackName = bpmnReadableNameFromFilename(filename);
    const fallbackKey = bpmnIdFromFilename(filename);
    const defaultKey = creatingNew || !xmlId || xmlId === "newProcess" ? fallbackKey : xmlId;
    const defaultName = creatingNew || !xmlName ? activeDef?.name || fallbackName : xmlName;
    setDeployTarget({ defaultKey, defaultName, filename });
  };

  // Story 16.3 AC-2 + AC-3 + PR #168 follow-up round 4: ACTUAL deploy.
  // Called by DeployBpmnModal on confirm with operator-typed values.
  // Errors thrown here surface as an in-modal ErrorBox so the operator
  // can fix-and-resubmit without re-typing.
  const doDeploy = async (chosenName: string, chosenKey: string): Promise<void> => {
    const m = modelerRef.current;
    if (!m) throw new Error("BPMN modeler not ready");
    // Story 27.1 — version mode is driven by the modal target's lockKey
    // flag (set by handleSaveNewVersion). In version mode we snapshot the
    // currently-loaded definition BEFORE the deploy swaps activeDef, then
    // auto-switch to the new version + render the "View previous version"
    // back-link. The wire-level call is the SAME api.deployBpmn multipart
    // POST as the generic Deploy — Flowable auto-versions per key.
    const versionMode = !!deployTarget?.lockKey;
    const prevSnapshot =
      versionMode && activeDef ? { id: activeDef.id, version: activeDef.version } : null;
    const { xml: rawXml } = await m.saveXML({ format: true });
    const xml = rewriteProcessKeyAndName(rawXml, chosenKey, chosenName);
    const deployment = await api.deployBpmn(filename, xml);
    setDirty(false);
    // Refresh the dropdown's definitions list so the deployed definition is
    // available for selection.
    const refresh = api
      .listProcessDefinitions({ size: 200, sort: "name" })
      .then((r) => {
        setDefinitions(r.data || []);
        return r.data || [];
      })
      .catch(() => [] as FlowableProcessDefinition[]);
    // Discover the new definition. Single-file deploy → exactly one
    // definition per deploymentId; a short retry absorbs engine
    // read-after-write lag (see Story 16.3 e2e fix).
    let newDef: FlowableProcessDefinition | null = null;
    for (let attempt = 0; attempt < 4 && !newDef; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 250));
      try {
        const list = await api.listProcessDefinitions({
          deploymentId: deployment.id,
          size: 10,
        });
        newDef = list.data?.[0] || null;
      } catch {}
    }
    await refresh;
    setCreatingNew(false);
    if (versionMode && newDef && prevSnapshot) {
      // AC-3: switch active selection + URL to the new version. The canvas
      // already renders the content we just deployed, so we set activeDef
      // directly from the fresh lookup rather than calling loadDefinition —
      // loadDefinition resolves the def from the (stale-in-this-closure)
      // dropdown list and would re-fetch identical XML. Setting state
      // directly avoids both the stale-list miss and a redundant fetch.
      navigate({ to: "/bpmn", search: { definitionId: newDef.id }, replace: true });
      setActiveDef(newDef);
      setFilename(`${newDef.key || "process"}.bpmn20.xml`);
      setPreviousVersion(prevSnapshot);
      toast({
        kind: "success",
        text: `Saved ${newDef.key} v${prevSnapshot.version} → v${newDef.version}`,
        action: {
          label: "Open the deployed definition",
          testId: "open-deployed-definition",
          onClick: () =>
            navigate({
              to: "/bpmn",
              search: { definitionId: newDef.id },
            }),
        },
      });
    } else if (newDef) {
      // Generic deploy — clear any stale back-link from a prior bump.
      setPreviousVersion(null);
      toast({
        kind: "success",
        text: `Deployed ${deployment.name} → ${newDef.key} v${newDef.version}`,
        action: {
          label: "Open the deployed definition",
          testId: "open-deployed-definition",
          onClick: () =>
            navigate({
              to: "/bpmn",
              search: { definitionId: newDef.id },
            }),
        },
      });
    } else {
      // Defensive: lookup failed (engine momentarily inconsistent) — plain success.
      toast({
        kind: "success",
        text: `Deployed ${deployment.name} (${deployment.id}).`,
        sub: "Refresh /definitions to see the new revision.",
      });
    }
  };

  // ─── Story 27.1 — "Save as new version" ────────────────────────────
  // OPERATOR-FEEL LABEL vs WIRE-LEVEL VERB (CLAUDE.md "Operator-feel UI
  // labels can diverge from wire-level action verbs"):
  //   - Operator-feel label: "Save as new version".
  //   - Wire-level action: the SAME `api.deployBpmn` multipart POST as the
  //     generic Deploy. Flowable has NO distinct "new version" endpoint —
  //     versioning is an emergent property of redeploying under the same
  //     process-definition key. There is intentionally NO `api.saveNewVersion`
  //     wrapper; inventing one would imply a wire verb that does not exist.
  // The load-bearing semantic is the KEY-LOCK: the modal opens with
  // `lockKey: true` pinned to `activeDef.key`, so the operator cannot fork
  // a new v1 family by editing the key. The name stays editable.
  const handleSaveNewVersion = async () => {
    if (!activeDef) return;
    const m = modelerRef.current;
    if (!m) return;
    const fallbackName = bpmnReadableNameFromFilename(filename);
    setDeployTarget({
      defaultKey: activeDef.key,
      defaultName: activeDef.name || fallbackName,
      filename,
      lockKey: true,
    });
  };

  // Story 16.3 AC-1: "New from scratch" — confirm-on-dirty, load BLANK,
  // clear ?definitionId= so the URL no longer points at any deployed def.
  const handleNew = async () => {
    if (dirty || creatingNew) {
      const ok = window.confirm("You have unsaved changes. Discard and start a new BPMN?");
      if (!ok) return;
    }
    setActiveDef(null);
    setPreviousVersion(null);
    setFilename("new-process.bpmn20.xml");
    try {
      await importAndFit(BLANK_BPMN_XML);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
    // Clear any deep-link search param — the operator is now editing a
    // not-yet-deployed BPMN.
    navigate({ to: "/bpmn", search: {}, replace: true });
    setCreatingNew(true);
  };

  // PR #168 follow-up: "Abort" / Discard — visible only while the operator
  // is in the middle of an authoring flow (creatingNew OR dirty). Pins the
  // dropdown's previously-selected definition (or BLANK if none) so the
  // operator can back out of an in-progress draft.
  const handleAbort = async () => {
    if (!creatingNew && !dirty) return;
    const ok = window.confirm(
      creatingNew
        ? "Discard the new BPMN draft? This cannot be undone."
        : "Discard unsaved edits and reload the active definition?",
    );
    if (!ok) return;
    setCreatingNew(false);
    if (activeDef) {
      // Re-fetch the deployed XML so the canvas matches engine state.
      try {
        const xml = await api.getProcessDefinitionResource(activeDef.id);
        await importAndFit(xml);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    } else {
      try {
        await importAndFit(BLANK_BPMN_XML);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    }
  };

  const zoom = (dir: number | "fit") => {
    const m = modelerRef.current;
    if (!m) return;
    const canvas = m.get("canvas");
    if (dir === "fit") canvas.zoom("fit-viewport", "auto");
    else canvas.zoom(canvas.zoom() * ((dir as number) > 0 ? 1.15 : 1 / 1.15));
  };

  const sel = selected;
  const bo = sel && sel.businessObject;

  // ── Story 30.1 field render helpers (element-type dispatch stays an inline
  //    switch in the panel JSX; these are per-attribute field renderers).
  const kind = sel ? bpmnKind(sel) : "";

  const textField = (attr: string, label: string, placeholder?: string) =>
    sel ? (
      <div className="form-row" key={`${attr}-row`}>
        <label>
          {label} <span className="mono">flowable:{attr}</span>
        </label>
        <input
          className="input mono"
          key={`${sel.id}:${attr}:${version}`}
          defaultValue={readExtAttr(attr)}
          placeholder={placeholder}
          data-testid={`bpmn-prop-${attr}`}
          onBlur={(e) => updateExtAttr(attr, e.target.value)}
        />
      </div>
    ) : null;

  const boolField = (attr: string, label: string) =>
    sel ? (
      <div className="form-row" key={`${attr}-row`}>
        <label htmlFor={`bpmn-prop-${attr}`}>
          {label} <span className="mono">flowable:{attr}</span>
        </label>
        <input
          id={`bpmn-prop-${attr}`}
          type="checkbox"
          key={`${sel.id}:${attr}:${version}`}
          checked={readExtBool(attr)}
          data-testid={`bpmn-prop-${attr}`}
          onChange={(e) => updateExtBool(attr, e.target.checked)}
        />
      </div>
    ) : null;

  // Sequence-flow condition (standard bpmn:conditionExpression — NOT a
  // flowable: attr). Stored as a bpmn:FormalExpression whose `body` is the
  // JUEL/UEL expression. Write creates/updates the FormalExpression; an empty
  // value clears the condition (a default/unconditional flow).
  const setCondition = (body: string) => {
    const m = modelerRef.current;
    if (!m || !selected) return;
    const modeling = m.get("modeling");
    const trimmed = body.trim();
    if (!trimmed) {
      try {
        modeling.updateProperties(selected, { conditionExpression: undefined });
      } catch {}
      setVersion((v) => v + 1);
      return;
    }
    const moddle = m.get("moddle");
    const expr = moddle.create("bpmn:FormalExpression", { body: trimmed });
    expr.$parent = selected.businessObject;
    try {
      modeling.updateProperties(selected, { conditionExpression: expr });
    } catch {
      (selected.businessObject as AnyEl).conditionExpression = expr;
    }
    setVersion((v) => v + 1);
  };
  const conditionField = () =>
    sel ? (
      <div className="form-row" key="condition-row">
        <label htmlFor="bpmn-prop-condition">
          Condition <span className="mono">bpmn:conditionExpression</span>
        </label>
        <textarea
          id="bpmn-prop-condition"
          className="textarea mono"
          key={`${sel.id}:cond:${version}`}
          defaultValue={(bo?.conditionExpression && bo.conditionExpression.body) || ""}
          placeholder={'${decision == "reject"}'}
          data-testid="bpmn-prop-condition"
          onBlur={(e) => setCondition(e.target.value)}
        />
      </div>
    ) : null;

  // Build the event-definition service backed by bpmn-js modeling for the
  // current selection (the pure helpers at module scope do the real work).
  const eventDefSvc = (): EventDefSvc | null => {
    const m = modelerRef.current;
    if (!m || !selected) return null;
    const modeling = m.get("modeling");
    let definitions: AnyEl | null = null;
    try {
      definitions = m.get("canvas").getRootElement()?.businessObject?.$parent ?? null;
    } catch {}
    return {
      moddle: m.get("moddle"),
      updateModdle: (target, props) => {
        try {
          modeling.updateModdleProperties(selected, target, props);
        } catch {
          Object.assign(target, props);
        }
      },
      definitions,
    };
  };
  const commitEventDef = (fn: (svc: EventDefSvc) => void) => {
    const svc = eventDefSvc();
    if (svc) fn(svc);
    setVersion((v) => v + 1);
  };

  // Editable signal / message / timer / error event-definition fields. Renders
  // for ANY event element (start / intermediate / boundary / end) that carries
  // an eventDefinition; null otherwise.
  const eventDefFields = () => {
    const ed = bo ? firstEventDef(bo) : null;
    const k = eventDefKind(ed);
    if (!ed || !k) return null;
    const textRow = (
      testid: string,
      label: string,
      wire: string,
      value: string,
      onCommit: (svc: EventDefSvc, v: string) => void,
      placeholder?: string,
    ) => (
      <div className="form-row" key={testid}>
        <label>
          {label} <span className="mono">{wire}</span>
        </label>
        <input
          className="input mono"
          key={`${sel?.id}:${testid}:${version}`}
          defaultValue={value}
          placeholder={placeholder}
          data-testid={testid}
          onBlur={(e) => commitEventDef((svc) => onCommit(svc, e.target.value))}
        />
      </div>
    );
    if (k === "signal")
      return textRow(
        "bpmn-prop-signalName",
        "Signal name",
        "bpmn:signalRef",
        ed.signalRef?.name || "",
        (svc, v) => setEventRefAttr(svc, ed, "signalRef", "bpmn:Signal", "name", v),
        "orderPlaced",
      );
    if (k === "message")
      return textRow(
        "bpmn-prop-messageName",
        "Message name",
        "bpmn:messageRef",
        ed.messageRef?.name || "",
        (svc, v) => setEventRefAttr(svc, ed, "messageRef", "bpmn:Message", "name", v),
        "paymentReceived",
      );
    if (k === "error")
      return (
        <React.Fragment key="error-event-def">
          {textRow(
            "bpmn-prop-errorCode",
            "Error code",
            "bpmn:errorRef · errorCode",
            ed.errorRef?.errorCode || "",
            (svc, v) => setEventRefAttr(svc, ed, "errorRef", "bpmn:Error", "errorCode", v),
            "E_LOAN_REJECTED",
          )}
          {textRow(
            "bpmn-prop-errorName",
            "Error name",
            "bpmn:errorRef · name",
            ed.errorRef?.name || "",
            (svc, v) => setEventRefAttr(svc, ed, "errorRef", "bpmn:Error", "name", v),
          )}
        </React.Fragment>
      );
    // timer
    const tk = timerKindOf(ed);
    return (
      <div className="form-row" key="timer-event-def" data-testid="bpmn-prop-timer">
        <label>
          Timer <span className="mono">bpmn:timerEventDefinition</span>
        </label>
        <select
          className="select"
          value={tk}
          aria-label="Timer kind"
          data-testid="bpmn-prop-timerKind"
          onChange={(e) =>
            commitEventDef((svc) =>
              setTimerDef(svc, ed, e.target.value as TimerKind, timerValueOf(ed)),
            )
          }
        >
          <option value="timeDuration">Duration (timeDuration)</option>
          <option value="timeDate">Date (timeDate)</option>
          <option value="timeCycle">Cycle (timeCycle)</option>
        </select>
        <input
          className="input mono"
          key={`${sel?.id}:timerexpr:${version}`}
          defaultValue={timerValueOf(ed)}
          placeholder={
            tk === "timeCycle" ? "R3/PT10M" : tk === "timeDate" ? "2026-01-01T00:00:00" : "PT5M"
          }
          data-testid="bpmn-prop-timerExpression"
          onBlur={(e) =>
            commitEventDef((svc) => setTimerDef(svc, ed, timerKindOf(ed), e.target.value))
          }
        />
      </div>
    );
  };

  const taskListeners = () => (
    <ListenerEditor
      title="Task listeners"
      wireType="flowable:TaskListener"
      events={TASK_LISTENER_EVENTS}
      list={listExtChildren("flowable:TaskListener")}
      onAdd={(attrs) => addExtChild("flowable:TaskListener", attrs)}
      onUpdate={updateExtChild}
      onRemove={removeExtChild}
    />
  );
  const execListeners = (events: readonly string[] = EXEC_LISTENER_EVENTS) => (
    <ListenerEditor
      title="Execution listeners"
      wireType="flowable:ExecutionListener"
      events={events}
      list={listExtChildren("flowable:ExecutionListener")}
      onAdd={(attrs) => addExtChild("flowable:ExecutionListener", attrs)}
      onUpdate={updateExtChild}
      onRemove={removeExtChild}
    />
  );
  const fieldInjection = () => (
    <FieldInjectionEditor
      list={listExtChildren("flowable:Field")}
      onAdd={(attrs) => addExtChild("flowable:Field", attrs)}
      onUpdate={updateExtChild}
      onRemove={removeExtChild}
    />
  );
  const inOutMappings = () => (
    <>
      <InOutEditor
        direction="in"
        wireType="flowable:in"
        list={listExtChildren("flowable:In")}
        onAdd={(attrs) => addExtChild("flowable:In", attrs)}
        onUpdate={updateExtChild}
        onRemove={removeExtChild}
      />
      <InOutEditor
        direction="out"
        wireType="flowable:out"
        list={listExtChildren("flowable:Out")}
        onAdd={(attrs) => addExtChild("flowable:Out", attrs)}
        onUpdate={updateExtChild}
        onRemove={removeExtChild}
      />
    </>
  );

  // Process-level fields (AC-2 Process row) — surfaced in the no-selection
  // Outline header. These target the canvas root element (the bpmn:Process),
  // not `selected`, so they have their own read/write against the root BO.
  const getRootEl = (): AnyEl | null => {
    const m = modelerRef.current;
    if (!m) return null;
    try {
      const root = m.get("canvas").getRootElement();
      // A Collaboration root has no flowable: process attrs; skip it.
      if (root?.businessObject?.$type === "bpmn:Process") return root;
    } catch {}
    return null;
  };
  const rootEl = sel ? null : getRootEl();
  const rootBo = rootEl?.businessObject as AnyEl | undefined;
  const readRootAttr = (attr: string): string => {
    const v = rootBo?.get?.(`flowable:${attr}`);
    return v == null ? "" : String(v);
  };
  const updateRootAttr = (attr: string, val: string) => {
    const m = modelerRef.current;
    if (!m || !rootEl) return;
    const cleared = val === "";
    try {
      m.get("modeling").updateProperties(rootEl, {
        [`flowable:${attr}`]: cleared ? undefined : val,
      });
    } catch {}
  };
  const processTextField = (attr: string, label: string) => (
    <div className="form-row" key={`proc-${attr}`}>
      <label>
        {label} <span className="mono">flowable:{attr}</span>
      </label>
      <input
        className="input mono"
        key={`proc:${attr}:${version}`}
        defaultValue={readRootAttr(attr)}
        data-testid={`bpmn-prop-${attr}`}
        onBlur={(e) => updateRootAttr(attr, e.target.value)}
      />
    </div>
  );

  return (
    <div className="modeler" data-engine="real">
      <div className="mod-toolbar">
        <div className="file-name">
          <Icon name="bpmn" size={14} />
          <input
            className="mod-filename"
            data-testid="bpmn-filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            readOnly={!creatingNew}
            size={Math.max(filename.length + 1, 24)}
            spellCheck={false}
            aria-label="BPMN filename"
            title={
              creatingNew
                ? "Filename + derived process id for the new BPMN"
                : "Filename of the deployed definition (read-only)"
            }
          />
          {activeDef?.tenantId && (
            <span style={{ color: "var(--fg-mute)" }}>· tenant: {activeDef.tenantId}</span>
          )}
          {creatingNew && (
            <span data-testid="bpmn-draft-badge" style={{ color: "var(--warn)" }}>
              · new draft
            </span>
          )}
          {dirty && <span style={{ color: "var(--warn)" }}>· unsaved</span>}
          {previousVersion && activeDef && previousVersion.id !== activeDef.id && (
            <Link
              to="/bpmn"
              search={{ definitionId: previousVersion.id }}
              className="btn"
              data-size="sm"
              data-variant="ghost"
              data-testid="bpmn-view-previous-version"
              title="Load the version this one was saved from"
              onClick={(e) => {
                // Route through handleDropdownChange for unified confirm-on-
                // dirty + URL sync; preventDefault stops the Link's own nav
                // so we don't double-navigate.
                e.preventDefault();
                handleDropdownChange(previousVersion.id, activeDef.id);
              }}
            >
              ← View previous version (v{previousVersion.version})
            </Link>
          )}
        </div>
        <div className="sep" />
        <select
          className="select modeler-dropdown"
          data-testid="bpmn-definition-dropdown"
          data-size="sm"
          value={activeDef?.id || ""}
          onChange={(e) => handleDropdownChange(e.target.value, activeDef?.id || "")}
          disabled={creatingNew}
          title={
            creatingNew
              ? "Save, deploy, or discard the new draft to switch definitions"
              : "Load deployed definition"
          }
        >
          <option value="">{creatingNew ? "— new draft —" : "— template (loan-approval) —"}</option>
          {definitions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name || d.key} v{d.version}
            </option>
          ))}
        </select>
        <div className="sep" />
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-new"
          onClick={handleNew}
          title="Start a new BPMN from blank"
        >
          <Icon name="plus" size={13} />
          New
        </button>
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-save-xml"
          onClick={saveXML}
        >
          <Icon name="save" size={13} />
          Save
        </button>
        <button
          ref={deployBtnRef}
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-deploy"
          data-tone={dirty ? "warn" : undefined}
          onClick={handleDeployClick}
        >
          <Icon name="upload" size={13} />
          {dirty ? "Deploy *" : "Deploy"}
        </button>
        {activeDef && !creatingNew && (
          <button
            ref={saveVersionBtnRef}
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            data-testid="bpmn-save-new-version"
            onClick={handleSaveNewVersion}
            title={`Deploy the current canvas as the next version of ${activeDef.key}`}
          >
            <Icon name="upload" size={13} />
            Save as new version
          </button>
        )}
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export XML
        </button>
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveSVG}>
          <Icon name="download" size={13} />
          Export SVG
        </button>
        {(creatingNew || dirty) && (
          <button
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            data-tone="bad"
            data-testid="bpmn-abort"
            onClick={handleAbort}
            title={creatingNew ? "Discard the new BPMN draft" : "Discard unsaved edits and reload"}
          >
            <Icon name="x" size={13} />
            {creatingNew ? "Abort" : "Discard"}
          </button>
        )}
        <div className="spacer" />
        <div className="seg-row" style={{ margin: 0 }}>
          <button type="button" className="seg-btn" onClick={() => zoom(-1)} title="Zoom out">
            −
          </button>
          <button type="button" className="seg-btn" onClick={() => zoom("fit")} title="Fit">
            ⤢
          </button>
          <button type="button" className="seg-btn" onClick={() => zoom(1)} title="Zoom in">
            +
          </button>
        </div>
      </div>

      <div className="mod-canvas">
        <div ref={containerRef} className="bpmn-host" style={{ width: "100%", height: "100%" }} />
        {error && (
          <div
            role="alert"
            data-testid="bpmn-error-overlay"
            className="mono"
            style={{
              position: "absolute",
              inset: 20,
              background: "var(--bg-elev)",
              border: "1px solid var(--bad)",
              padding: 16,
              borderRadius: 8,
              color: "var(--bad)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Error</strong>
              <button
                type="button"
                className="btn"
                data-size="sm"
                data-variant="ghost"
                data-testid="bpmn-error-dismiss"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <Icon name="x" size={13} />
                Dismiss
              </button>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        )}
      </div>

      <div className="mod-props">
        <div className="panel-hd">
          <span className="panel-title">{sel ? "Properties" : "Outline"}</span>
          {sel && (
            <span
              className="mono"
              style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-mute)" }}
            >
              {bpmnKind(sel)}
            </span>
          )}
        </div>
        <div style={{ padding: sel ? 14 : 0, overflowY: "auto" }}>
          {!sel && (
            <div className="mod-outline-tree">
              <div
                className="out-row"
                style={{ color: "var(--fg-mute)", paddingTop: 8, paddingBottom: 4 }}
              >
                <span
                  className="mono"
                  style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}
                >
                  elements · {elements.length}
                </span>
              </div>
              {elements.map((el) => (
                <button
                  type="button"
                  key={el.id}
                  className="out-row"
                  onClick={() =>
                    modelerRef.current && modelerRef.current.get("selection").select(el)
                  }
                >
                  <span
                    className={bpmnIconClass(el)}
                    style={{ fontSize: 14, color: "var(--fg-soft)" }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {(el.businessObject && el.businessObject.name) || el.id}
                  </span>
                  <span className="kind">{bpmnKind(el)}</span>
                </button>
              ))}
              {rootEl && (
                <div
                  data-testid="bpmn-process-section"
                  style={{
                    padding: "8px 14px 0",
                    borderTop: "1px solid var(--line)",
                    marginTop: 8,
                  }}
                >
                  <div className="drawer-sect">Process · {rootEl.businessObject.id}</div>
                  {processTextField("candidateStarterUsers", "Candidate starter users")}
                  {processTextField("candidateStarterGroups", "Candidate starter groups")}
                  {processTextField("initiator", "Initiator")}
                </div>
              )}
              <div style={{ padding: "10px 14px" }}>
                <div className="text-xs mute">
                  Drag from the bpmn-js palette to add elements. Click any node to edit
                  Flowable-specific attributes here. Use the dropdown above to load a deployed
                  definition from the engine, or deploy this canvas as a new revision.
                </div>
              </div>
            </div>
          )}
          {sel && (
            <>
              <div className="form-row">
                <label>
                  Name <span className="mono">bpmn:name</span>
                </label>
                <input
                  className="input"
                  key={sel.id + ":name:" + version}
                  defaultValue={(bo && bo.name) || ""}
                  onBlur={(e) => updateName(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label>
                  ID <span className="mono">XML id</span>
                </label>
                <input
                  className="input mono"
                  value={sel.id}
                  readOnly
                  style={{ fontFamily: "var(--font-mono)", opacity: 0.7 }}
                />
              </div>

              {/* Event-definition fields (signal / message / timer / error) —
                  render for ANY event element carrying an eventDefinition,
                  before the kind-specific Flowable fields below. Standard BPMN
                  refs/expressions, editable + lossless round-trip. */}
              {eventDefFields()}

              {/* Story 30.1 — element-type-aware Flowable field dispatch.
                  Inline switch on bpmnKind (CLAUDE.md tab-aware dispatch); each
                  arm renders the FR-38 coverage-table field set, all wired to
                  the registered flowable moddle descriptor for lossless round-
                  trip. */}
              {kind === "UserTask" && (
                <>
                  {textField("assignee", "Assignee", "${initiator}")}
                  {textField("candidateUsers", "Candidate users")}
                  {textField("candidateGroups", "Candidate groups")}
                  {textField("formKey", "Form key")}
                  {textField("dueDate", "Due date", "P2D")}
                  {textField("priority", "Priority", "50")}
                  {boolField("async", "Run asynchronously")}
                  {boolField("exclusive", "Exclusive")}
                  {boolField("asyncLeave", "Async (on leave)")}
                  {taskListeners()}
                  {execListeners()}
                </>
              )}
              {kind === "ServiceTask" && (
                <>
                  {textField("class", "Class", "com.acme.MyDelegate")}
                  {textField("expression", "Expression", "${myBean.method()}")}
                  {textField("delegateExpression", "Delegate expression", "${myDelegate}")}
                  {textField("type", "Built-in type", "http")}
                  {textField("resultVariableName", "Result variable")}
                  {fieldInjection()}
                  {boolField("async", "Run asynchronously")}
                  {boolField("exclusive", "Exclusive")}
                  {boolField("asyncLeave", "Async (on leave)")}
                  {execListeners()}
                </>
              )}
              {kind === "ScriptTask" && (
                <>
                  {textField("resultVariable", "Result variable")}
                  {boolField("async", "Run asynchronously")}
                  {boolField("exclusive", "Exclusive")}
                  {boolField("asyncLeave", "Async (on leave)")}
                  {execListeners()}
                </>
              )}
              {kind === "CallActivity" && (
                <>
                  {textField("calledElementType", "Called element type", "key")}
                  {textField("businessKey", "Business key")}
                  {boolField("inheritBusinessKey", "Inherit business key")}
                  {inOutMappings()}
                  {boolField("async", "Run asynchronously")}
                  {boolField("exclusive", "Exclusive")}
                  {boolField("asyncLeave", "Async (on leave)")}
                  {execListeners()}
                </>
              )}
              {kind === "BusinessRuleTask" && (
                <>
                  {textField("class", "Class")}
                  {textField("expression", "Expression")}
                  {textField("delegateExpression", "Delegate expression")}
                  {textField("resultVariableName", "Result variable")}
                  {boolField("async", "Run asynchronously")}
                  {boolField("exclusive", "Exclusive")}
                  {boolField("asyncLeave", "Async (on leave)")}
                  {execListeners()}
                </>
              )}
              {kind === "StartEvent" && (
                <>
                  {textField("formKey", "Form key")}
                  {textField("initiator", "Initiator")}
                  {execListeners()}
                </>
              )}
              {kind === "SequenceFlow" && (
                <>
                  {conditionField()}
                  {execListeners(["take"])}
                </>
              )}

              <div className="drawer-sect">REST</div>
              <div className="code" style={{ whiteSpace: "pre-wrap" }}>
                {`GET  /repository/process-definitions/{id}/model
GET  /runtime/process-instances?processDefinitionKey=loanApproval&activityId=${sel.id}
POST /runtime/process-instances`}
              </div>
            </>
          )}
        </div>
      </div>
      <DeployBpmnModal
        target={deployTarget}
        onConfirm={doDeploy}
        onClose={() => setDeployTarget(null)}
        triggerRef={deployTarget?.lockKey ? saveVersionBtnRef : deployBtnRef}
      />
    </div>
  );
};
