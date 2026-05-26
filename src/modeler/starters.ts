// SPDX-License-Identifier: Apache-2.0

/**
 * Embedded starter XMLs for BPMN + DMN modelers.
 *
 * BLANK_BPMN_XML — minimal process used by "New from scratch" (Story 16.3).
 * LOAN_BPMN_XML  — full-featured BPMN demo (gateways, user task, etc.) —
 *                  default loaded when no real definition is selected.
 * LOAN_DMN_XML   — full-featured DMN demo (riskTier + loanEligibility
 *                  with DRD) — default loaded by DmnModeler (Story 16.4).
 *
 * Extracted from src/modeler.tsx by Story 16.1 (Epic 16) — VERBATIM copies
 * of the original constants. Do not edit casually; the BPMN / DMN XMLs are
 * known-good per the embedded `bpmn-js` / `dmn-js` validators.
 */

// Minimal blank BPMN starter — used when the user hasn't selected an existing
// process definition to edit. The real LOAN_BPMN_XML below is kept as a richer
// starter for "New from template".
export const BLANK_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
export const LOAN_BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
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

export const LOAN_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
