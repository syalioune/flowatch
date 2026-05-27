// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { LOAN_DMN_XML } from "../../modeler/starters";
import { parseDmnDecision } from "../dmn-parser";

describe("parseDmnDecision", () => {
  it("returns an error on empty input", () => {
    expect(parseDmnDecision("", "x")).toEqual({ ok: false, message: "Empty XML." });
    expect(parseDmnDecision("   ", "x")).toEqual({ ok: false, message: "Empty XML." });
  });

  it("returns an error on malformed XML", () => {
    const out = parseDmnDecision("<broken", "loanEligibility");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/parse failed/i);
  });

  it("returns an error when the decision id is not present", () => {
    const out = parseDmnDecision(LOAN_DMN_XML, "doesNotExist");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/not found/i);
  });

  it("parses the LOAN starter's loanEligibility — inputs, requirements, hit policy", () => {
    const out = parseDmnDecision(LOAN_DMN_XML, "loanEligibility");
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    expect(out.decisionId).toBe("loanEligibility");
    expect(out.decisionName).toBe("Loan Eligibility");
    expect(out.hitPolicy).toBe("FIRST");

    expect(out.inputs).toEqual([
      { name: "tier", label: "Risk Tier", type: "string", isComplex: false, expression: "tier" },
      {
        name: "employmentStatus",
        label: "Employment",
        type: "string",
        isComplex: false,
        expression: "employmentStatus",
      },
    ]);

    // Two information requirements: a decision dependency (riskTier) and
    // an inputData dependency (iEmployment, label-resolved to "Employment").
    expect(out.requirements).toEqual([
      { kind: "decision", ref: "riskTier", label: "Risk Tier" },
      { kind: "input", ref: "iEmployment", label: "Employment" },
    ]);
  });

  it("resolves authorityRequirement labels and exposes complex JUEL expressions", () => {
    const out = parseDmnDecision(LOAN_DMN_XML, "riskTier");
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // riskTier carries an authorityRequirement to ksPolicy ("Lending Policy v4").
    expect(out.requirements).toContainEqual({
      kind: "authority",
      ref: "ksPolicy",
      label: "Lending Policy v4",
    });

    // Both inputs use simple identifiers — no complex flag.
    expect(out.inputs.every((i) => i.isComplex === false)).toBe(true);
    expect(out.inputs.map((i) => i.name)).toEqual(["creditScore", "income"]);
    expect(out.inputs.every((i) => i.type === "number")).toBe(true);
  });

  it("flags complex JUEL expressions via isComplex", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D" name="D" namespace="http://x">
  <decision id="d1" name="Decision One">
    <decisionTable id="dt" hitPolicy="UNIQUE">
      <input id="i1" label="Score x 1.1"><inputExpression id="ie1" typeRef="number"><text>creditScore * 1.1</text></inputExpression></input>
      <output id="o1" name="ok" typeRef="boolean" />
      <rule id="r1"><inputEntry id="r1i1"><text>&gt;= 100</text></inputEntry><outputEntry id="r1o1"><text>true</text></outputEntry></rule>
    </decisionTable>
  </decision>
</definitions>`;
    const out = parseDmnDecision(xml, "d1");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.inputs[0]?.isComplex).toBe(true);
    expect(out.inputs[0]?.expression).toBe("creditScore * 1.1");
  });

  it("preserves href refs even when the label isn't resolvable in the document", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D" name="D" namespace="http://x">
  <decision id="d1" name="d1">
    <informationRequirement><requiredInput href="#missingInput" /></informationRequirement>
    <decisionTable id="dt" hitPolicy="UNIQUE">
      <input id="i1"><inputExpression id="ie1" typeRef="string"><text>x</text></inputExpression></input>
      <output id="o1" name="r" typeRef="string" />
      <rule id="r1"><inputEntry id="r1i1"><text>-</text></inputEntry><outputEntry id="r1o1"><text>"y"</text></outputEntry></rule>
    </decisionTable>
  </decision>
</definitions>`;
    const out = parseDmnDecision(xml, "d1");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.requirements).toEqual([{ kind: "input", ref: "missingInput" }]);
    // Input without a label — only name + type.
    expect(out.inputs[0]?.label).toBeUndefined();
  });
});
