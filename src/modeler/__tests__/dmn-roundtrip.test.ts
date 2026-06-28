// SPDX-License-Identifier: Apache-2.0

/**
 * Story 30.2 — DMN lossless round-trip + JUEL-not-FEEL guard.
 *
 * Load-bearing finding (AC-1): the Flowable DMN converter consumes standard
 * OMG DMN and ships NO `flowable:`-namespace extensions — so there is
 * intentionally no DMN analogue of 30.1's flowable-moddle.json. 30.2 instead
 * proves the standard DMN surface + the generic `extensionElements` escape
 * hatch round-trip losslessly (the D-8 / R-3 differentiator extended to DMN),
 * and locks JUEL labeling (RC-13) against a future "fix FEEL" regression.
 *
 * Round-trip is exercised via `dmn-moddle` directly (the parser dmn-js wraps)
 * so it runs headless — the full dmn-js Modeler needs SVG surfaces jsdom
 * can't provide. The companion e2e (dmn-properties) drives the real modeler.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import DmnModdle from "dmn-moddle";
import { describe, expect, it } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: dmn-moddle BO shapes are dynamic
type AnyBo = any;

const FIXTURE = readFileSync(
  path.resolve(process.cwd(), "e2e/fixtures/flowable-decision.dmn"),
  "utf8",
);
const DMN_MODELER_SRC = readFileSync(
  path.resolve(process.cwd(), "src/modeler/DmnModeler.tsx"),
  "utf8",
);

const newModdle = () => new DmnModdle();
const decisionOf = (defs: AnyBo): AnyBo =>
  defs.drgElement?.find((e: AnyBo) => e.$type === "dmn:Decision");
const tableOf = (defs: AnyBo): AnyBo => decisionOf(defs)?.decisionLogic;

describe("DMN lossless round-trip (AC-4)", () => {
  it("no-edit import→export preserves the standard DMN surface + extensionElements", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(FIXTURE);
    const { xml } = await m.toXML(rootElement, { format: true });

    // Standard decision + table metadata.
    expect(xml).toContain('id="riskDecision"');
    expect(xml).toContain('name="Risk Decision"');
    expect(xml).toContain('hitPolicy="COLLECT"');
    expect(xml).toContain('aggregation="SUM"');
    // Inputs / outputs with typeRef.
    expect(xml).toContain('typeRef="number"');
    expect(xml).toContain('typeRef="string"');
    expect(xml).toContain('name="points"');
    expect(xml).toContain('name="band"');
    // JUEL input/output entries survive (text preserved; CDATA may normalize
    // to entity-escaped text — semantically identical).
    expect(xml).toContain("income &gt;= 50000");
    expect(xml).toContain('"prime"');
    // The generic OMG extensionElements escape hatch (Flowable's only DMN
    // extensibility point) round-trips with its foreign child intact.
    expect(xml).toContain("custom:meta");
    expect(xml).toContain('owner="risk-team"');
  });

  it("re-import equality: parsed decision + hit policy survive a full cycle", async () => {
    const m1 = newModdle();
    const { rootElement } = await m1.fromXML(FIXTURE);
    const { xml } = await m1.toXML(rootElement);
    const m2 = newModdle();
    const { rootElement: re } = await m2.fromXML(xml);
    const dec = decisionOf(re);
    const table = tableOf(re);
    expect(dec.id).toBe("riskDecision");
    expect(dec.name).toBe("Risk Decision");
    expect(table.hitPolicy).toBe("COLLECT");
    expect(table.aggregation).toBe("SUM");
    expect(table.rule).toHaveLength(2);
    // extensionElements survives the re-import.
    expect(dec.extensionElements?.values?.length ?? 0).toBeGreaterThan(0);
  });

  it("editing the decision name + one output entry preserves all other content (AC-4)", async () => {
    const m = newModdle();
    const { rootElement } = await m.fromXML(FIXTURE);
    const dec = decisionOf(rootElement);
    dec.set("name", "Risk Decision v2");
    // Mutate the first rule's first output entry text.
    const firstOutputEntry = tableOf(rootElement).rule[0].outputEntry[0];
    firstOutputEntry.set("text", "99");
    const { xml } = await m.toXML(rootElement, { format: true });
    expect(xml).toContain('name="Risk Decision v2"');
    expect(xml).toContain("<text>99</text>");
    // Everything else intact — no collateral drop.
    expect(xml).toContain('hitPolicy="COLLECT"');
    expect(xml).toContain('"standard"');
    expect(xml).toContain("custom:meta");
  });
});

describe("JUEL-not-FEEL labeling guard (AC-3, Pattern P-008)", () => {
  // Flowable DMN cell expressions are JUEL, never S-FEEL (RC-13 / project
  // memory). This guards the DMN modeler source against a future well-meaning
  // "add FEEL labeling" regression — authoring is where the wrong mental
  // model is most expensive.
  it("the DMN modeler source introduces no 'FEEL' label", () => {
    // Exclude the project's "operator-feel" UX term — the guard targets the
    // DMN expression-language reference (FEEL / S-FEEL), not UX prose.
    expect(/(?<!operator-)feel/i.test(DMN_MODELER_SRC)).toBe(false);
  });
});
