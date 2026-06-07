// SPDX-License-Identifier: Apache-2.0
//
// Minimal ambient declaration for `dmn-moddle` (the DMN XML parser dmn-js
// wraps). The package ships no types. Story 30.2 uses it directly in the
// headless DMN round-trip test. Per ADR-001 the moddle BO graph is dynamic.

declare module "dmn-moddle" {
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
  export default class DmnModdle {
    constructor(packages?: Record<string, Any>, options?: Any);
    fromXML(xml: string, typeName?: string, options?: Any): Promise<ParseResult>;
    toXML(element: Any, options?: Any): Promise<SerializeResult>;
    create(type: string, attrs?: Record<string, Any>): Any;
  }
}
