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

import { useNavigate } from "@tanstack/react-router";
import BpmnModelerClass from "bpmn-js/lib/Modeler";
import type EventBus from "diagram-js/lib/core/EventBus";
import React from "react";
import { api, type FlowableProcessDefinition } from "../api";
import { Icon, toast } from "../components";
import { BLANK_BPMN_XML, LOAN_BPMN_XML } from "./starters";

const openInspector = () => {
  window.dispatchEvent(new CustomEvent<void>("app:open-inspector"));
};

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

// ─── BPMN modeler (real bpmn-js) ───────────────────────────────────
export const BpmnModeler = ({ initialDefinitionId }: BpmnModelerProps) => {
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [selected, setSelected] = React.useState<AnyEl | null>(null);
  const [elements, setElements] = React.useState<AnyEl[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);
  const [definitions, setDefinitions] = React.useState<FlowableProcessDefinition[]>([]);
  const [activeDef, setActiveDef] = React.useState<FlowableProcessDefinition | null>(null);
  const [filename, setFilename] = React.useState("loan-approval.bpmn20.xml");

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

  React.useEffect(() => {
    let m: AnyModeler;
    try {
      // @migration-any: bpmn-js constructor accepts `container: HTMLElement`.
      m = new BpmnModelerClass({
        container: containerRef.current as HTMLElement,
        keyboard: { bindTo: window },
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

    function refreshOutline() {
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
    }

    return () => {
      try {
        m.destroy();
      } catch {}
      modelerRef.current = null;
    };
  }, []);

  // Story 16.2 AC-3: every import is followed by zoom-to-fit + dirty reset.
  // Centralizing this means we cannot drift across the multiple import sites
  // (mount, dropdown pick, "New from scratch" in Story 16.3).
  const importAndFit = React.useCallback(async (xml: string) => {
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
  }, []);

  const loadDefinition = async (id: string) => {
    if (!id) {
      setActiveDef(null);
      try {
        await importAndFit(BLANK_BPMN_XML);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
      setFilename("new-process.bpmn20.xml");
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
  const updateExtAttr = (attr: string, val: unknown) => {
    const m = modelerRef.current;
    if (!m || !selected) return;
    const modeling = m.get("modeling");
    const props: Record<string, unknown> = {};
    props[attr] = val;
    try {
      modeling.updateProperties(selected, props);
    } catch {
      (selected.businessObject as Record<string, unknown>)[attr] = val;
      setVersion((v) => v + 1);
    }
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
  // Story 16.3 AC-2 + AC-3: Deploy exports XML, deploys via api.deployBpmn,
  // resets dirty + surfaces a success toast with an "Open the deployed
  // definition" action. Flowable's FlowableDeployment DTO does NOT carry an
  // inline `definitions[]` field (verified at T-1.3 against the live engine),
  // so we follow up with `api.listProcessDefinitions({deploymentId, latest})`
  // to discover the new definition's id for the Open action.
  const deploy = async () => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const { xml } = await m.saveXML({ format: true });
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
      // Discover the new definition (single-file deploy → latest definition
      // for this deploymentId). The lookup is independent of the dropdown
      // refresh so the toast doesn't wait for the longer 200-row scan.
      const newDef = await api
        .listProcessDefinitions({ deploymentId: deployment.id, latest: true, size: 1 })
        .then((r) => r.data?.[0] || null)
        .catch(() => null);
      // Wait for the dropdown refresh to land BEFORE the operator clicks
      // Open — that way activeDef can immediately resolve via the local
      // definitions list when the URL-driven autoload fires.
      await refresh;
      if (newDef) {
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
        // Defensive: if the lookup fails (engine momentarily inconsistent),
        // show a plain success toast.
        toast({
          kind: "success",
          text: `Deployed ${deployment.name} (${deployment.id}).`,
          sub: "Refresh /definitions to see the new revision.",
        });
      }
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      setError(`Deploy failed: ${msg}`);
      toast({ kind: "error", text: `Deploy failed: ${msg}` });
    }
  };

  // Story 16.3 AC-1: "New from scratch" — confirm-on-dirty, load BLANK,
  // clear ?definitionId= so the URL no longer points at any deployed def.
  const handleNew = async () => {
    if (dirty) {
      const ok = window.confirm("You have unsaved changes. Discard and start a new BPMN?");
      if (!ok) return;
    }
    setActiveDef(null);
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

  return (
    <div className="modeler" data-engine="real">
      <div className="mod-toolbar">
        <div className="file-name">
          <Icon name="bpmn" size={14} />
          <b>{filename}</b>
          {activeDef && (
            <span style={{ color: "var(--fg-mute)" }}>
              · {activeDef.key} v{activeDef.version}
              {activeDef.tenantId ? ` · tenant: ${activeDef.tenantId}` : ""}
            </span>
          )}
          {dirty && <span style={{ color: "var(--warn)" }}>· unsaved</span>}
        </div>
        <div className="sep" />
        <select
          className="select modeler-dropdown"
          data-testid="bpmn-definition-dropdown"
          data-size="sm"
          value={activeDef?.id || ""}
          onChange={(e) => handleDropdownChange(e.target.value, activeDef?.id || "")}
          title="Load deployed definition"
        >
          <option value="">— template (loan-approval) —</option>
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
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="save" size={13} />
          Save
        </button>
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-deploy"
          data-tone={dirty ? "warn" : undefined}
          onClick={deploy}
        >
          <Icon name="upload" size={13} />
          {dirty ? "Deploy *" : "Deploy"}
        </button>
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export XML
        </button>
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveSVG}>
          <Icon name="download" size={13} />
          Export SVG
        </button>
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          onClick={openInspector}
        >
          <Icon name="api" size={13} />
          REST
        </button>
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
            style={{
              position: "absolute",
              inset: 20,
              background: "var(--bg-elev)",
              border: "1px solid var(--bad)",
              padding: 16,
              borderRadius: 8,
              color: "var(--bad)",
            }}
            className="mono"
          >
            {error}
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

              {bpmnKind(sel) === "UserTask" && (
                <>
                  <div className="form-row">
                    <label>
                      Assignee <span className="mono">flowable:assignee</span>
                    </label>
                    <input
                      className="input mono"
                      key={sel.id + ":asg:" + version}
                      defaultValue={bo.assignee || ""}
                      placeholder="${initiator}"
                      onBlur={(e) => updateExtAttr("assignee", e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>
                      Candidate groups <span className="mono">flowable:candidateGroups</span>
                    </label>
                    <input
                      className="input mono"
                      key={sel.id + ":cg:" + version}
                      defaultValue={bo.candidateGroups || ""}
                      onBlur={(e) => updateExtAttr("candidateGroups", e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>
                      Form key <span className="mono">flowable:formKey</span>
                    </label>
                    <input
                      className="input mono"
                      key={sel.id + ":fk:" + version}
                      defaultValue={bo.formKey || ""}
                      onBlur={(e) => updateExtAttr("formKey", e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>
                      Due date <span className="mono">flowable:dueDate · ISO</span>
                    </label>
                    <input
                      className="input mono"
                      key={sel.id + ":dd:" + version}
                      defaultValue={bo.dueDate || ""}
                      placeholder="P2D"
                      onBlur={(e) => updateExtAttr("dueDate", e.target.value)}
                    />
                  </div>
                </>
              )}
              {bpmnKind(sel) === "ServiceTask" && (
                <>
                  <div className="form-row">
                    <label>Implementation</label>
                    <select className="select" defaultValue="class">
                      <option value="class">Java delegate (class)</option>
                      <option value="expression">Expression</option>
                      <option value="delegateExpression">Delegate expression</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label>
                      Class <span className="mono">flowable:class</span>
                    </label>
                    <input
                      className="input mono"
                      key={sel.id + ":cls:" + version}
                      defaultValue={bo.class || ""}
                      placeholder="com.acme…"
                      onBlur={(e) => updateExtAttr("class", e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>
                      Async <span className="mono">flowable:async</span>
                    </label>
                    <div className="seg-row">
                      <button
                        type="button"
                        className="seg-btn"
                        data-on={!bo.async ? "1" : "0"}
                        onClick={() => updateExtAttr("async", false)}
                      >
                        No
                      </button>
                      <button
                        type="button"
                        className="seg-btn"
                        data-on={bo.async ? "1" : "0"}
                        onClick={() => updateExtAttr("async", true)}
                      >
                        Yes
                      </button>
                    </div>
                  </div>
                </>
              )}
              {bpmnKind(sel) === "BusinessRuleTask" && (
                <>
                  <div className="form-row">
                    <label>
                      Decision ref <span className="mono">flowable:decisionRef</span>
                    </label>
                    <input
                      className="input mono"
                      key={sel.id + ":dr:" + version}
                      defaultValue={bo.decisionRef || ""}
                      onBlur={(e) => updateExtAttr("decisionRef", e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label>Result variable</label>
                    <input className="input mono" placeholder="decision" />
                  </div>
                </>
              )}
              {bpmnKind(sel) === "ExclusiveGateway" && (
                <div className="form-row">
                  <label>Default flow</label>
                  <input className="input mono" placeholder="Flow_…" />
                </div>
              )}
              {bpmnKind(sel) === "SequenceFlow" && (
                <div className="form-row">
                  <label>
                    Condition <span className="mono">bpmn:conditionExpression</span>
                  </label>
                  <textarea
                    className="textarea mono"
                    key={sel.id + ":cond:" + version}
                    defaultValue={(bo.conditionExpression && bo.conditionExpression.body) || ""}
                    placeholder={'${decision == "approve"}'}
                  />
                </div>
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
    </div>
  );
};
