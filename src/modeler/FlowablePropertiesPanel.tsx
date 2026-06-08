// SPDX-License-Identifier: Apache-2.0

/**
 * Story 30.1 — Flowable BPMN properties panel.
 *
 * The `.mod-props` panel (Outline + per-element editable fields) extracted
 * from BpmnModeler.tsx for the NFR-21 file-size gate. Owns the moddle
 * read/write helpers (simple flowable: attrs + nested extensionElements via
 * the bpmn-js command stack), the element-type-aware field dispatch, the
 * SequenceFlow condition + event-definition (signal/message/timer/error)
 * fields, and the Process-level Outline section. The parent passes the live
 * modeler ref + the current selection + a re-render bump.
 */

import React from "react";
import {
  EXEC_LISTENER_EVENTS,
  FieldInjectionEditor,
  InOutEditor,
  ListenerEditor,
  TASK_LISTENER_EVENTS,
} from "./ExtensionEditors";
import {
  type AnyEl,
  type EventDefSvc,
  eventDefKind,
  firstEventDef,
  setEventRefAttr,
  setTimerDef,
  type TimerKind,
  timerKindOf,
  timerValueOf,
} from "./event-defs";

// @migration-any: bpmn-js DI container is dynamic (ADR-001 allowed zone).
// biome-ignore lint/suspicious/noExplicitAny: bpmn-js modeler instance is untyped
type AnyModeler = any;

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

interface FlowablePropertiesPanelProps {
  modelerRef: React.MutableRefObject<AnyModeler | null>;
  selected: AnyEl | null;
  version: number;
  bumpVersion: () => void;
  elements: AnyEl[];
}

export const FlowablePropertiesPanel = ({
  modelerRef,
  selected,
  version,
  bumpVersion,
  elements,
}: FlowablePropertiesPanelProps) => {
  const sel = selected;
  const bo = sel && sel.businessObject;
  const kind = sel ? bpmnKind(sel) : "";

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
      bumpVersion();
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
    bumpVersion();
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
    bumpVersion();
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
    bumpVersion();
  };

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
      bumpVersion();
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
    bumpVersion();
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
    bumpVersion();
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
                onClick={() => modelerRef.current && modelerRef.current.get("selection").select(el)}
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
  );
};
