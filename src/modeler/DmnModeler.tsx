// SPDX-License-Identifier: Apache-2.0

/**
 * DmnModeler — vanilla dmn-js wrapping (Pattern P-006).
 *
 * Instantiates `dmn-js/lib/Modeler` directly inside a useEffect, attaches
 * it to a ref'd <div>, and bridges save/deploy actions to api.deployDmn
 * (multipart against dmnBase()).
 *
 * Mirrors `<BpmnModeler>` shape — load via api.getDmnDecisionResource,
 * dropdown via api.listDecisions, dirty-state via commandStack.changed,
 * zoom-to-fit via canvas.zoom("fit-viewport"), New via BLANK_DMN_XML
 * (clean slate), Deploy via api.deployDmn + post-deploy "Open the
 * deployed decision". Initial mount loads LOAN_DMN_XML so operators see
 * what DMN can do.
 *
 * XML load is keyed by the decision-table id — Flowable exposes
 * `/dmn-repository/decision-tables/{id}/resourcedata` which streams the
 * raw XML for that decision. The older deployment-resources lookup path
 * was a dead endpoint (returned 500 "No endpoint" on the DMN sub-app).
 *
 * Per-view dirty-state: dmn-js's commandStack is per-active-view (DRD /
 * decision-table / literal-expression). We poll the active view's
 * `commandStack.canUndo()` on `commandStack.changed`. The simpler
 * approach (vs iterating ALL views per AC-2's `checkAnyViewDirty`)
 * because the active-view stack is what the operator is editing right
 * now — adequate operator-feel for v0.0.2; documented in Story 16.4 DAR.
 *
 * ADR-001 — vanilla wrapping; no dmn-js-react bindings.
 * Story 16.4 — extracted from src/modeler.tsx with full BPMN-feature
 * parity (load + dropdown + dirty + new + deploy + post-deploy nav).
 */

import { Link, useNavigate } from "@tanstack/react-router";
// @migration-any: dmn-js has no shipped .d.ts; the default export is treated as
// a constructor and all event-bus / DI container interactions are `any`. ADR-001
// explicitly allows this for the modeler wrappers. Future: file an upstream issue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// @ts-expect-error — dmn-js/lib/Modeler has no type declarations
import DmnModelerClass from "dmn-js/lib/Modeler";
import React from "react";
import { api, type FlowableDecision } from "../api";
import { Icon, toast } from "../components";
import { DeployDmnModal, type DeployDmnModalTarget } from "../lib/deploy-dmn-modal";
import { ExecuteDecisionModal } from "../lib/execute-decision-modal";
import { BLANK_DMN_XML, LOAN_DMN_XML } from "./starters";

// @migration-any: dmn-js DI container, event-bus payloads, and view shapes
// are dynamic. Per ADR-001 consequences, this file is the allowed `any`
// zone — every cast below is documented at use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

// ─── Typed event-bus payloads (Story 16.4 AC-2) ──────────────────────
// dmn-js publishes the EventBus surface but not the payload shapes for
// our consumed events. Local interfaces name the fields the modeler
// actually reads at runtime.

interface DmnSelectionChangedEvent {
  newSelection: AnyEl[];
  oldSelection?: AnyEl[];
}

interface DmnCommandStackChangedEvent {
  context?: unknown;
}

interface DmnViewsChangedEvent {
  activeView?: { type: string; id: string };
  views?: Array<{ type: string; id: string }>;
}

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

interface DmnModelerProps {
  /** Deep-link: pre-select this decision and trigger its XML load on mount. */
  initialDecisionId?: string | undefined;
}

// Active-view dirty probe: dmn-js's per-view commandStack lives on the
// active view's viewer (DRD / decision-table / literal-expression). We
// reach over to it on each commandStack.changed and views.changed.
const probeActiveViewDirty = (modeler: AnyModeler): boolean => {
  try {
    const activeViewer = modeler.getActiveViewer?.();
    if (!activeViewer) return false;
    const cmdStack = activeViewer.get?.("commandStack");
    return !!cmdStack?.canUndo?.();
  } catch {
    return false;
  }
};

// Fit-viewport on the active view's canvas. dmn-js's canvas is per-view.
const zoomActiveViewToFit = (modeler: AnyModeler): void => {
  try {
    const activeViewer = modeler.getActiveViewer?.();
    activeViewer?.get?.("canvas")?.zoom?.("fit-viewport", "auto");
  } catch {
    // Ignore — the active view may not expose a canvas (e.g. on transient
    // mount states); zoom-to-fit is best-effort polish, not load-bearing.
  }
};

// Workaround for dmn-js's `.dmn-definitions-name` / `.dmn-definitions-id`
// caret-reset bug. After every `element.updateProperties` (which fires on
// each debounced edit during typing), `DefinitionPropertiesView.update()`
// unconditionally writes `textContent` for both the name and id elements
// — even when the value didn't change. Setting `textContent` on a focused
// contenteditable node wipes its child text node and recreates it, which
// resets the caret to position 0. We monkey-patch the view's `update()`
// to compare-and-skip so a no-op write stays a true no-op.
//
// The patch is idempotent (guarded via `__flowatchGuarded`) and best-
// effort: if the DRD viewer doesn't expose `definitionPropertiesView`,
// the catch swallows and we leave the upstream behaviour alone.
interface DefPropertiesViewLike {
  __flowatchGuarded?: boolean;
  update?: () => void;
  nameElement?: Element;
  idElement?: Element;
  _canvas?: {
    getRootElement?: () => { businessObject?: { name?: string; id?: string } };
  };
}
const patchDmnDefinitionsCaretReset = (modeler: AnyModeler): void => {
  try {
    const activeViewer = modeler.getActiveViewer?.();
    const defView = activeViewer?.get?.("definitionPropertiesView") as
      | DefPropertiesViewLike
      | undefined;
    if (!defView || typeof defView.update !== "function" || defView.__flowatchGuarded) return;
    defView.__flowatchGuarded = true;
    defView.update = function () {
      const businessObject = this._canvas?.getRootElement?.()?.businessObject ?? {};
      if (this.nameElement && this.nameElement.textContent !== (businessObject.name ?? "")) {
        this.nameElement.textContent = businessObject.name ?? "";
      }
      if (this.idElement && this.idElement.textContent !== (businessObject.id ?? "")) {
        this.idElement.textContent = businessObject.id ?? "";
      }
    };
  } catch {
    // The DRD viewer may not yet be active (table view is current) — the
    // next views.changed event will retry.
  }
};

// Strip .dmn / .xml extension; replace non-id chars with `-`; trim
// dashes. Used as the deploy-modal default when the XML has no usable
// `<definitions id>` (e.g. BLANK template placeholder).
const dmnIdFromFilename = (filename: string): string => {
  const base = filename.replace(/\.dmn$/i, "").replace(/\.xml$/i, "");
  const slug = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "Definitions";
};

// Operator-feel readable name from a filename — strips extension,
// replaces separators with spaces, title-cases. Used as the modal's
// definition-name default when the XML only carries an id.
const dmnReadableNameFromFilename = (filename: string): string => {
  const base = filename.replace(/\.dmn$/i, "").replace(/\.xml$/i, "");
  const words = base
    .replace(/[_.-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "New decisions";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

// XML attribute-value escaper for operator-typed strings going into
// id / name attributes. Mirrors BpmnModeler's helper.
const escapeXmlAttr = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Extract the outermost `<definitions id="…" name="…">` tuple from the
// DMN XML. dmn-js's models use no namespace prefix on the `<definitions>`
// element (DMN spec default namespace). Returns nulls when the attribute
// is absent.
const extractDefinitionsIdAndName = (xml: string): { id: string | null; name: string | null } => {
  const m = xml.match(/<definitions\b[^>]*>/);
  if (!m) return { id: null, name: null };
  const tag = m[0];
  const idMatch = tag.match(/\bid="([^"]+)"/);
  const nameMatch = tag.match(/\bname="([^"]*)"/);
  return { id: idMatch?.[1] ?? null, name: nameMatch?.[1] ?? null };
};

// Rewrite the OUTER `<definitions>` element's id + name to the operator-
// chosen values. Only the FIRST `<definitions …>` tag is touched —
// inner `<decision id>` references and `<dmndi:DMNShape dmnElementRef>`
// references point at individual decisions, not at the definitions
// element, so we don't need a global id sweep like BPMN does.
const rewriteDefinitionsIdAndName = (xml: string, newId: string, newName: string): string => {
  const safeName = escapeXmlAttr(newName);
  let next = xml;
  // Rewrite id (or inject if missing).
  if (/<definitions\b[^>]*\bid="[^"]*"/.test(next)) {
    next = next.replace(/<definitions\b([^>]*?)\bid="[^"]*"/, `<definitions$1 id="${newId}"`);
  } else {
    next = next.replace(/<definitions\b/, `<definitions id="${newId}"`);
  }
  // Rewrite name (or inject if missing).
  if (/<definitions\b[^>]*\bname="[^"]*"/.test(next)) {
    next = next.replace(
      /<definitions\b([^>]*?)\bname="[^"]*"/,
      `<definitions$1 name="${safeName}"`,
    );
  } else {
    next = next.replace(/<definitions\b/, `<definitions name="${safeName}"`);
  }
  return next;
};

// ─── DMN modeler (real dmn-js) ─────────────────────────────────────
export const DmnModeler = ({ initialDecisionId }: DmnModelerProps) => {
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [view, setView] = React.useState<"drd" | "table">("table");
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  // The old fixed-input test-runner side panel was retired in favour of
  // the canonical <ExecuteDecisionModal> (form generation from parsed XML
  // inputs). The modal is opened from a top-bar action button after
  // Export, and requires an `activeDecision` (= a DEPLOYED decision) —
  // drafts can be executed only after a deploy.
  const [executeOpen, setExecuteOpen] = React.useState(false);
  const executeBtnRef = React.useRef<HTMLButtonElement>(null);
  const [decisions, setDecisions] = React.useState<FlowableDecision[]>([]);
  const [decisionsAvailable, setDecisionsAvailable] = React.useState(true);
  const [activeDecision, setActiveDecision] = React.useState<FlowableDecision | null>(null);
  const [filename, setFilename] = React.useState("loan-eligibility.dmn");
  // Story 27.1 — "Save as new version" back-reference (mirrors BpmnModeler).
  // Ephemeral component-local state — null until an in-session version bump.
  const [previousVersion, setPreviousVersion] = React.useState<{
    id: string;
    version: number;
  } | null>(null);
  const saveVersionBtnRef = React.useRef<HTMLButtonElement | null>(null);
  // PR #168 follow-up: tracks the "New from scratch" authoring flow.
  // True between handleNew() and the next discard / save / deploy / load —
  // pins the dropdown so the operator can't switch decisions mid-draft.
  const [creatingNew, setCreatingNew] = React.useState(false);

  // Story 16.4 AC-4: load the deployed-decisions list for the dropdown.
  React.useEffect(() => {
    api
      .listDecisions({ size: 200 })
      .then((r) => setDecisions(r.data || []))
      .catch(() => setDecisionsAvailable(false));
  }, []);

  React.useEffect(() => {
    let m: AnyModeler;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      m = new DmnModelerClass({
        container: containerRef.current as HTMLElement,
        keyboard: { bindTo: window },
      });
    } catch (e) {
      setError(String(e));
      return;
    }
    modelerRef.current = m;
    m.importXML(LOAN_DMN_XML)
      .then(() => {
        try {
          const views = m.getViews();
          const drdView = views.find((v: AnyEl) => v.type === "drd");
          if (drdView) {
            m.open(drdView);
            // DRD viewer is now active — patch its caret-reset bug while
            // we're here (also retried on every views.changed below).
            patchDmnDefinitionsCaretReset(m);
          }
          setView("drd");
          pendingTimeout = setTimeout(() => {
            pendingTimeout = null;
            const elig = views.find((v: AnyEl) => v.element && v.element.id === "loanEligibility");
            if (elig) {
              m.open(elig);
              setView("table");
            }
            zoomActiveViewToFit(m);
          }, 50);
          setDirty(false);
        } catch (e) {
          console.warn(e);
        }
      })
      .catch((e: Error) => setError(String(e.message || e)));

    // Story 16.4 AC-2: typed event-bus subscriptions on the multi-view
    // dmn-js modeler. We listen on the OUTER modeler's eventBus for
    // `views.changed` (active-view switches) and proxy commandStack.changed
    // to the same dirty-state probe.
    const onViewsChanged = (_event: DmnViewsChangedEvent) => {
      // Re-poll dirty after a view switch — the active view's commandStack
      // is what's now relevant. Also attempt the .dmn-definitions caret-
      // reset patch here: the DRD viewer is only instantiated once it
      // becomes active, so we patch lazily on every view switch.
      setDirty(probeActiveViewDirty(m));
      patchDmnDefinitionsCaretReset(m);
    };
    const onCommandStackChanged = (_event: DmnCommandStackChangedEvent) => {
      setDirty(probeActiveViewDirty(m));
    };
    const onSelectionChanged = (_event: DmnSelectionChangedEvent) => {
      // Selection events are unused by the chrome today; we subscribe so
      // diagram-js typings stay exercised + future polish stories can hook.
    };

    try {
      const eventBus = m._eventBus || m.get?.("eventBus");
      eventBus?.on?.("views.changed", onViewsChanged);
      eventBus?.on?.("commandStack.changed", onCommandStackChanged);
      eventBus?.on?.("selection.changed", onSelectionChanged);
    } catch {
      // dmn-js's outer event-bus access is API-private; ignore silently.
    }

    return () => {
      if (pendingTimeout !== null) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
      try {
        m.destroy();
      } catch {}
      modelerRef.current = null;
    };
  }, []);

  // Every import is followed by an explicit view-open + zoom-to-fit + dirty
  // reset. Shared helper so mount / dropdown-pick / new-from-scratch sites
  // can't drift.
  //
  // The view-open step is load-bearing: after `m.importXML(newXml)`, dmn-js
  // keeps the PREVIOUSLY-active view object referenced — clicking the
  // dropdown loads new XML but the diagram canvas keeps rendering the old
  // view's content. We need to find a view in the freshly-parsed model and
  // call `m.open(view)` to switch.
  //
  // Selection order:
  //   1. decision-table view whose element id matches `preferKey`
  //      (the operator picked a specific decision)
  //   2. any decision-table view
  //   3. any view (last-resort fallback)
  const importAndFit = React.useCallback(
    async (xml: string, preferKey?: string | null): Promise<void> => {
      const m = modelerRef.current;
      if (!m) return;
      await m.importXML(xml);
      try {
        const views: AnyEl[] = m.getViews?.() ?? [];
        let target: AnyEl | undefined;
        if (preferKey) {
          target = views.find(
            (v: AnyEl) => v.type === "decisionTable" && v.element?.id === preferKey,
          );
        }
        target = target ?? views.find((v: AnyEl) => v.type === "decisionTable") ?? views[0];
        if (target) {
          m.open(target);
          if (target.type === "decisionTable") setView("table");
          else if (target.type === "drd") setView("drd");
        }
        // Patch the caret-reset bug if the DRD viewer is the active one
        // now. No-op when active is decision-table (then views.changed
        // fires when operator switches to DRD).
        patchDmnDefinitionsCaretReset(m);
      } catch {
        // best-effort; the canvas stays on whatever dmn-js picked.
      }
      // Wait a tick for the active viewer to mount before fitting.
      setTimeout(() => zoomActiveViewToFit(m), 50);
      setDirty(false);
    },
    [],
  );

  // Load a deployed decision into the modeler. Empty id resets to
  // LOAN_DMN_XML (mirrors BpmnModeler's empty-string branch). XML is
  // fetched directly via `/dmn-repository/decision-tables/{id}/resourcedata`
  // — no deployment-resources lookup hop (that endpoint returns 500 on the
  // DMN sub-app).
  const loadDecision = React.useCallback(
    async (id: string) => {
      // Loading any decision clears the "View previous version" back-link.
      // The version-bump path (doDeploy) re-sets it AFTER awaiting this call.
      // LOAD-BEARING INVARIANT (Story 27.1): version-mode in doDeploy sets
      // activeDecision DIRECTLY and does NOT call loadDecision — precisely so
      // this clear does not wipe the freshly-set back-link. Do NOT route
      // version-mode through loadDecision without re-sequencing setPreviousVersion.
      setPreviousVersion(null);
      if (!id) {
        setActiveDecision(null);
        try {
          // Mirror BpmnModeler's empty-id branch: a CLEAN slate, not the
          // demo. The dropdown's "—" entry is a "fresh start" signal.
          await importAndFit(BLANK_DMN_XML, "decision");
        } catch (e) {
          setError(String((e as Error)?.message || e));
        }
        setFilename("new-decision.dmn");
        setCreatingNew(false);
        return;
      }
      const decision = decisions.find((d) => d.id === id);
      if (!decision) {
        setError(`Decision ${id} not found in the dropdown list`);
        return;
      }
      setActiveDecision(decision);
      setFilename(`${decision.key}.dmn`);
      try {
        const xml = await api.getDmnDecisionResource(decision.id);
        await importAndFit(xml, decision.key);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
      setCreatingNew(false);
    },
    [decisions, importAndFit],
  );

  // Story 16.4 AC-3: deep-link autoload from `?decisionId=`. Defer until
  // both the decisions list AND the modeler instance are present.
  const loadInvokedRef = React.useRef(false);
  React.useEffect(() => {
    if (loadInvokedRef.current) return;
    if (!initialDecisionId) return;
    if (!modelerRef.current) return;
    if (decisions.length === 0) return;
    loadInvokedRef.current = true;
    loadDecision(initialDecisionId);
  }, [initialDecisionId, decisions, loadDecision]);

  // Story 16.4 AC-4: dropdown pick + URL sync + confirm-on-dirty.
  const handleDropdownChange = async (newId: string) => {
    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes. Discard and load the selected decision?",
      );
      if (!ok) return;
    }
    await loadDecision(newId);
    navigate({
      to: "/dmn",
      search: newId ? { decisionId: newId } : {},
      replace: true,
    });
  };

  // "New from scratch" loads BLANK_DMN_XML (one empty decision, one Input
  // column, one Output column with `name="output"`) so the operator gets a
  // clean slate. Mirrors BpmnModeler's BLANK_BPMN_XML behaviour.
  const handleNew = async () => {
    if (dirty || creatingNew) {
      const ok = window.confirm("You have unsaved changes. Discard and start a new DMN?");
      if (!ok) return;
    }
    setActiveDecision(null);
    setPreviousVersion(null);
    setFilename("new-decision.dmn");
    try {
      await importAndFit(BLANK_DMN_XML, "decision");
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message || e));
    }
    navigate({ to: "/dmn", search: {}, replace: true });
    setCreatingNew(true);
  };

  // PR #168 follow-up: Abort the in-progress draft (or unsaved edits) by
  // re-importing the active decision's clean XML, falling back to LOAN_DMN_XML
  // when no decision is active.
  const handleAbort = async () => {
    if (!creatingNew && !dirty) return;
    const ok = window.confirm(
      creatingNew
        ? "Discard the new DMN draft? This cannot be undone."
        : "Discard unsaved edits and reload the active decision?",
    );
    if (!ok) return;
    setCreatingNew(false);
    if (activeDecision) {
      try {
        const xml = await api.getDmnDecisionResource(activeDecision.id);
        await importAndFit(xml, activeDecision.key);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    } else {
      try {
        await importAndFit(BLANK_DMN_XML, "decision");
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    }
  };

  const switchView = (which: "drd" | "table") => {
    const m = modelerRef.current;
    if (!m) return;
    const views = m.getViews();
    if (which === "drd") {
      const v = views.find((x: AnyEl) => x.type === "drd");
      if (v) {
        m.open(v);
        setView("drd");
      }
    } else {
      const v =
        views.find((x: AnyEl) => x.element && x.element.id === "loanEligibility") ||
        views.find((x: AnyEl) => x.type === "decisionTable");
      if (v) {
        m.open(v);
        setView("table");
      }
    }
  };

  const saveXML = async () => {
    const m = modelerRef.current;
    if (!m) return;
    const { xml } = await m.saveXML({ format: true });
    download(filename, xml, "application/xml");
  };

  // Story 16.4 AC-6: deploy + post-deploy "Open the deployed decision" toast.
  // Deploy now opens a confirmation modal asking for the DMN definition
  // NAME + ID, pre-filled from the XML's `<definitions id name>` tuple
  // (or filename-derived defaults when creatingNew). Mirrors BPMN's
  // PR #168 round 4 shape.
  const [deployTarget, setDeployTarget] = React.useState<DeployDmnModalTarget | null>(null);
  const deployBtnRef = React.useRef<HTMLButtonElement>(null);

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
      toast({ kind: "error", text: `Could not read DMN XML: ${msg}` });
      return;
    }
    const { id: xmlId, name: xmlName } = extractDefinitionsIdAndName(xml);
    const fallbackName = dmnReadableNameFromFilename(filename);
    const fallbackKey = dmnIdFromFilename(filename);
    // Defaults: prefer the XML's current id/name (= what dmn-js's
    // .dmn-definitions-name/-id editors show). Fall back to filename-
    // derived values on a BLANK template placeholder.
    const placeholderIds = new Set(["Definitions_blank", "Definitions_1"]);
    const defaultKey = creatingNew || !xmlId || placeholderIds.has(xmlId) ? fallbackKey : xmlId;
    const defaultName = creatingNew || !xmlName ? fallbackName : xmlName;
    setDeployTarget({ defaultKey, defaultName, filename });
  };

  // ACTUAL deploy. Called by DeployDmnModal on confirm with operator-typed
  // values. Errors thrown here surface as an in-modal ErrorBox so the
  // operator can fix-and-resubmit without re-typing.
  const doDeploy = async (chosenName: string, chosenKey: string): Promise<void> => {
    const m = modelerRef.current;
    if (!m) throw new Error("DMN modeler not ready");
    // Story 27.1 — version mode (lockKey) mirrors BpmnModeler.doDeploy:
    // snapshot the loaded decision before the deploy, then auto-switch to
    // the new version + render the back-link. Wire-level call is the SAME
    // api.deployDmn multipart POST — Flowable auto-versions per decision key.
    const versionMode = !!deployTarget?.lockKey;
    const prevSnapshot =
      versionMode && activeDecision
        ? { id: activeDecision.id, version: activeDecision.version }
        : null;
    const { xml: rawXml } = await m.saveXML({ format: true });
    const xml = rewriteDefinitionsIdAndName(rawXml, chosenKey, chosenName);
    const deployment = await api.deployDmn(filename, xml);
    setDirty(false);
    // Refresh the dropdown so the new decision is selectable.
    const refresh = api
      .listDecisions({ size: 200 })
      .then((r) => {
        setDecisions(r.data || []);
        return r.data || [];
      })
      .catch(() => [] as FlowableDecision[]);
    // Single-file deploy → fetch the first decision in the new deployment.
    // A short retry absorbs read-after-write lag on the engine side
    // (same quirk as BPMN's deploy path).
    let newDecision: FlowableDecision | null = null;
    for (let attempt = 0; attempt < 4 && !newDecision; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 250));
      try {
        const list = await api.listDecisions({ deploymentId: deployment.id, size: 10 });
        newDecision = list.data?.[0] || null;
      } catch {}
    }
    await refresh;
    setCreatingNew(false);
    if (versionMode && newDecision && prevSnapshot) {
      // AC-3/AC-5: switch active selection + URL to the new version. Set
      // activeDecision directly from the fresh lookup — the canvas already
      // renders the deployed content, and loadDecision would resolve from
      // the stale-in-this-closure dropdown list (missing the new decision)
      // and re-fetch identical XML.
      navigate({ to: "/dmn", search: { decisionId: newDecision.id }, replace: true });
      setActiveDecision(newDecision);
      setFilename(`${newDecision.key}.dmn`);
      setPreviousVersion(prevSnapshot);
      toast({
        kind: "success",
        text: `Saved ${newDecision.key} v${prevSnapshot.version} → v${newDecision.version}`,
        action: {
          label: "Open the deployed decision",
          testId: "open-deployed-decision",
          onClick: () =>
            navigate({
              to: "/dmn",
              search: { decisionId: newDecision.id },
            }),
        },
      });
    } else if (newDecision) {
      // Generic deploy — clear any stale back-link from a prior bump.
      setPreviousVersion(null);
      toast({
        kind: "success",
        text: `Deployed ${deployment.name} → ${newDecision.key} v${newDecision.version}`,
        action: {
          label: "Open the deployed decision",
          testId: "open-deployed-decision",
          onClick: () =>
            navigate({
              to: "/dmn",
              search: { decisionId: newDecision.id },
            }),
        },
      });
    } else {
      toast({
        kind: "success",
        text: `Deployed ${deployment.name} (${deployment.id}).`,
        sub: "Refresh /decisions to see the new revision.",
      });
    }
  };

  // ─── Story 27.1 — "Save as new version" ────────────────────────────
  // OPERATOR-FEEL LABEL vs WIRE-LEVEL VERB (CLAUDE.md): "Save as new
  // version" is the operator-feel label; the wire-level action is the SAME
  // `api.deployDmn` multipart POST as the generic Deploy. Flowable has NO
  // distinct "new version" endpoint — versioning is emergent from
  // redeploying with the same DECISION key (`<decision id>`).
  //
  // DMN nuance vs BPMN (live-engine discovery, Story 27.1): the deploy
  // modal's "id" field maps to the `<definitions id>` WRAPPER, NOT the
  // `<decision id>` that Flowable versions by. The decision key is already
  // preserved in the unchanged re-exported canvas, so versioning works
  // without touching the modal. We therefore lock the modal's id to the
  // CURRENT `<definitions id>` (preserving it) rather than to
  // `activeDecision.key` — forcing it to the decision key would make
  // `<definitions id>` == `<decision id>` and the engine rejects the
  // deploy with `cvc-id.2: multiple occurrences of ID value` (duplicate
  // XML id). NO `api.saveNewVersion` wrapper.
  const handleSaveNewVersion = async () => {
    if (!activeDecision) return;
    const m = modelerRef.current;
    if (!m) return;
    let defId = "";
    let defName = activeDecision.name || dmnReadableNameFromFilename(filename);
    try {
      const out = await m.saveXML({ format: true });
      const { id, name } = extractDefinitionsIdAndName(out.xml as string);
      if (id) defId = id;
      if (name) defName = name;
    } catch {
      // best-effort — fall through to filename-derived defaults below.
    }
    setDeployTarget({
      defaultKey: defId || dmnIdFromFilename(filename),
      defaultName: defName,
      filename,
      lockKey: true,
    });
  };

  return (
    <div className="modeler" data-engine="real" data-kind="dmn">
      <div className="mod-toolbar">
        <div className="file-name">
          <Icon name="dmn" size={14} />
          <input
            className="mod-filename"
            data-testid="dmn-filename"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            readOnly={!creatingNew}
            size={Math.max(filename.length + 1, 24)}
            spellCheck={false}
            aria-label="DMN filename"
            title={
              creatingNew
                ? "Filename for the new DMN"
                : "Filename of the deployed decision (read-only)"
            }
          />
          {activeDecision?.tenantId && (
            <span style={{ color: "var(--fg-mute)" }}>· tenant: {activeDecision.tenantId}</span>
          )}
          {!decisionsAvailable && (
            <span style={{ color: "var(--warn)", fontSize: 11 }}>· DMN engine unavailable</span>
          )}
          {creatingNew && (
            <span data-testid="dmn-draft-badge" style={{ color: "var(--warn)" }}>
              · new draft
            </span>
          )}
          {dirty && <span style={{ color: "var(--warn)" }}>· unsaved</span>}
          {previousVersion && activeDecision && previousVersion.id !== activeDecision.id && (
            <Link
              to="/dmn"
              search={{ decisionId: previousVersion.id }}
              className="btn"
              data-size="sm"
              data-variant="ghost"
              data-testid="dmn-view-previous-version"
              title="Load the version this one was saved from"
              onClick={(e) => {
                e.preventDefault();
                handleDropdownChange(previousVersion.id);
              }}
            >
              ← View previous version (v{previousVersion.version})
            </Link>
          )}
        </div>
        <div className="sep" />
        <select
          className="select modeler-dropdown"
          data-testid="dmn-decision-dropdown"
          data-size="sm"
          value={activeDecision?.id || ""}
          onChange={(e) => handleDropdownChange(e.target.value)}
          disabled={creatingNew}
          title={
            creatingNew
              ? "Save, deploy, or discard the new draft to switch decisions"
              : "Load deployed decision"
          }
        >
          <option value="">
            {creatingNew ? "— new draft —" : "— template (loan-eligibility) —"}
          </option>
          {decisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.key} v{d.version}
              {d.name && d.name !== d.key ? ` — ${d.name}` : ""}
            </option>
          ))}
        </select>
        <div className="sep" />
        <div className="seg-row" style={{ margin: 0 }}>
          <button
            type="button"
            className="seg-btn"
            data-on={view === "table" ? "1" : "0"}
            onClick={() => switchView("table")}
          >
            Decision table
          </button>
          <button
            type="button"
            className="seg-btn"
            data-on={view === "drd" ? "1" : "0"}
            onClick={() => switchView("drd")}
          >
            DRD
          </button>
        </div>
        <div className="sep" />
        <button
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="dmn-new"
          onClick={handleNew}
          title="Start a new DMN from the loan-eligibility template"
        >
          <Icon name="plus" size={13} />
          New
        </button>
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="save" size={13} />
          Save
        </button>
        <button
          ref={deployBtnRef}
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="dmn-deploy"
          data-tone={dirty ? "warn" : undefined}
          onClick={handleDeployClick}
        >
          <Icon name="upload" size={13} />
          {dirty ? "Deploy *" : "Deploy"}
        </button>
        {activeDecision && !creatingNew && (
          <button
            ref={saveVersionBtnRef}
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            data-testid="dmn-save-new-version"
            onClick={handleSaveNewVersion}
            title={`Deploy the current canvas as the next version of ${activeDecision.key}`}
          >
            <Icon name="upload" size={13} />
            Save as new version
          </button>
        )}
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export
        </button>
        <button
          ref={executeBtnRef}
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="dmn-test-execute"
          disabled={!activeDecision || creatingNew}
          onClick={() => setExecuteOpen(true)}
          title={
            !activeDecision || creatingNew
              ? "Deploy the decision before test-executing"
              : `Test execute ${activeDecision.key} v${activeDecision.version}`
          }
          aria-label="Test execute decision"
        >
          <Icon name="play" size={13} />
          Test execute
        </button>
        {(creatingNew || dirty) && (
          <button
            type="button"
            className="btn"
            data-size="sm"
            data-variant="ghost"
            data-tone="bad"
            data-testid="dmn-abort"
            onClick={handleAbort}
            title={creatingNew ? "Discard the new DMN draft" : "Discard unsaved edits and reload"}
          >
            <Icon name="x" size={13} />
            {creatingNew ? "Abort" : "Discard"}
          </button>
        )}
        <div className="spacer" />
      </div>

      <div className="mod-canvas">
        <div ref={containerRef} className="dmn-host" style={{ width: "100%", height: "100%" }} />
        {error && (
          <div
            role="alert"
            data-testid="dmn-error-overlay"
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
                data-testid="dmn-error-dismiss"
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

      <DeployDmnModal
        target={deployTarget}
        onConfirm={doDeploy}
        onClose={() => setDeployTarget(null)}
        triggerRef={deployTarget?.lockKey ? saveVersionBtnRef : deployBtnRef}
      />
      <ExecuteDecisionModal
        decision={executeOpen ? activeDecision : null}
        onClose={() => setExecuteOpen(false)}
        triggerRef={executeBtnRef}
      />
    </div>
  );
};
