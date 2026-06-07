// SPDX-License-Identifier: Apache-2.0
//
// Minimal ambient declaration for `bpmn-moddle` (the XML parser bpmn-js wraps).
// The package ships no types. Story 30.1 uses it directly in the headless
// round-trip tests (the full Modeler needs SVG surfaces jsdom can't provide).
// Per ADR-001 the moddle BO graph is dynamic — `any` is the honest type here.

declare module "bpmn-moddle" {
  // biome-ignore lint/suspicious/noExplicitAny: moddle BO graph is dynamic
  type Any = any;
  interface ParseResult {
    rootElement: Any;
    references: Any[];
    warnings: Any[];
    elementsById: Record<string, Any>;
  }
  interface SerializeResult {
    xml: string;
  }
  export default class BpmnModdle {
    constructor(packages?: Record<string, Any>, options?: Any);
    fromXML(xml: string, typeName?: string, options?: Any): Promise<ParseResult>;
    toXML(element: Any, options?: Any): Promise<SerializeResult>;
    create(type: string, attrs?: Record<string, Any>): Any;
  }
}
