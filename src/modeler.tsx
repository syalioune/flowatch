// SPDX-License-Identifier: Apache-2.0

// @migration-any: dmn-js has no shipped .d.ts; the default export is treated as
// a constructor and all event-bus / DI container interactions are `any`. ADR-001
// explicitly allows this for the modeler wrappers. Future: file an upstream issue.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// @ts-expect-error — dmn-js/lib/Modeler has no type declarations
import DmnModelerClass from "dmn-js/lib/Modeler";
import React from "react";
import { api } from "./api";
import { Icon } from "./components";
import { LOAN_DMN_XML } from "./modeler/starters";

const openInspector = () => {
  window.dispatchEvent(new CustomEvent<void>("app:open-inspector"));
};

// @migration-any: dmn-js DI container, event-bus payloads, and view shapes
// are dynamic. Per ADR-001 consequences, this file is the allowed `any`
// zone — every cast below is documented at use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModeler = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = any;

// ─── DMN modeler (real dmn-js) ─────────────────────────────────────
type DmnDecision = import("./api").FlowableDecision;
type DmnDecisionResult = import("./api").FlowableDecisionResult & {
  resultVariables?: Record<string, unknown>;
  ruleFired?: number[];
};

export const DmnModeler = () => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const modelerRef = React.useRef<AnyModeler | null>(null);
  const [view, setView] = React.useState<"drd" | "table">("table");
  const [error, setError] = React.useState<string | null>(null);
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
  const [decisions, setDecisions] = React.useState<DmnDecision[]>([]);
  const [decisionsAvailable, setDecisionsAvailable] = React.useState(true);
  const filename = "loan-eligibility.dmn";

  React.useEffect(() => {
    api
      .listDecisions({ size: 200 })
      .then((r) => setDecisions(r.data || []))
      .catch(() => setDecisionsAvailable(false));
  }, []);

  React.useEffect(() => {
    let m: AnyModeler;
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
          setTimeout(() => {
            const elig = views.find((v: AnyEl) => v.element && v.element.id === "loanEligibility");
            if (elig) {
              m.open(elig);
              setView("table");
            }
          }, 50);
        } catch (e) {
          console.warn(e);
        }
      })
      .catch((e: Error) => setError(String(e.message || e)));
    return () => {
      try {
        m.destroy();
      } catch {}
      modelerRef.current = null;
    };
  }, []);

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
  const deploy = async () => {
    const m = modelerRef.current;
    if (!m) return;
    try {
      const { xml } = await m.saveXML({ format: true });
      await api.deployDmn(filename, xml);
      api
        .listDecisions({ size: 200 })
        .then((r) => setDecisions(r.data || []))
        .catch(() => {});
    } catch (e) {
      setError(`Deploy failed: ${(e as Error)?.message || e}`);
    }
  };

  const runTest = async () => {
    setRunning(true);
    try {
      const r = (await api.executeDecision({
        decisionKey: "loanEligibility",
        variables: testInputs,
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
          <b>{filename}</b>
          {!decisionsAvailable && (
            <span style={{ color: "var(--warn)", fontSize: 11 }}>· DMN engine unavailable</span>
          )}
          {decisionsAvailable && decisions.length > 0 && (
            <span style={{ color: "var(--fg-mute)" }}>· {decisions.length} deployed</span>
          )}
        </div>
        <div className="sep" />
        <div className="seg-row" style={{ margin: 0 }}>
          <button
            className="seg-btn"
            data-on={view === "table" ? "1" : "0"}
            onClick={() => switchView("table")}
          >
            Decision table
          </button>
          <button
            className="seg-btn"
            data-on={view === "drd" ? "1" : "0"}
            onClick={() => switchView("drd")}
          >
            DRD
          </button>
        </div>
        <div className="sep" />
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="save" size={13} />
          Save
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={deploy}>
          <Icon name="upload" size={13} />
          Deploy
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={saveXML}>
          <Icon name="download" size={13} />
          Export
        </button>
        <button className="btn" data-size="sm" data-variant="ghost" onClick={openInspector}>
          <Icon name="api" size={13} />
          REST
        </button>
        <div className="spacer" />
      </div>

      <div className="mod-canvas">
        <div ref={containerRef} className="dmn-host" style={{ width: "100%", height: "100%" }} />
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 20,
              background: "var(--bg-elev)",
              border: "1px solid var(--bad)",
              padding: 16,
              borderRadius: 8,
              color: "var(--bad)",
            }}
            className="mono"
          >
            {error}
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
