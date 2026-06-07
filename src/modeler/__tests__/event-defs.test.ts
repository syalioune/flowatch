// SPDX-License-Identifier: Apache-2.0

/**
 * Story 30.1 — event-definition editing helpers (signal / message / timer /
 * error). The pure helpers in ../event-defs are exercised headless against a
 * real `bpmn-moddle` model + a fake command-stack service, so the produced
 * XML is asserted without mounting the (SVG-dependent) dmn-js/bpmn-js modeler.
 */

import BpmnModdle from "bpmn-moddle";
import { describe, expect, it } from "vitest";
import {
  type AnyEl,
  type EventDefSvc,
  eventDefKind,
  firstEventDef,
  setEventRefAttr,
  setTimerDef,
  timerKindOf,
  timerValueOf,
} from "../event-defs";

const newModdle = () => new BpmnModdle();

// Fake command-stack write: mirror modeling.updateModdleProperties by mutating
// the moddle element in place (undefined deletes — matches the real clear).
const makeSvc = (moddle: AnyEl, definitions: AnyEl): EventDefSvc => ({
  moddle,
  updateModdle: (target, props) => {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) delete target[k];
      else target[k] = v;
    }
  },
  definitions,
});

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" targetNamespace="t">
  <bpmn:signal id="Sig_1" name="orderPlaced" />
  <bpmn:message id="Msg_1" name="mailReceived" />
  <bpmn:error id="Err_1" name="Boom" errorCode="E1" />
  <bpmn:process id="p">
    <bpmn:startEvent id="sigStart"><bpmn:signalEventDefinition signalRef="Sig_1" /></bpmn:startEvent>
    <bpmn:intermediateCatchEvent id="msgCatch"><bpmn:messageEventDefinition messageRef="Msg_1" /></bpmn:intermediateCatchEvent>
    <bpmn:boundaryEvent id="timerB" attachedToRef="sigStart"><bpmn:timerEventDefinition><bpmn:timeDuration>PT5M</bpmn:timeDuration></bpmn:timerEventDefinition></bpmn:boundaryEvent>
    <bpmn:endEvent id="errEnd"><bpmn:errorEventDefinition errorRef="Err_1" /></bpmn:endEvent>
    <bpmn:startEvent id="bareSignal"><bpmn:signalEventDefinition /></bpmn:startEvent>
  </bpmn:process>
</bpmn:definitions>`;

const load = async () => {
  const m = newModdle();
  const { rootElement } = await m.fromXML(FIXTURE);
  const proc = rootElement.rootElements.find((r: AnyEl) => r.$type === "bpmn:Process");
  const el = (id: string): AnyEl => proc.flowElements.find((f: AnyEl) => f.id === id);
  return { m, defs: rootElement, el };
};

describe("eventDefKind classification", () => {
  it("maps each event-definition type to its operator-facing kind", async () => {
    const { el } = await load();
    expect(eventDefKind(firstEventDef(el("sigStart")))).toBe("signal");
    expect(eventDefKind(firstEventDef(el("msgCatch")))).toBe("message");
    expect(eventDefKind(firstEventDef(el("timerB")))).toBe("timer");
    expect(eventDefKind(firstEventDef(el("errEnd")))).toBe("error");
    expect(eventDefKind(null)).toBe(null);
  });
});

describe("signal / message / error ref editing (round-trip)", () => {
  it("edits an EXISTING signal's name", async () => {
    const { m, defs, el } = await load();
    const ed = firstEventDef(el("sigStart"));
    setEventRefAttr(makeSvc(m, defs), ed, "signalRef", "bpmn:Signal", "name", "orderShipped");
    const { xml } = await m.toXML(defs);
    expect(xml).toContain('name="orderShipped"');
    expect(xml).not.toContain('name="orderPlaced"');
    expect(xml).toContain('signalRef="Sig_1"');
  });

  it("CREATES a signal + registers it under definitions when absent", async () => {
    const { m, defs, el } = await load();
    const ed = firstEventDef(el("bareSignal"));
    expect(ed.signalRef).toBeUndefined();
    setEventRefAttr(makeSvc(m, defs), ed, "signalRef", "bpmn:Signal", "name", "createdSignal");
    // A new bpmn:Signal root element exists and the event references it.
    expect(ed.signalRef).toBeTruthy();
    expect(ed.signalRef.name).toBe("createdSignal");
    const { xml } = await m.toXML(defs);
    expect(xml).toContain('name="createdSignal"');
    // Two signals now (the original + the created one).
    expect(xml.match(/<bpmn:signal\b/g)?.length).toBe(2);
  });

  it("edits a message name", async () => {
    const { m, defs, el } = await load();
    const ed = firstEventDef(el("msgCatch"));
    setEventRefAttr(makeSvc(m, defs), ed, "messageRef", "bpmn:Message", "name", "paid");
    const { xml } = await m.toXML(defs);
    expect(xml).toContain('name="paid"');
  });

  it("edits an error code", async () => {
    const { m, defs, el } = await load();
    const ed = firstEventDef(el("errEnd"));
    setEventRefAttr(makeSvc(m, defs), ed, "errorRef", "bpmn:Error", "errorCode", "E_REJECTED");
    const { xml } = await m.toXML(defs);
    expect(xml).toContain('errorCode="E_REJECTED"');
  });
});

describe("timer editing (round-trip)", () => {
  it("reads the current timer kind + value", async () => {
    const { el } = await load();
    const ed = firstEventDef(el("timerB"));
    expect(timerKindOf(ed)).toBe("timeDuration");
    expect(timerValueOf(ed)).toBe("PT5M");
  });

  it("switches kind to timeCycle and clears the old timeDuration", async () => {
    const { m, defs, el } = await load();
    const ed = firstEventDef(el("timerB"));
    setTimerDef(makeSvc(m, defs), ed, "timeCycle", "R3/PT10M");
    expect(timerKindOf(ed)).toBe("timeCycle");
    expect(timerValueOf(ed)).toBe("R3/PT10M");
    const { xml } = await m.toXML(defs);
    expect(xml).toContain("R3/PT10M");
    expect(xml).toContain("timeCycle");
    expect(xml).not.toContain("PT5M");
    expect(xml).not.toContain("timeDuration");
  });

  it("clearing the timer expression removes the expression element", async () => {
    const { m, defs, el } = await load();
    const ed = firstEventDef(el("timerB"));
    setTimerDef(makeSvc(m, defs), ed, "timeDuration", "");
    const { xml } = await m.toXML(defs);
    expect(xml).not.toContain("PT5M");
    expect(xml).not.toContain("timeDuration");
  });
});
