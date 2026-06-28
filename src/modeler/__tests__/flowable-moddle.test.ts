// SPDX-License-Identifier: Apache-2.0

/**
 * Story 30.1 — Flowable moddle descriptor + lossless round-trip tests.
 *
 * The descriptor (src/modeler/flowable-moddle.json) is the load-bearing
 * round-trip foundation (FR-38 / D-8 / ADR-006): it types the full Flowable
 * extension surface so every flowable: attribute + extensionElements child
 * survives import→export — the differentiator vs Camunda Modeler, which
 * silently drops Flowable extensions on round-trip (PRD D-8 / R-3).
 *
 * These tests drive `bpmn-moddle` directly (the parser bpmn-js wraps) so the
 * descriptor is exercised headless — the full bpmn-js Modeler needs SVG
 * surfaces jsdom can't provide. The companion e2e (bpmn-flowable-properties)
 * drives the real modeler.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import BpmnModdle from "bpmn-moddle";
import { describe, expect, it } from "vitest";
import flowableModdle from "../flowable-moddle.json";

// Vitest runs from the project root; read the shared e2e fixture from there.
const FIXTURE = readFileSync(
  path.resolve(process.cwd(), "e2e/fixtures/flowable-extensions.bpmn"),
  "utf8",
);

// biome-ignore lint/suspicious/noExplicitAny: bpmn-moddle BO shapes are dynamic
type AnyBo = any;

const newModdle = () => new BpmnModdle({ flowable: flowableModdle });

const getProcess = (defs: AnyBo): AnyBo =>
  defs.rootElements.find((r: AnyBo) => r.$type === "bpmn:Process");
const flowEl = (proc: AnyBo, id: string): AnyBo =>
  proc.flowElements.find((f: AnyBo) => f.id === id);
const extValues = (bo: AnyBo): AnyBo[] =>
  (bo.extensionElements && bo.extensionElements.values) || [];

describe("flowable moddle descriptor", () => {
  it("loads with the canonical Flowable namespace + prefix (AC-1)", () => {
    expect(flowableModdle.uri).toBe("http://flowable.org/bpmn");
    expect(flowableModdle.prefix).toBe("flowable");
    const names = flowableModdle.types.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "TaskListener",
        "ExecutionListener",
        "Field",
        "In",
        "Out",
        "FormProperty",
      ]),
    );
  });

  it("types the FR-38 simple attributes so they read off the BO (AC-1)", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(FIXTURE);
    const proc = getProcess(rootElement);
    const review = flowEl(proc, "review");
    expect(review.get("flowable:assignee")).toBe("kermit");
    expect(review.get("flowable:candidateGroups")).toBe("sales,support");
    expect(review.get("flowable:formKey")).toBe("reviewForm");
    // Boolean attrs coerce to real booleans through the typed descriptor.
    expect(review.get("flowable:async")).toBe(true);
    expect(review.get("flowable:exclusive")).toBe(true);
    expect(proc.get("flowable:candidateStarterGroups")).toBe("managers");
  });

  it("types extensionElements children as real moddle elements (AC-1/AC-3)", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(FIXTURE);
    const proc = getProcess(rootElement);
    const review = flowEl(proc, "review");
    const types = extValues(review).map((v) => v.$type);
    expect(types).toContain("flowable:TaskListener");
    expect(types).toContain("flowable:ExecutionListener");
    const tl = extValues(review).find((v) => v.$type === "flowable:TaskListener");
    expect(tl.event).toBe("create");
    expect(tl.class).toBe("com.acme.CreateListener");
    expect(tl.onTransaction).toBe("before-commit");
  });
});

describe("lossless round-trip (D-8 / R-3 differentiator — AC-4)", () => {
  it("no-edit import→export preserves every flowable: attribute + child", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(FIXTURE);
    const { xml } = await m.toXML(rootElement, { format: true });

    // Simple attributes survive.
    expect(xml).toContain('flowable:assignee="kermit"');
    expect(xml).toContain('flowable:candidateGroups="sales,support"');
    expect(xml).toContain('flowable:async="true"');
    // asyncLeave is a distinct async-capable flag (Flowable's "async on the
    // leaving side") — must round-trip independently of async.
    expect(xml).toContain('flowable:asyncLeave="true"');
    expect(xml).toContain('flowable:candidateStarterGroups="managers"');
    expect(xml).toContain('flowable:calledElementType="key"');
    // Nested extensionElements survive.
    expect(xml).toContain("flowable:taskListener");
    expect(xml).toContain('onTransaction="before-commit"');
    expect(xml).toContain("flowable:executionListener");
    expect(xml).toContain("flowable:field");
    expect(xml).toContain("https://payments.acme.example");
    expect(xml).toContain("flowable:in");
    expect(xml).toContain("flowable:out");
    // An extension with NO dedicated panel field still round-trips (lax).
    expect(xml).toContain("custom:audit");
    expect(xml).toContain('channel="legacy"');
  });

  it("editing one field preserves all other flowable: content (no collateral drop)", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(FIXTURE);
    const proc = getProcess(rootElement);
    const review = flowEl(proc, "review");
    // Mutate the assignee the way modeling.updateProperties would.
    review.set("flowable:assignee", "fozzie");
    const { xml } = await m.toXML(rootElement, { format: true });
    expect(xml).toContain('flowable:assignee="fozzie"');
    expect(xml).not.toContain('flowable:assignee="kermit"');
    // Everything else intact — the Camunda failure mode is collateral drop.
    expect(xml).toContain('flowable:candidateGroups="sales,support"');
    expect(xml).toContain("flowable:taskListener");
    expect(xml).toContain("flowable:executionListener");
    expect(xml).toContain("custom:audit");
  });
});

describe("boolean string-typing (AC-2)", () => {
  it('a typed Boolean attr serializes as the string "true"', async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(
      `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" id="d" targetNamespace="t"><bpmn:process id="p"><bpmn:serviceTask id="s" flowable:class="C" /></bpmn:process></bpmn:definitions>`,
    );
    const proc = getProcess(rootElement);
    const st = flowEl(proc, "s");
    st.set("flowable:async", true);
    const { xml } = await m.toXML(rootElement);
    expect(xml).toContain('flowable:async="true"');
    // Clearing (unchecked) removes the attribute entirely — never "false".
    st.set("flowable:async", undefined);
    const { xml: cleared } = await m.toXML(rootElement);
    expect(cleared).not.toContain("flowable:async");
  });
});

describe("listener create→export→re-import round-trip (AC-3/AC-6)", () => {
  it("a freshly-created TaskListener survives the full cycle", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(
      `<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn" id="d" targetNamespace="t"><bpmn:process id="p"><bpmn:userTask id="u" /></bpmn:process></bpmn:definitions>`,
    );
    const proc = getProcess(rootElement);
    const ut = flowEl(proc, "u");
    const listener = m.create("flowable:TaskListener", {
      event: "complete",
      delegateExpression: "${doneListener}",
      onTransaction: "committed",
    });
    const ext = m.create("bpmn:ExtensionElements", { values: [listener] });
    ext.$parent = ut;
    ut.extensionElements = ext;

    const { xml } = await m.toXML(rootElement, { format: true });
    expect(xml).toContain("flowable:taskListener");

    // Re-import the produced XML and confirm the listener is intact.
    const m2 = newModdle();
    const { rootElement: re } = await m2.fromXML(xml);
    const ut2 = flowEl(getProcess(re), "u");
    const tl = extValues(ut2).find((v) => v.$type === "flowable:TaskListener");
    expect(tl.event).toBe("complete");
    expect(tl.delegateExpression).toBe("${doneListener}");
    expect(tl.onTransaction).toBe("committed");
  });
});
