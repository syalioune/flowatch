// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal DMN-XML parser focused on the two surfaces that need to read
 * decision metadata client-side: `<DecisionDetail>` (Inputs +
 * Information requirements panels) and `<ExecuteDecisionModal>` (form
 * generation from inferred inputs).
 *
 * Scope:
 *   - One `<decision>` (by DMN `id`, which matches Flowable's
 *     `FlowableDecision.key`) with an embedded `<decisionTable>`.
 *   - Decision-table `<input>` columns: variable name (from
 *     `<inputExpression><text>`), display label, typeRef.
 *   - `<informationRequirement>` and `<authorityRequirement>` hrefs,
 *     resolved against the document to surface human labels.
 *   - DRD `<decisionService>` is OUT OF SCOPE (compat.md FR-58 defers it).
 *
 * Uses the browser-native `DOMParser` — no extra dependency. Querying
 * happens by local-name via `getElementsByTagName`, which works for the
 * default DMN namespace; namespaced elements like `dmndi:` / `dc:` are
 * ignored because they don't carry the names we look for.
 */

export interface DmnInputColumn {
  /** The variable name parsed from `<inputExpression><text>`. When the
   *  text is a simple identifier (e.g. `tier`), this is the variable
   *  the engine resolves. When the text is a complex expression (e.g.
   *  `creditScore * 1.1`), `isComplex` is true and this field carries the
   *  raw expression text — form-rendering should fall back to JSON.
   *  Flowable evaluates DMN expressions via JUEL (the DMN spec's S-FEEL
   *  is not supported by flowable-dmn), so "complex expression" here means
   *  "not a simple JUEL identifier we can form-bind." */
  name: string;
  /** The `label="..."` attribute on `<input>` — display-only. */
  label?: string;
  /** The `typeRef` on `<inputExpression>` — typically one of `string` /
   *  `number` / `boolean` / `date`. DMN spec leaves the type vocabulary
   *  open; we keep it as `string` so consumers can switch on it. */
  type: string;
  /** True when `<inputExpression><text>` is NOT a simple identifier. */
  isComplex: boolean;
  /** The raw expression text (only meaningful when isComplex). Evaluated
   *  by the engine via JUEL — DMN S-FEEL is NOT supported by flowable-dmn. */
  expression: string;
}

export interface DmnRequirement {
  kind: "decision" | "input" | "authority";
  /** The href target with the leading `#` stripped. */
  ref: string;
  /** Resolved `name=...` of the referenced element, when found. */
  label?: string;
}

export interface ParsedDmnDecision {
  ok: true;
  decisionId: string;
  decisionName?: string;
  hitPolicy?: string;
  inputs: DmnInputColumn[];
  requirements: DmnRequirement[];
}

export interface DmnParseError {
  ok: false;
  message: string;
}

// A simple identifier: a JS-ish identifier (letters, digits, _, $) starting
// with a letter or _ or $. Permissive — engine resolves the JUEL grammar
// (Flowable does NOT support DMN's S-FEEL expression language; it parses
// `<inputExpression><text>` and `<inputEntry><text>` as JUEL).
const SIMPLE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const trim = (s: string | null | undefined): string => (s ?? "").trim();

const firstChildElementByLocalName = (parent: Element, name: string): Element | null => {
  for (const child of Array.from(parent.children)) {
    if (child.localName === name) return child;
  }
  return null;
};

const childTextByLocalName = (parent: Element, name: string): string => {
  const el = firstChildElementByLocalName(parent, name);
  return el ? trim(el.textContent) : "";
};

export const parseDmnDecision = (
  xml: string,
  decisionKey: string,
): ParsedDmnDecision | DmnParseError => {
  if (!xml?.trim()) {
    return { ok: false, message: "Empty XML." };
  }
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch (err) {
    return { ok: false, message: `XML parse failed: ${(err as Error)?.message ?? String(err)}` };
  }
  // DOMParser inlines a `<parsererror>` element on malformed XML rather than
  // throwing — check for it.
  const parseError = doc.getElementsByTagName("parsererror");
  if (parseError.length > 0) {
    return { ok: false, message: `XML parse failed: ${trim(parseError[0]?.textContent)}` };
  }

  // Find the <decision> with the requested DMN id (matches Flowable's key).
  const decisions = Array.from(doc.getElementsByTagName("decision")).filter(
    (d) => d.localName === "decision",
  );
  const decision = decisions.find((d) => d.getAttribute("id") === decisionKey);
  if (!decision) {
    return {
      ok: false,
      message: `Decision "${decisionKey}" not found in DMN definitions (${decisions.length} decisions present).`,
    };
  }

  // Build an id → name lookup over <decision>, <inputData>, <knowledgeSource>
  // so we can resolve <requiredDecision/Input/Authority> hrefs to labels.
  const labelByRef = new Map<string, string>();
  const indexable = ["decision", "inputData", "knowledgeSource"];
  for (const tag of indexable) {
    const els = Array.from(doc.getElementsByTagName(tag)).filter((e) => e.localName === tag);
    for (const el of els) {
      const id = el.getAttribute("id");
      const name = el.getAttribute("name");
      if (id && name) labelByRef.set(id, name);
    }
  }

  // Information + authority requirements. Each <informationRequirement> has
  // exactly one <requiredDecision> OR <requiredInput>; <authorityRequirement>
  // wraps <requiredAuthority>. Walk all three.
  const requirements: DmnRequirement[] = [];
  const pushRef = (kind: DmnRequirement["kind"], hrefRaw: string | null): void => {
    if (!hrefRaw) return;
    const ref = hrefRaw.startsWith("#") ? hrefRaw.slice(1) : hrefRaw;
    const label = labelByRef.get(ref);
    requirements.push(label ? { kind, ref, label } : { kind, ref });
  };
  for (const ir of Array.from(decision.getElementsByTagName("informationRequirement")).filter(
    (e) => e.localName === "informationRequirement",
  )) {
    const reqDec = firstChildElementByLocalName(ir, "requiredDecision");
    if (reqDec) pushRef("decision", reqDec.getAttribute("href"));
    const reqIn = firstChildElementByLocalName(ir, "requiredInput");
    if (reqIn) pushRef("input", reqIn.getAttribute("href"));
  }
  for (const ar of Array.from(decision.getElementsByTagName("authorityRequirement")).filter(
    (e) => e.localName === "authorityRequirement",
  )) {
    const reqAuth = firstChildElementByLocalName(ar, "requiredAuthority");
    if (reqAuth) pushRef("authority", reqAuth.getAttribute("href"));
  }

  // Decision table inputs. We only look one level deep — nested decisions
  // would also produce nested decisionTables, but a Flowable `decision` is
  // expected to carry exactly one decisionTable at its root.
  const dt = firstChildElementByLocalName(decision, "decisionTable");
  const inputs: DmnInputColumn[] = [];
  let hitPolicy: string | undefined;
  if (dt) {
    hitPolicy = dt.getAttribute("hitPolicy") || undefined;
    const inputEls = Array.from(dt.children).filter((c) => c.localName === "input");
    for (const inp of inputEls) {
      const expr = firstChildElementByLocalName(inp, "inputExpression");
      if (!expr) continue;
      const text = childTextByLocalName(expr, "text");
      const isComplex = !SIMPLE_IDENTIFIER.test(text);
      inputs.push({
        // For simple identifiers the variable name IS the text; for complex
        // expressions we still expose the raw text so callers can render
        // something — but they SHOULD honour isComplex and fall back.
        name: text,
        ...(inp.getAttribute("label") ? { label: inp.getAttribute("label") as string } : {}),
        type: expr.getAttribute("typeRef") || "string",
        isComplex,
        expression: text,
      });
    }
  }

  const result: ParsedDmnDecision = {
    ok: true,
    decisionId: decisionKey,
    inputs,
    requirements,
  };
  const nameAttr = decision.getAttribute("name");
  if (nameAttr) result.decisionName = nameAttr;
  if (hitPolicy) result.hitPolicy = hitPolicy;
  return result;
};
