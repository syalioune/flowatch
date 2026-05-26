// SPDX-License-Identifier: Apache-2.0

/**
 * DmnModeler — vanilla dmn-js wrapping (Pattern P-006).
 *
 * Instantiates `dmn-js/lib/Modeler` directly inside a useEffect, attaches
 * it to a ref'd <div>, and bridges save/deploy actions to api.deployDmn
 * (multipart against dmnBase()).
 *
 * Mirrors `<BpmnModeler>` shape — load via api.getDmnResource, dropdown
 * via api.listDecisions, dirty-state via commandStack.changed, zoom-to-
 * fit via canvas.zoom("fit-viewport"), New via LOAN_DMN_XML, Deploy via
 * api.deployDmn + post-deploy "Open the deployed decision".
 *
 * The resourceId for a decision is resolved via
 * `api.listDmnDeploymentResources(deploymentId)`. Per the live engine,
 * each resource's `id` is the filename (e.g. "loan-eligibility.dmn").
 * We pick the first `.dmn` resource — Flowable's DMN deployments
 * conventionally carry a single `.dmn` per deployment.
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

import { useNavigate } from "@tanstack/react-router";
// @migration-any: dmn-js has no shipped .d.ts; the default export is treated as
// a constructor and all event-bus / DI container interactions are `any`. ADR-001
// explicitly allows this for the modeler wrappers. Future: file an upstream issue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// @ts-expect-error — dmn-js/lib/Modeler has no type declarations
import DmnModelerClass from "dmn-js/lib/Modeler";
import React from "react";
import { api, type FlowableDecision, type FlowableDecisionResult } from "../api";
import { Icon, toast } from "../components";
import { LOAN_DMN_XML } from "./starters";

// @migration-any: dmn-js DI container, event-bus payloads, and view shapes
// are dynamic. Per ADR-001 consequences, this file is the allowed `any`
// zone — every cast below is documented at use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

type DmnDecisionResult = FlowableDecisionResult & {
  resultVariables?: Record<string, unknown>;
  ruleFired?: number[];
};

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

// ─── DMN modeler (real dmn-js) ─────────────────────────────────────
export const DmnModeler = ({ initialDecisionId }: DmnModelerProps) => {
  const navigate = useNavigate();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [view, setView] = React.useState<"drd" | "table">("table");
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [testInputs, setTestInputs] = React.useState<{
    creditScore: number;
    income: number;
    employmentStatus: string;
  }>({
    creditScore: 742,
    income: 86000,
    employmentStatus: "employed",
  });
  const [testResult, setTestResult] = React.useState<DmnDecisionResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [decisions, setDecisions] = React.useState<FlowableDecision[]>([]);
  const [decisionsAvailable, setDecisionsAvailable] = React.useState(true);
  const [activeDecision, setActiveDecision] = React.useState<FlowableDecision | null>(null);
  const [filename, setFilename] = React.useState("loan-eligibility.dmn");
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
          if (drdView) m.open(drdView);
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
      // is what's now relevant.
      setDirty(probeActiveViewDirty(m));
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

  // Story 16.4 AC-3: every import is followed by zoom-to-fit + dirty reset.
  // Shared helper so mount / dropdown-pick / new-from-scratch sites can't
  // drift.
  const importAndFit = React.useCallback(async (xml: string) => {
    const m = modelerRef.current;
    if (!m) return;
    await m.importXML(xml);
    // dmn-js auto-opens the first decision-table view; wait a tick for the
    // active viewer to mount before fitting.
    setTimeout(() => zoomActiveViewToFit(m), 50);
    setDirty(false);
  }, []);

  // Story 16.4 AC-4: resolve `resourceId` (filename) for a decision via the
  // deployment's resources list. Falls back to `{decisionKey}.dmn`-name
  // matching; if no match, returns the first `.dmn` resource.
  const resolveResourceId = React.useCallback(
    async (decision: FlowableDecision): Promise<string | null> => {
      try {
        const resources = await api.listDmnDeploymentResources(decision.deploymentId);
        const dmnResources = resources.filter((r) => r.id.endsWith(".dmn"));
        if (dmnResources.length === 0) return null;
        // Prefer a name that includes the decision key (multi-decision
        // deployments may carry one .dmn per decision); fall back to first.
        const match =
          dmnResources.find((r) => r.id.toLowerCase().includes(decision.key.toLowerCase())) ||
          dmnResources[0];
        return match?.id ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  // Story 16.4 AC-4: load a deployed decision into the modeler. Empty id
  // resets to LOAN_DMN_XML (mirrors BpmnModeler's empty-string branch).
  const loadDecision = React.useCallback(
    async (id: string) => {
      if (!id) {
        setActiveDecision(null);
        try {
          await importAndFit(LOAN_DMN_XML);
        } catch (e) {
          setError(String((e as Error)?.message || e));
        }
        setFilename("loan-eligibility.dmn");
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
        const resourceId = await resolveResourceId(decision);
        if (!resourceId) {
          throw new Error(`No .dmn resource found in deployment ${decision.deploymentId}`);
        }
        const xml = await api.getDmnResource(decision.deploymentId, resourceId);
        await importAndFit(xml);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
      setCreatingNew(false);
    },
    [decisions, importAndFit, resolveResourceId],
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

  // Story 16.4 AC-5: "New from scratch" loads LOAN_DMN_XML + clears the URL.
  // Per the spec, LOAN_DMN_XML is the starter (no BLANK_DMN_XML yet — Epic
  // 17 polish candidate).
  const handleNew = async () => {
    if (dirty || creatingNew) {
      const ok = window.confirm("You have unsaved changes. Discard and start a new DMN?");
      if (!ok) return;
    }
    setActiveDecision(null);
    setFilename("loan-eligibility.dmn");
    try {
      await importAndFit(LOAN_DMN_XML);
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
        const resourceId = await resolveResourceId(activeDecision);
        if (!resourceId) {
          throw new Error(`No .dmn resource found in deployment ${activeDecision.deploymentId}`);
        }
        const xml = await api.getDmnResource(activeDecision.deploymentId, resourceId);
        await importAndFit(xml);
        setError(null);
      } catch (e) {
        setError(String((e as Error)?.message || e));
      }
    } else {
      try {
        await importAndFit(LOAN_DMN_XML);
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
  // FlowableDeployment carries no inline `decisions[]` — fall-back lookup
  // via `api.listDecisions({deploymentId, latest, size:1})`. Same shape
  // as Story 16.3's BPMN deploy() path.
  const deploy = async () => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const { xml } = await m.saveXML({ format: true });
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
      // Discover the new decision. Single-file deploy → exactly one decision
      // per deploymentId; combining `latest=true` with `deploymentId` in
      // flowable-rest 7.2 dmn-api intermittently returned an empty page even
      // after a successful deploy (mirror of the BPMN issue documented in
      // BpmnModeler.tsx's deploy()). A short retry absorbs read-after-write
      // lag on the engine side.
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
      if (newDecision) {
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
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      // PR #168 follow-up: rely on the toast; don't overlay the canvas so
      // the operator can keep editing the draft after an engine error.
      toast({ kind: "error", text: `DMN deploy failed: ${msg}` });
    }
  };

  const runTest = async () => {
    setRunning(true);
    try {
      // Story 15.3 tightened the wrapper signature — flat object → typed
      // input-variable array. The local DmnDecisionResult intersects with
      // the wider FlowableDecisionResult so the cast remains safe.
      const r = (await api.executeDecision({
        decisionKey: "loanEligibility",
        inputVariables: Object.entries(testInputs).map(([name, value]) => ({
          name,
          type: typeof value === "number" ? "long" : "string",
          value,
        })),
      })) as DmnDecisionResult;
      setTestResult(r);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modeler" data-engine="real">
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
          type="button"
          className="btn"
          data-size="sm"
          data-variant="ghost"
          data-testid="dmn-deploy"
          data-tone={dirty ? "warn" : undefined}
          onClick={deploy}
        >
          <Icon name="upload" size={13} />
          {dirty ? "Deploy *" : "Deploy"}
        </button>
        <button type="button" className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export
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

      <div className="mod-props">
        <div className="panel-hd">
          <span className="panel-title">Test runner</span>
          <span
            className="mono"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            POST /dmn-rule/execute
          </span>
        </div>
        <div style={{ padding: 14, overflowY: "auto" }}>
          <div className="form-row">
            <label>Credit Score</label>
            <input
              className="input mono"
              value={testInputs.creditScore}
              onChange={(e) =>
                setTestInputs({ ...testInputs, creditScore: Number(e.target.value) })
              }
            />
          </div>
          <div className="form-row">
            <label>Annual Income</label>
            <input
              className="input mono"
              value={testInputs.income}
              onChange={(e) => setTestInputs({ ...testInputs, income: Number(e.target.value) })}
            />
          </div>
          <div className="form-row">
            <label>Employment</label>
            <select
              className="select"
              value={testInputs.employmentStatus}
              onChange={(e) => setTestInputs({ ...testInputs, employmentStatus: e.target.value })}
            >
              <option value="employed">employed</option>
              <option value="self-employed">self-employed</option>
              <option value="unemployed">unemployed</option>
            </select>
          </div>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            disabled={running}
            onClick={runTest}
            style={{ width: "100%" }}
          >
            <Icon name="play" size={13} />
            {running ? "Running…" : "Run decision"}
          </button>

          {testResult && (
            <>
              <div className="drawer-sect">Result</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(testResult.resultVariables || {}).map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 10px",
                      background: "var(--bg-sunken)",
                      borderRadius: 6,
                      border: "1px solid var(--line)",
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                      {k}
                    </span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                      {String(v)}
                    </span>
                  </div>
                ))}
              </div>
              {testResult.ruleFired && (
                <div className="mt-3" style={{ fontSize: 12, color: "var(--fg-soft)" }}>
                  Matched:{" "}
                  <span className="badge" data-tone="info">
                    {testResult.ruleFired}
                  </span>
                </div>
              )}
            </>
          )}

          <div className="drawer-sect">Engine</div>
          <div className="code" style={{ whiteSpace: "pre-wrap" }}>
            {`bpmn-js  17.11.1   apache 2.0  bpmn.io
dmn-js   16.6.1    apache 2.0  bpmn.io
target   Flowable 7 REST API`}
          </div>
        </div>
      </div>
    </div>
  );
};
