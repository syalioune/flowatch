// SPDX-License-Identifier: Apache-2.0

/**
 * Smoke tests for the shared starter XMLs extracted in Story 16.1.
 *
 * Locks the invariants:
 *  - The three constants exist + are non-empty strings.
 *  - Each parses as valid XML via DOMParser (jsdom) — no syntax drift.
 *  - The BPMN starters declare a process; the DMN starter declares a
 *    definitions root with the DMN 1.3 namespace.
 *
 * Story 16.1 AC-9 — unit smoke tests on src/modeler/starters.ts.
 */

import { describe, expect, it } from "vitest";
import { BLANK_BPMN_XML, LOAN_BPMN_XML, LOAN_DMN_XML } from "../modeler/starters";

describe("modeler starters — Story 16.1 AC-9", () => {
  const parser = new DOMParser();

  it("exposes non-empty BLANK_BPMN_XML / LOAN_BPMN_XML / LOAN_DMN_XML", () => {
    expect(typeof BLANK_BPMN_XML).toBe("string");
    expect(BLANK_BPMN_XML.length).toBeGreaterThan(100);
    expect(typeof LOAN_BPMN_XML).toBe("string");
    expect(LOAN_BPMN_XML.length).toBeGreaterThan(500);
    expect(typeof LOAN_DMN_XML).toBe("string");
    expect(LOAN_DMN_XML.length).toBeGreaterThan(500);
  });

  it("BLANK_BPMN_XML parses + declares a bpmn:process with a StartEvent", () => {
    const doc = parser.parseFromString(BLANK_BPMN_XML, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    // BPMN namespace is declared on the root <bpmn:definitions>
    expect(doc.documentElement.tagName).toBe("bpmn:definitions");
    // The blank starter is a single-StartEvent process — Story 16.3 loads it
    expect(doc.getElementsByTagName("bpmn:startEvent").length).toBeGreaterThan(0);
  });

  it("LOAN_BPMN_XML parses + carries the loan-approval process key", () => {
    const doc = parser.parseFromString(LOAN_BPMN_XML, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const proc = doc.getElementsByTagName("bpmn:process")[0];
    expect(proc).toBeTruthy();
    expect(proc?.getAttribute("id")).toBe("loanApproval");
  });

  it("LOAN_DMN_XML parses + declares the riskTier + loanEligibility decisions", () => {
    const doc = parser.parseFromString(LOAN_DMN_XML, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    // DMN 1.3 namespace lives on the root (xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/")
    expect(doc.documentElement.getAttribute("xmlns")).toBe(
      "https://www.omg.org/spec/DMN/20191111/MODEL/",
    );
    // Two-decision DRD — both decisions referenced by id
    const decisions = Array.from(doc.getElementsByTagName("decision")).map((d) =>
      d.getAttribute("id"),
    );
    expect(decisions).toContain("riskTier");
    expect(decisions).toContain("loanEligibility");
  });
});
