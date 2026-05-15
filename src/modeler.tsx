import BpmnModelerClass from "bpmn-js/lib/Modeler";
// @migration-any: dmn-js has no shipped .d.ts; the default export is treated as
// a constructor and all event-bus / DI container interactions are `any`. ADR-001
// explicitly allows this for the modeler wrappers. Future: file an upstream issue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// @ts-expect-error — dmn-js/lib/Modeler has no type declarations
import DmnModelerClass from "dmn-js/lib/Modeler";
import React from "react";
import { api, type FlowableProcessDefinition } from "./api";
import { Icon } from "./components";
import DATA from "./data";

// @migration-any: bpmn-js/dmn-js DI container, event-bus payloads, and BO
// shapes are dynamic. Per ADR-001 consequences, this file is the allowed
// `any` zone — every cast below is documented at use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

// Minimal blank BPMN starter — used when the user hasn't selected an existing
// process definition to edit. The real LOAN_BPMN_XML below is kept as a richer
// starter for "New from template".
const BLANK_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:flowable="http://flowable.org/bpmn"
                  id="Definitions_blank" targetNamespace="http://flowable.org/bpmn">
  <bpmn:process id="newProcess" name="New process" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="newProcess">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="180" width="36" height="36"/>
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// ─── Initial diagram XMLs ───────────────────────────────────────────
const LOAN_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  xmlns:flowable="http://flowable.org/bpmn"
                  id="Definitions_1" targetNamespace="http://flowable.org/bpmn">
  <bpmn:process id="loanApproval" name="Loan Approval" isExecutable="true">
    <bpmn:startEvent id="Start_1" name="Application received">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="Task_Credit" name="Run credit check" flowable:class="com.acme.loan.CreditCheckDelegate">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_Credit" />
    <bpmn:businessRuleTask id="Task_Eligibility" name="Loan eligibility (DMN)" flowable:decisionRef="loanEligibility">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:businessRuleTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_Credit" targetRef="Task_Eligibility" />
    <bpmn:exclusiveGateway id="Gateway_1" name="Decision?">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_Approve</bpmn:outgoing>
      <bpmn:outgoing>Flow_Review</bpmn:outgoing>
      <bpmn:outgoing>Flow_Reject</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_Eligibility" targetRef="Gateway_1" />
    <bpmn:userTask id="Task_Review" name="Manager review" flowable:candidateGroups="loan-officers,managers" flowable:formKey="loanReviewForm">
      <bpmn:incoming>Flow_Review</bpmn:incoming>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_Review" name="review" sourceRef="Gateway_1" targetRef="Task_Review">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${decision == "review"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:endEvent id="End_Approve" name="Approved">
      <bpmn:incoming>Flow_Approve</bpmn:incoming>
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Approve" name="approve" sourceRef="Gateway_1" targetRef="End_Approve">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${decision == "approve"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Task_Review" targetRef="End_Approve" />
    <bpmn:endEvent id="End_Reject" name="Rejected">
      <bpmn:incoming>Flow_Reject</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_Reject" name="reject" sourceRef="Gateway_1" targetRef="End_Reject">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\${decision == "reject"}</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="loanApproval">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="160" y="220" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="138" y="263" width="80" height="27" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Credit_di" bpmnElement="Task_Credit">
        <dc:Bounds x="250" y="198" width="110" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Eligibility_di" bpmnElement="Task_Eligibility">
        <dc:Bounds x="400" y="198" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true">
        <dc:Bounds x="565" y="213" width="50" height="50" />
        <bpmndi:BPMNLabel><dc:Bounds x="556" y="183" width="68" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Review_di" bpmnElement="Task_Review">
        <dc:Bounds x="660" y="320" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_Approve_di" bpmnElement="End_Approve">
        <dc:Bounds x="860" y="220" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="852" y="263" width="52" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_Reject_di" bpmnElement="End_Reject">
        <dc:Bounds x="572" y="100" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="567" y="74" width="46" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="238" /><di:waypoint x="250" y="238" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="360" y="238" /><di:waypoint x="400" y="238" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="520" y="238" /><di:waypoint x="565" y="238" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Approve_di" bpmnElement="Flow_Approve">
        <di:waypoint x="615" y="238" /><di:waypoint x="860" y="238" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Review_di" bpmnElement="Flow_Review">
        <di:waypoint x="590" y="263" /><di:waypoint x="590" y="360" /><di:waypoint x="660" y="360" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Reject_di" bpmnElement="Flow_Reject">
        <di:waypoint x="590" y="213" /><di:waypoint x="590" y="136" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_4_di" bpmnElement="Flow_4">
        <di:waypoint x="780" y="360" /><di:waypoint x="878" y="360" /><di:waypoint x="878" y="256" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const LOAN_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/"
             xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/"
             xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/"
             id="Definitions_loan" name="Loan Decisions" namespace="http://flowable.org/dmn">
  <inputData id="iCreditScore" name="Credit Score" />
  <inputData id="iIncome" name="Annual Income" />
  <inputData id="iEmployment" name="Employment" />
  <knowledgeSource id="ksPolicy" name="Lending Policy v4" />
  <decision id="riskTier" name="Risk Tier">
    <informationRequirement><requiredInput href="#iCreditScore" /></informationRequirement>
    <informationRequirement><requiredInput href="#iIncome" /></informationRequirement>
    <authorityRequirement><requiredAuthority href="#ksPolicy" /></authorityRequirement>
    <decisionTable id="DT_risk" hitPolicy="UNIQUE">
      <input id="ri_score" label="Credit Score"><inputExpression id="rie_score" typeRef="number"><text>creditScore</text></inputExpression></input>
      <input id="ri_income" label="Income"><inputExpression id="rie_income" typeRef="number"><text>income</text></inputExpression></input>
      <output id="ro_tier" label="Tier" typeRef="string" />
      <rule id="rr1"><inputEntry id="rr1i1"><text>&gt;= 800</text></inputEntry><inputEntry id="rr1i2"><text>&gt;= 75000</text></inputEntry><outputEntry id="rr1o1"><text>"A"</text></outputEntry></rule>
      <rule id="rr2"><inputEntry id="rr2i1"><text>[700..800)</text></inputEntry><inputEntry id="rr2i2"><text>&gt;= 60000</text></inputEntry><outputEntry id="rr2o1"><text>"B"</text></outputEntry></rule>
      <rule id="rr3"><inputEntry id="rr3i1"><text>[600..700)</text></inputEntry><inputEntry id="rr3i2"><text>-</text></inputEntry><outputEntry id="rr3o1"><text>"C"</text></outputEntry></rule>
      <rule id="rr4"><inputEntry id="rr4i1"><text>&lt; 600</text></inputEntry><inputEntry id="rr4i2"><text>-</text></inputEntry><outputEntry id="rr4o1"><text>"D"</text></outputEntry></rule>
    </decisionTable>
  </decision>
  <decision id="loanEligibility" name="Loan Eligibility">
    <informationRequirement><requiredDecision href="#riskTier" /></informationRequirement>
    <informationRequirement><requiredInput href="#iEmployment" /></informationRequirement>
    <decisionTable id="DT_elig" hitPolicy="FIRST">
      <input id="i_tier" label="Risk Tier"><inputExpression id="ie_tier" typeRef="string"><text>tier</text></inputExpression></input>
      <input id="i_emp" label="Employment"><inputExpression id="ie_emp" typeRef="string"><text>employmentStatus</text></inputExpression></input>
      <output id="o_decision" label="Decision" typeRef="string" />
      <output id="o_rate" label="Rate" typeRef="number" />
      <rule id="re1"><inputEntry id="re1i1"><text>"A"</text></inputEntry><inputEntry id="re1i2"><text>"employed"</text></inputEntry><outputEntry id="re1o1"><text>"approve"</text></outputEntry><outputEntry id="re1o2"><text>0.0425</text></outputEntry></rule>
      <rule id="re2"><inputEntry id="re2i1"><text>"B"</text></inputEntry><inputEntry id="re2i2"><text>"employed","self-employed"</text></inputEntry><outputEntry id="re2o1"><text>"review"</text></outputEntry><outputEntry id="re2o2"><text>0.0525</text></outputEntry></rule>
      <rule id="re3"><inputEntry id="re3i1"><text>"C"</text></inputEntry><inputEntry id="re3i2"><text>"employed"</text></inputEntry><outputEntry id="re3o1"><text>"review"</text></outputEntry><outputEntry id="re3o2"><text>0.0675</text></outputEntry></rule>
      <rule id="re4"><inputEntry id="re4i1"><text>-</text></inputEntry><inputEntry id="re4i2"><text>-</text></inputEntry><outputEntry id="re4o1"><text>"reject"</text></outputEntry><outputEntry id="re4o2"><text>null</text></outputEntry></rule>
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DMNDiagram_1">
      <dmndi:DMNShape id="shape_risk" dmnElementRef="riskTier"><dc:Bounds x="240" y="160" width="180" height="80" /></dmndi:DMNShape>
      <dmndi:DMNShape id="shape_elig" dmnElementRef="loanEligibility"><dc:Bounds x="240" y="40" width="180" height="80" /></dmndi:DMNShape>
      <dmndi:DMNShape id="shape_score" dmnElementRef="iCreditScore"><dc:Bounds x="60" y="320" width="160" height="60" /></dmndi:DMNShape>
      <dmndi:DMNShape id="shape_income" dmnElementRef="iIncome"><dc:Bounds x="240" y="320" width="160" height="60" /></dmndi:DMNShape>
      <dmndi:DMNShape id="shape_emp" dmnElementRef="iEmployment"><dc:Bounds x="440" y="320" width="160" height="60" /></dmndi:DMNShape>
      <dmndi:DMNShape id="shape_ks" dmnElementRef="ksPolicy"><dc:Bounds x="500" y="170" width="160" height="60" /></dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;

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

interface ModelerProps {
  onOpenInspector?: (e: { method: string; path: string; desc: string }) => void;
}

// ─── BPMN modeler (real bpmn-js) ───────────────────────────────────
export const BpmnModeler = ({ onOpenInspector }: ModelerProps) => {
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
  const eps = DATA.endpoints.bpmnModeler;

  // Load list of deployed process definitions for the loader dropdown
  React.useEffect(() => {
    api
      .listProcessDefinitions({ size: 200, sort: "name" })
      .then((r) => setDefinitions(r.data || []))
      .catch(() => setDefinitions([]));
  }, []);

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
        refreshOutline();
      })
      .catch((e: Error) => setError(String(e.message || e)));

    const bus = m.get("eventBus");
    const onSel = (e: AnyEl) => {
      const els = e.newSelection || [];
      setSelected(els.length === 1 ? els[0] : null);
      setVersion((v) => v + 1);
    };
    const onChange = () => {
      setDirty(true);
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

  const loadDefinition = async (id: string) => {
    if (!id) {
      setActiveDef(null);
      const m = modelerRef.current;
      if (m)
        await m.importXML(BLANK_BPMN_XML).catch((e: Error) => setError(String(e.message || e)));
      setDirty(false);
      setFilename("new-process.bpmn20.xml");
      return;
    }
    const def = definitions.find((d) => d.id === id);
    setActiveDef(def || null);
    setFilename((def?.key || "process") + ".bpmn20.xml");
    try {
      const xml = await api.getProcessDefinitionResource(id);
      const m = modelerRef.current;
      if (m) {
        await m.importXML(xml);
        try {
          m.get("canvas").zoom("fit-viewport", "auto");
        } catch {}
        setDirty(false);
        setError(null);
      }
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
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
  const deploy = async () => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const { xml } = await m.saveXML({ format: true });
      await api.deployBpmn(filename, xml);
      setDirty(false);
      if (onOpenInspector)
        onOpenInspector({ method: "POST", path: "/repository/deployments", desc: "Deploy BPMN" });
      // refresh definition list
      api
        .listProcessDefinitions({ size: 200, sort: "name" })
        .then((r) => setDefinitions(r.data || []))
        .catch(() => {});
    } catch (e) {
      setError(`Deploy failed: ${(e as Error)?.message || e}`);
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
          className="select"
          data-size="sm"
          value={activeDef?.id || ""}
          onChange={(e) => loadDefinition(e.target.value)}
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
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="save" size={13} />
          Save
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={deploy}>
          <Icon name="upload" size={13} />
          Deploy
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export XML
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveSVG}>
          <Icon name="download" size={13} />
          Export SVG
        </button>
        <button
          className="btn"
          data-size="sm"
          data-variant="ghost"
          onClick={() => {
            if (onOpenInspector && eps[0]) onOpenInspector(eps[0]);
          }}
        >
          <Icon name="api" size={13} />
          REST
        </button>
        <div className="spacer" />
        <div className="seg-row" style={{ margin: 0 }}>
          <button className="seg-btn" onClick={() => zoom(-1)} title="Zoom out">
            −
          </button>
          <button className="seg-btn" onClick={() => zoom("fit")} title="Fit">
            ⤢
          </button>
          <button className="seg-btn" onClick={() => zoom(1)} title="Zoom in">
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
                <div
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
                </div>
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
                        className="seg-btn"
                        data-on={!bo.async ? "1" : "0"}
                        onClick={() => updateExtAttr("async", false)}
                      >
                        No
                      </button>
                      <button
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

// ─── DMN modeler (real dmn-js) ─────────────────────────────────────
type DmnDecision = import("./api").FlowableDecision;
type DmnDecisionResult = import("./api").FlowableDecisionResult & {
  resultVariables?: Record<string, unknown>;
  ruleFired?: number[];
};

export const DmnModeler = ({ onOpenInspector }: ModelerProps) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [view, setView] = React.useState<"drd" | "table">("table");
  const [error, setError] = React.useState<string | null>(null);
  const [testInputs, setTestInputs] = React.useState<{
    creditScore: number;
    income: number;
    employmentStatus: string;
  }>({
    creditScore: 742,
    income: 86000,
    employmentStatus: "employed",
  });
  const [testResult, setTestResult] = React.useState<DmnDecisionResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [decisions, setDecisions] = React.useState<DmnDecision[]>([]);
  const [decisionsAvailable, setDecisionsAvailable] = React.useState(true);
  const filename = "loan-eligibility.dmn";
  const eps = DATA.endpoints.dmnModeler;

  React.useEffect(() => {
    api
      .listDecisions({ size: 200 })
      .then((r) => setDecisions(r.data || []))
      .catch(() => setDecisionsAvailable(false));
  }, []);

  React.useEffect(() => {
    let m: AnyModeler;
    try {
      m = new DmnModelerClass({
        container: containerRef.current as HTMLElement,
        keyboard: { bindTo: window },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    modelerRef.current = m;
    m.importXML(LOAN_DMN_XML)
      .then(() => {
        try {
          const views = m.getViews();
          const drdView = views.find((v: AnyEl) => v.type === "drd");
          if (drdView) m.open(drdView);
          setView("drd");
          setTimeout(() => {
            const elig = views.find((v: AnyEl) => v.element && v.element.id === "loanEligibility");
            if (elig) {
              m.open(elig);
              setView("table");
            }
          }, 50);
        } catch (e) {
          console.warn(e);
        }
      })
      .catch((e: Error) => setError(String(e.message || e)));
    return () => {
      try {
        m.destroy();
      } catch {}
      modelerRef.current = null;
    };
  }, []);

  const switchView = (which: "drd" | "table") => {
    const m = modelerRef.current;
    if (!m) return;
    const views = m.getViews();
    if (which === "drd") {
      const v = views.find((x: AnyEl) => x.type === "drd");
      if (v) {
        m.open(v);
        setView("drd");
      }
    } else {
      const v =
        views.find((x: AnyEl) => x.element && x.element.id === "loanEligibility") ||
        views.find((x: AnyEl) => x.type === "decisionTable");
      if (v) {
        m.open(v);
        setView("table");
      }
    }
  };

  const saveXML = async () => {
    const m = modelerRef.current;
    if (!m) return;
    const { xml } = await m.saveXML({ format: true });
    download(filename, xml, "application/xml");
  };
  const deploy = async () => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const { xml } = await m.saveXML({ format: true });
      await api.deployDmn(filename, xml);
      if (onOpenInspector)
        onOpenInspector({
          method: "POST",
          path: "/dmn-repository/deployments",
          desc: "Deploy DMN",
        });
      api
        .listDecisions({ size: 200 })
        .then((r) => setDecisions(r.data || []))
        .catch(() => {});
    } catch (e) {
      setError(`Deploy failed: ${(e as Error)?.message || e}`);
    }
  };

  const runTest = async () => {
    setRunning(true);
    try {
      const r = (await api.executeDecision({
        decisionKey: "loanEligibility",
        variables: testInputs,
      })) as DmnDecisionResult;
      setTestResult(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modeler" data-engine="real">
      <div className="mod-toolbar">
        <div className="file-name">
          <Icon name="dmn" size={14} />
          <b>{filename}</b>
          {!decisionsAvailable && (
            <span style={{ color: "var(--warn)", fontSize: 11 }}>· DMN engine unavailable</span>
          )}
          {decisionsAvailable && decisions.length > 0 && (
            <span style={{ color: "var(--fg-mute)" }}>· {decisions.length} deployed</span>
          )}
        </div>
        <div className="sep" />
        <div className="seg-row" style={{ margin: 0 }}>
          <button
            className="seg-btn"
            data-on={view === "table" ? "1" : "0"}
            onClick={() => switchView("table")}
          >
            Decision table
          </button>
          <button
            className="seg-btn"
            data-on={view === "drd" ? "1" : "0"}
            onClick={() => switchView("drd")}
          >
            DRD
          </button>
        </div>
        <div className="sep" />
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="save" size={13} />
          Save
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={deploy}>
          <Icon name="upload" size={13} />
          Deploy
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export
        </button>
        <button
          className="btn"
          data-size="sm"
          data-variant="ghost"
          onClick={() => {
            if (onOpenInspector && eps[0]) onOpenInspector(eps[0]);
          }}
        >
          <Icon name="api" size={13} />
          REST
        </button>
        <div className="spacer" />
      </div>

      <div className="mod-canvas">
        <div ref={containerRef} className="dmn-host" style={{ width: "100%", height: "100%" }} />
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
          <span className="panel-title">Test runner</span>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            POST /dmn-rule/execute
          </span>
        </div>
        <div style={{ padding: 14, overflowY: "auto" }}>
          <div className="form-row">
            <label>Credit Score</label>
            <input
              className="input mono"
              value={testInputs.creditScore}
              onChange={(e) =>
                setTestInputs({ ...testInputs, creditScore: Number(e.target.value) })
              }
            />
          </div>
          <div className="form-row">
            <label>Annual Income</label>
            <input
              className="input mono"
              value={testInputs.income}
              onChange={(e) => setTestInputs({ ...testInputs, income: Number(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Employment</label>
            <select
              className="select"
              value={testInputs.employmentStatus}
              onChange={(e) => setTestInputs({ ...testInputs, employmentStatus: e.target.value })}
            >
              <option value="employed">employed</option>
              <option value="self-employed">self-employed</option>
              <option value="unemployed">unemployed</option>
            </select>
          </div>
          <button
            className="btn"
            data-variant="primary"
            disabled={running}
            onClick={runTest}
            style={{ width: "100%" }}
          >
            <Icon name="play" size={13} />
            {running ? "Running…" : "Run decision"}
          </button>

          {testResult && (
            <>
              <div className="drawer-sect">Result</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(testResult.resultVariables || {}).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--bg-sunken)",
                      borderRadius: 6,
                      border: "1px solid var(--line)",
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                      {k}
                    </span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
              {testResult.ruleFired && (
                <div className="mt-3" style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                  Matched:{" "}
                  <span className="badge" data-tone="info">
                    {testResult.ruleFired}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="drawer-sect">Engine</div>
          <div className="code" style={{ whiteSpace: "pre-wrap" }}>
            {`bpmn-js  17.11.1   apache 2.0  bpmn.io
dmn-js   16.6.1    apache 2.0  bpmn.io
target   Flowable 7 REST API`}
          </div>
        </div>
      </div>
    </div>
  );
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
