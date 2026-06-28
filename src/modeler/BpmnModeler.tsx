// SPDX-License-Identifier: Apache-2.0

/**
 * BpmnModeler — vanilla bpmn-js wrapping (Pattern P-006).
 *
 * Instantiates `bpmn-js/lib/Modeler` directly inside a useEffect, attaches
 * it to a ref'd <div>, and bridges save/deploy actions to api.deployBpmn.
 * Event-bus callbacks (`selection.changed`, `commandStack.changed`) are
 * typed via diagram-js's EventBus.EventTypes (with local payload
 * interfaces because diagram-js doesn't ship strongly-typed payloads
 * for those events).
 *
 * ADR-001 — vanilla wrapping; no bpmn-js-react bindings.
 * Story 16.1 — extracted from src/modeler.tsx; established src/modeler/.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import BpmnModelerClass from "bpmn-js/lib/Modeler";
import type EventBus from "diagram-js/lib/core/EventBus";
import React from "react";
import { api, type FlowableProcessDefinition } from "../api";
import { Icon, toast } from "../components";
import { DeployBpmnModal, type DeployBpmnModalTarget } from "../lib/deploy-bpmn-modal";
import { FlowablePropertiesPanel } from "./FlowablePropertiesPanel";
import flowableModdle from "./flowable-moddle.json";
import { BLANK_BPMN_XML, LOAN_BPMN_XML } from "./starters";

// @migration-any: bpmn-js DI container, event-bus payloads, and BO shapes
// are dynamic. Per ADR-001 consequences, this file is the allowed `any`
// zone — every cast below is documented at use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

// ─── Typed event-bus payloads (Story 16.1 AC-3) ──────────────────────
// diagram-js exports `EventBus<EventMap>` but the BPMN-specific EventMap is
// not published. Local interfaces name the fields actually observed at
// runtime — preserving operator-feel-conservative typing while removing the
// raw `any` from the callback signatures.

interface SelectionChangedEvent {
  newSelection: AnyEl[];
  oldSelection?: AnyEl[];
}

// commandStack.changed has no published payload; the data we read off the
// modeler is its commandStack service (canUndo / canRedo), not the event.
// We type the event as an empty record + the modeler reaches over to the
// commandStack DI service for state. Story 16.2 consumes this typing for
// dirty-state tracking.
interface CommandStackChangedEvent {
  context?: unknown;
}

// ─── Element type helpers ───────────────────────────────────────────

// PR #168 follow-up: turn an operator-typed filename into a Flowable-safe
// process id. Strips the .bpmn(20).xml extension, replaces non-id chars
// with `-`, trims dashes, and falls back to "newProcess" on empty input.
const bpmnIdFromFilename = (filename: string): string => {
  const base = filename
    .replace(/\.bpmn20?\.xml$/i, "")
    .replace(/\.bpmn$/i, "")
    .replace(/\.xml$/i, "");
  const slug = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "newProcess";
};

// Operator-feel readable name from a filename — strips extension, replaces
// separators with spaces, title-cases. Used as the modal's process-name
// default when the XML only carries an id (no name attribute).
const bpmnReadableNameFromFilename = (filename: string): string => {
  const base = filename
    .replace(/\.bpmn20?\.xml$/i, "")
    .replace(/\.bpmn$/i, "")
    .replace(/\.xml$/i, "");
  const words = base
    .replace(/[_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "New process";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

// XML attribute-value escaper for operator-typed strings going into id /
// name attributes. NCName-conforming keys never need escaping (validated
// in the modal), but the readable name may contain &, <, >, ", '.
const escapeXmlAttr = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Extract the FIRST <bpmn:process id="…" name="…"> tuple from the raw XML.
// Used to seed the deploy modal's default values. Falls back to null
// fields when the attributes aren't present (custom-authored XML).
const extractProcessIdAndName = (xml: string): { id: string | null; name: string | null } => {
  const m = xml.match(/<bpmn:process\b[^>]*>/);
  if (!m) return { id: null, name: null };
  const tag = m[0];
  const idMatch = tag.match(/\bid="([^"]+)"/);
  const nameMatch = tag.match(/\bname="([^"]*)"/);
  return { id: idMatch?.[1] ?? null, name: nameMatch?.[1] ?? null };
};

// Rewrite the <bpmn:process> id + name AND every `bpmnElement="<oldId>"`
// reference (used by BPMNPlane) to the operator-chosen values. Targeted
// string-level rewrite — safer than parsing/serialising via bpmn-moddle
// for this scope, and aligns with how `bpmnIdFromFilename`'s caller in
// the v0 implementation worked.
const rewriteProcessKeyAndName = (xml: string, newKey: string, newName: string): string => {
  const { id: oldId, name: oldName } = extractProcessIdAndName(xml);
  let next = xml;
  if (oldId && oldId !== newKey) {
    // Replace exact `id="<oldId>"` matches (anywhere in the XML — both
    // the <bpmn:process> declaration and any references like
    // `bpmnElement="<oldId>"`).
    const idAttr = new RegExp(`\\bid="${oldId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`, "g");
    const refAttr = new RegExp(
      `\\bbpmnElement="${oldId.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}"`,
      "g",
    );
    next = next.replace(idAttr, `id="${newKey}"`).replace(refAttr, `bpmnElement="${newKey}"`);
  }
  // Rewrite the name attribute on the FIRST <bpmn:process …> tag only.
  const safeName = escapeXmlAttr(newName);
  if (oldName !== null) {
    next = next.replace(
      /<bpmn:process\b([^>]*?)\bname="[^"]*"([^>]*)>/,
      `<bpmn:process$1 name="${safeName}"$2>`,
    );
  } else {
    // No name attribute on the process — inject one right after the tag name.
    next = next.replace(/<bpmn:process\b/, `<bpmn:process name="${safeName}"`);
  }
  return next;
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

interface BpmnModelerProps {
  /** Deep-link: pre-select this definition and trigger its XML load on mount. */
  initialDefinitionId?: string | undefined;
}

// ─── BPMN modeler (real bpmn-js) ───────────────────────────────────
export const BpmnModeler = ({ initialDefinitionId }: BpmnModelerProps) => {
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [selected, setSelected] = React.useState<AnyEl | null>(null);
  const [elements, setElements] = React.useState<AnyEl[]>([]);
  const [dirty, setDirty] = React.useState(false);
  // Story 16.3 follow-up: tracks the "New from scratch" authoring flow.
  // True between `handleNew()` and the next discard / save / deploy / load —
  // pins the operator to the in-progress draft so they don't accidentally
  // switch deployed definitions and lose the draft.
  const [creatingNew, setCreatingNew] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);
  const [definitions, setDefinitions] = React.useState<FlowableProcessDefinition[]>([]);
  const [activeDef, setActiveDef] = React.useState<FlowableProcessDefinition | null>(null);
  const [filename, setFilename] = React.useState("loan-approval.bpmn20.xml");
  // Story 27.1 — "Save as new version": after a version bump the modeler
  // moves to the new version; this snapshot is the back-reference to the
  // version we just came from, rendered as a "View previous version" link.
  // Ephemeral component-local state — null on a fresh mount (no back-link
  // until the operator performs an in-session version bump).
  const [previousVersion, setPreviousVersion] = React.useState<{
    id: string;
    version: number;
  } | null>(null);
  const saveVersionBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // Load list of deployed process definitions for the loader dropdown.
  React.useEffect(() => {
    api
      .listProcessDefinitions({ size: 200, sort: "name" })
      .then((r) => setDefinitions(r.data || []))
      .catch(() => setDefinitions([]));
  }, []);

  // Deep-link: if initialDefinitionId was provided (/bpmn?definitionId=...), load it
  // once the modeler is ready. Defer until both the definitions list AND the
  // modeler instance are present.
  const loadInvokedRef = React.useRef(false);
  React.useEffect(() => {
    if (loadInvokedRef.current) return;
    if (!initialDefinitionId) return;
    if (!modelerRef.current) return;
    if (definitions.length === 0) return;
    loadInvokedRef.current = true;
    loadDefinition(initialDefinitionId);
    // loadDefinition is defined further down — exhaustive-deps would create a
    // cycle, so we intentionally omit it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDefinitionId, definitions]);

  // Hoisted to component scope (PR #168 follow-up) so importAndFit can
  // trigger an outline refresh — `importXML` does NOT reliably fire
  // `commandStack.changed`, so without this call the outline shows the
  // previous diagram's elements after a fresh load / New from scratch.
  const refreshOutline = React.useCallback(() => {
    const m = modelerRef.current;
    if (!m) return;
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
  }, []);

  React.useEffect(() => {
    let m: AnyModeler;
    try {
      // @migration-any: bpmn-js constructor accepts `container: HTMLElement`.
      m = new BpmnModelerClass({
        container: containerRef.current as HTMLElement,
        keyboard: { bindTo: window },
        // Story 30.1: register the Flowable moddle descriptor so every
        // flowable: attribute + extensionElements child is TYPED — the
        // load-bearing round-trip foundation (FR-38 / D-8 / ADR-006).
        // Typed properties read via bo.get("flowable:<attr>") and write via
        // modeling.updateProperties / updateModdleProperties; untyped/foreign
        // content still survives via moddle's lax handling (AC-4).
        moddleExtensions: { flowable: flowableModdle },
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
        setDirty(false);
        refreshOutline();
      })
      .catch((e: Error) => setError(String(e.message || e)));

    // Story 16.1 AC-3: typed event-bus callbacks. The cast to `EventBus` lets
    // us call .on/.off with a typed signature; the payload typings are local
    // (diagram-js doesn't publish BPMN-specific event payloads). Story 16.2
    // consumes the CommandStackChangedEvent typing for dirty-state — the
    // event payload itself is unused; we read dirtiness from the modeler's
    // commandStack DI service (`canUndo()`).
    const bus = m.get("eventBus") as EventBus;
    const onSel = (event: SelectionChangedEvent) => {
      const els = event.newSelection || [];
      setSelected(els.length === 1 ? els[0] : null);
      setVersion((v) => v + 1);
    };
    const onChange = (_event: CommandStackChangedEvent) => {
      try {
        const cmdStack = m.get("commandStack");
        // Story 16.2: dirty iff the operator has executed >= 1 undoable
        // command since the last clean state (mount, import, deploy).
        setDirty(!!cmdStack?.canUndo?.());
      } catch {
        // Defensive: if the DI service throws, fall back to "edits happened".
        setDirty(true);
      }
      setVersion((v) => v + 1);
      refreshOutline();
    };
    bus.on("selection.changed", onSel);
    bus.on("commandStack.changed", onChange);

    return () => {
      try {
        m.destroy();
      } catch {}
      modelerRef.current = null;
    };
  }, [refreshOutline]);

  // Story 16.2 AC-3: every import is followed by zoom-to-fit + dirty reset.
  // Centralizing this means we cannot drift across the multiple import sites
  // (mount, dropdown pick, "New from scratch" in Story 16.3).
  const importAndFit = React.useCallback(
    async (xml: string) => {
      const m = modelerRef.current;
      if (!m) return;
      await m.importXML(xml);
      try {
        m.get("canvas").zoom("fit-viewport", "auto");
      } catch {}
      // commandStack is a fresh slate after a successful import — the
      // commandStack.changed listener will see canUndo() === false and reset
      // dirty, but we reset explicitly here as a belt-and-braces.
      setDirty(false);
      // bpmn-js doesn't reliably fire `commandStack.changed` on a fresh
      // import, so the outline-tree listener in useEffect can hold stale
      // elements from the previous diagram. Refresh explicitly here.
      refreshOutline();
    },
    [refreshOutline],
  );

  const loadDefinition = async (id: string) => {
    // Loading any definition clears the "View previous version" back-link.
    // The version-bump path (doDeploy) re-sets it AFTER awaiting this call.
    // LOAD-BEARING INVARIANT (Story 27.1): version-mode in doDeploy sets
    // activeDef DIRECTLY and does NOT call loadDefinition — precisely so this
    // clear does not wipe the freshly-set back-link. Do NOT route version-mode
    // through loadDefinition without re-sequencing setPreviousVersion.
    setPreviousVersion(null);
    if (!id) {
      setActiveDef(null);
      try {
        await importAndFit(BLANK_BPMN_XML);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
      setFilename("new-process.bpmn20.xml");
      // Loading a deployed definition (or the empty placeholder) ends any
      // in-progress "New from scratch" draft.
      setCreatingNew(false);
      return;
    }
    const def = definitions.find((d) => d.id === id);
    setActiveDef(def || null);
    setFilename((def?.key || "process") + ".bpmn20.xml");
    try {
      const xml = await api.getProcessDefinitionResource(id);
      await importAndFit(xml);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
    setCreatingNew(false);
  };

  // Story 16.2 AC-5 / AC-6: dropdown pick = load + URL update + confirm on
  // dirty. The dropdown is the operator's "switch to a different deployed
  // definition" affordance; the URL bookmark reflects the active definition.
  const handleDropdownChange = async (newId: string, prevId: string) => {
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes. Discard and load the selected definition?",
      );
      if (!ok) {
        // Restore the <select>'s value to the currently-loaded definition.
        // Because activeDef.id drives the controlled value, we just return —
        // React re-renders with the unchanged activeDef and the dropdown
        // snaps back. The `prevId` arg is retained for explicit
        // documentation that the cancel path keeps prevId active.
        void prevId;
        return;
      }
    }
    await loadDefinition(newId);
    // Sync the URL to the new definition (or clear when the placeholder is
    // re-picked). Use `replace: true` to avoid stuffing the history stack
    // with every dropdown pick.
    navigate({
      to: "/bpmn",
      search: newId ? { definitionId: newId } : {},
      replace: true,
    });
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
  // PR #168 follow-up round 4: deploy now opens a confirmation modal
  // asking for the process definition NAME + KEY, pre-filled from the
  // XML's <bpmn:process id name> tuple (or filename-derived defaults when
  // creatingNew). The modal calls back into `doDeploy(name, key)`, which
  // rewrites the XML and runs the actual multipart deploy.
  const [deployTarget, setDeployTarget] = React.useState<DeployBpmnModalTarget | null>(null);
  const deployBtnRef = React.useRef<HTMLButtonElement | null>(null);

  // Open the deploy modal with sensible defaults read off the current XML.
  const handleDeployClick = async () => {
    const m = modelerRef.current;
    if (!m) return;
    let xml = "";
    try {
      const out = await m.saveXML({ format: true });
      xml = out.xml as string;
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      toast({ kind: "error", text: `Could not read BPMN XML: ${msg}` });
      return;
    }
    const { id: xmlId, name: xmlName } = extractProcessIdAndName(xml);
    // Defaults:
    //   - draft: filename-derived key + readable name
    //   - loaded def: prefer the XML's existing id + name; fall back to
    //     activeDef.key / activeDef.name for definitions deployed via
    //     bpmn-js paths that strip the name attribute.
    const fallbackName = bpmnReadableNameFromFilename(filename);
    const fallbackKey = bpmnIdFromFilename(filename);
    const defaultKey = creatingNew || !xmlId || xmlId === "newProcess" ? fallbackKey : xmlId;
    const defaultName = creatingNew || !xmlName ? activeDef?.name || fallbackName : xmlName;
    setDeployTarget({ defaultKey, defaultName, filename });
  };

  // Story 16.3 AC-2 + AC-3 + PR #168 follow-up round 4: ACTUAL deploy.
  // Called by DeployBpmnModal on confirm with operator-typed values.
  // Errors thrown here surface as an in-modal ErrorBox so the operator
  // can fix-and-resubmit without re-typing.
  const doDeploy = async (chosenName: string, chosenKey: string): Promise<void> => {
    const m = modelerRef.current;
    if (!m) throw new Error("BPMN modeler not ready");
    // Story 27.1 — version mode is driven by the modal target's lockKey
    // flag (set by handleSaveNewVersion). In version mode we snapshot the
    // currently-loaded definition BEFORE the deploy swaps activeDef, then
    // auto-switch to the new version + render the "View previous version"
    // back-link. The wire-level call is the SAME api.deployBpmn multipart
    // POST as the generic Deploy — Flowable auto-versions per key.
    const versionMode = !!deployTarget?.lockKey;
    const prevSnapshot =
      versionMode && activeDef ? { id: activeDef.id, version: activeDef.version } : null;
    const { xml: rawXml } = await m.saveXML({ format: true });
    const xml = rewriteProcessKeyAndName(rawXml, chosenKey, chosenName);
    const deployment = await api.deployBpmn(filename, xml);
    setDirty(false);
    // Refresh the dropdown's definitions list so the deployed definition is
    // available for selection.
    const refresh = api
      .listProcessDefinitions({ size: 200, sort: "name" })
      .then((r) => {
        setDefinitions(r.data || []);
        return r.data || [];
      })
      .catch(() => [] as FlowableProcessDefinition[]);
    // Discover the new definition. Single-file deploy → exactly one
    // definition per deploymentId; a short retry absorbs engine
    // read-after-write lag (see Story 16.3 e2e fix).
    let newDef: FlowableProcessDefinition | null = null;
    for (let attempt = 0; attempt < 4 && !newDef; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 250));
      try {
        const list = await api.listProcessDefinitions({
          deploymentId: deployment.id,
          size: 10,
        });
        newDef = list.data?.[0] || null;
      } catch {}
    }
    await refresh;
    setCreatingNew(false);
    if (versionMode && newDef && prevSnapshot) {
      // AC-3: switch active selection + URL to the new version. The canvas
      // already renders the content we just deployed, so we set activeDef
      // directly from the fresh lookup rather than calling loadDefinition —
      // loadDefinition resolves the def from the (stale-in-this-closure)
      // dropdown list and would re-fetch identical XML. Setting state
      // directly avoids both the stale-list miss and a redundant fetch.
      navigate({ to: "/bpmn", search: { definitionId: newDef.id }, replace: true });
      setActiveDef(newDef);
      setFilename(`${newDef.key || "process"}.bpmn20.xml`);
      setPreviousVersion(prevSnapshot);
      toast({
        kind: "success",
        text: `Saved ${newDef.key} v${prevSnapshot.version} → v${newDef.version}`,
        action: {
          label: "Open the deployed definition",
          testId: "open-deployed-definition",
          onClick: () =>
            navigate({
              to: "/bpmn",
              search: { definitionId: newDef.id },
            }),
        },
      });
    } else if (newDef) {
      // Generic deploy — clear any stale back-link from a prior bump.
      setPreviousVersion(null);
      toast({
        kind: "success",
        text: `Deployed ${deployment.name} → ${newDef.key} v${newDef.version}`,
        action: {
          label: "Open the deployed definition",
          testId: "open-deployed-definition",
          onClick: () =>
            navigate({
              to: "/bpmn",
              search: { definitionId: newDef.id },
            }),
        },
      });
    } else {
      // Defensive: lookup failed (engine momentarily inconsistent) — plain success.
      toast({
        kind: "success",
        text: `Deployed ${deployment.name} (${deployment.id}).`,
        sub: "Refresh /definitions to see the new revision.",
      });
    }
  };

  // ─── Story 27.1 — "Save as new version" ────────────────────────────
  // OPERATOR-FEEL LABEL vs WIRE-LEVEL VERB (CLAUDE.md "Operator-feel UI
  // labels can diverge from wire-level action verbs"):
  //   - Operator-feel label: "Save as new version".
  //   - Wire-level action: the SAME `api.deployBpmn` multipart POST as the
  //     generic Deploy. Flowable has NO distinct "new version" endpoint —
  //     versioning is an emergent property of redeploying under the same
  //     process-definition key. There is intentionally NO `api.saveNewVersion`
  //     wrapper; inventing one would imply a wire verb that does not exist.
  // The load-bearing semantic is the KEY-LOCK: the modal opens with
  // `lockKey: true` pinned to `activeDef.key`, so the operator cannot fork
  // a new v1 family by editing the key. The name stays editable.
  const handleSaveNewVersion = async () => {
    if (!activeDef) return;
    const m = modelerRef.current;
    if (!m) return;
    const fallbackName = bpmnReadableNameFromFilename(filename);
    setDeployTarget({
      defaultKey: activeDef.key,
      defaultName: activeDef.name || fallbackName,
      filename,
      lockKey: true,
    });
  };

  // Story 16.3 AC-1: "New from scratch" — confirm-on-dirty, load BLANK,
  // clear ?definitionId= so the URL no longer points at any deployed def.
  const handleNew = async () => {
    if (dirty || creatingNew) {
      const ok = window.confirm("You have unsaved changes. Discard and start a new BPMN?");
      if (!ok) return;
    }
    setActiveDef(null);
    setPreviousVersion(null);
    setFilename("new-process.bpmn20.xml");
    try {
      await importAndFit(BLANK_BPMN_XML);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
    // Clear any deep-link search param — the operator is now editing a
    // not-yet-deployed BPMN.
    navigate({ to: "/bpmn", search: {}, replace: true });
    setCreatingNew(true);
  };

  // PR #168 follow-up: "Abort" / Discard — visible only while the operator
  // is in the middle of an authoring flow (creatingNew OR dirty). Pins the
  // dropdown's previously-selected definition (or BLANK if none) so the
  // operator can back out of an in-progress draft.
  const handleAbort = async () => {
    if (!creatingNew && !dirty) return;
    const ok = window.confirm(
      creatingNew
        ? "Discard the new BPMN draft? This cannot be undone."
        : "Discard unsaved edits and reload the active definition?",
    );
    if (!ok) return;
    setCreatingNew(false);
    if (activeDef) {
      // Re-fetch the deployed XML so the canvas matches engine state.
      try {
        const xml = await api.getProcessDefinitionResource(activeDef.id);
        await importAndFit(xml);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    } else {
      try {
        await importAndFit(BLANK_BPMN_XML);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    }
  };

  const zoom = (dir: number | "fit") => {
    const m = modelerRef.current;
    if (!m) return;
    const canvas = m.get("canvas");
    if (dir === "fit") canvas.zoom("fit-viewport", "auto");
    else canvas.zoom(canvas.zoom() * ((dir as number) > 0 ? 1.15 : 1 / 1.15));
  };

  return (
    <div className="modeler" data-engine="real">
      <div className="mod-toolbar">
        <div className="file-name">
          <Icon name="bpmn" size={14} />
          <input
            className="mod-filename"
            data-testid="bpmn-filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            readOnly={!creatingNew}
            size={Math.max(filename.length + 1, 24)}
            spellCheck={false}
            aria-label="BPMN filename"
            title={
              creatingNew
                ? "Filename + derived process id for the new BPMN"
                : "Filename of the deployed definition (read-only)"
            }
          />
          {activeDef?.tenantId && (
            <span style={{ color: "var(--fg-mute)" }}>· tenant: {activeDef.tenantId}</span>
          )}
          {creatingNew && (
            <span data-testid="bpmn-draft-badge" style={{ color: "var(--warn)" }}>
              · new draft
            </span>
          )}
          {dirty && <span style={{ color: "var(--warn)" }}>· unsaved</span>}
          {previousVersion && activeDef && previousVersion.id !== activeDef.id && (
            <Link
              to="/bpmn"
              search={{ definitionId: previousVersion.id }}
              className="btn"
              data-size="sm"
              data-variant="ghost"
              data-testid="bpmn-view-previous-version"
              title="Load the version this one was saved from"
              onClick={(e) => {
                // Route through handleDropdownChange for unified confirm-on-
                // dirty + URL sync; preventDefault stops the Link's own nav
                // so we don't double-navigate.
                e.preventDefault();
                handleDropdownChange(previousVersion.id, activeDef.id);
              }}
            >
              ← View previous version (v{previousVersion.version})
            </Link>
          )}
        </div>
        <div className="sep" />
        <select
          className="select modeler-dropdown"
          data-testid="bpmn-definition-dropdown"
          data-size="sm"
          value={activeDef?.id || ""}
          onChange={(e) => handleDropdownChange(e.target.value, activeDef?.id || "")}
          disabled={creatingNew}
          title={
            creatingNew
              ? "Save, deploy, or discard the new draft to switch definitions"
              : "Load deployed definition"
          }
        >
          <option value="">{creatingNew ? "— new draft —" : "— template (loan-approval) —"}</option>
          {definitions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name || d.key} v{d.version}
            </option>
          ))}
        </select>
        <div className="sep" />
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-new"
          onClick={handleNew}
          title="Start a new BPMN from blank"
        >
          <Icon name="plus" size={13} />
          New
        </button>
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-save-xml"
          onClick={saveXML}
        >
          <Icon name="save" size={13} />
          Save
        </button>
        <button
          ref={deployBtnRef}
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="bpmn-deploy"
          data-tone={dirty ? "warn" : undefined}
          onClick={handleDeployClick}
        >
          <Icon name="upload" size={13} />
          {dirty ? "Deploy *" : "Deploy"}
        </button>
        {activeDef && !creatingNew && (
          <button
            ref={saveVersionBtnRef}
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            data-testid="bpmn-save-new-version"
            onClick={handleSaveNewVersion}
            title={`Deploy the current canvas as the next version of ${activeDef.key}`}
          >
            <Icon name="upload" size={13} />
            Save as new version
          </button>
        )}
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export XML
        </button>
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveSVG}>
          <Icon name="download" size={13} />
          Export SVG
        </button>
        {(creatingNew || dirty) && (
          <button
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            data-tone="bad"
            data-testid="bpmn-abort"
            onClick={handleAbort}
            title={creatingNew ? "Discard the new BPMN draft" : "Discard unsaved edits and reload"}
          >
            <Icon name="x" size={13} />
            {creatingNew ? "Abort" : "Discard"}
          </button>
        )}
        <div className="spacer" />
        <div className="seg-row" style={{ margin: 0 }}>
          <button type="button" className="seg-btn" onClick={() => zoom(-1)} title="Zoom out">
            −
          </button>
          <button type="button" className="seg-btn" onClick={() => zoom("fit")} title="Fit">
            ⤢
          </button>
          <button type="button" className="seg-btn" onClick={() => zoom(1)} title="Zoom in">
            +
          </button>
        </div>
      </div>

      <div className="mod-canvas">
        <div ref={containerRef} className="bpmn-host" style={{ width: "100%", height: "100%" }} />
        {error && (
          <div
            role="alert"
            data-testid="bpmn-error-overlay"
            className="mono"
            style={{
              position: "absolute",
              inset: 20,
              background: "var(--bg-elev)",
              border: "1px solid var(--bad)",
              padding: 16,
              borderRadius: 8,
              color: "var(--bad)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <strong>Error</strong>
              <button
                type="button"
                className="btn"
                data-size="sm"
                data-variant="ghost"
                data-testid="bpmn-error-dismiss"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <Icon name="x" size={13} />
                Dismiss
              </button>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        )}
      </div>

      <FlowablePropertiesPanel
        modelerRef={modelerRef}
        selected={selected}
        version={version}
        bumpVersion={() => setVersion((v) => v + 1)}
        elements={elements}
      />
      <DeployBpmnModal
        target={deployTarget}
        onConfirm={doDeploy}
        onClose={() => setDeployTarget(null)}
        triggerRef={deployTarget?.lockKey ? saveVersionBtnRef : deployBtnRef}
      />
    </div>
  );
};
