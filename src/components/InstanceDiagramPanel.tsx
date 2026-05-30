// SPDX-License-Identifier: Apache-2.0

/**
 * Instance Diagram panel (Story 26.1) — ninth panel-as-sibling consumer
 * after 10.4 / 11.3 / 12.4 / 13.1-runtime / 13.1-historic / 13.2 /
 * 13.1-historic-variables / 13.1-runtime-activities. Project decision
 * (Epic 12 retro R-2 + Epic 14 retro N=4 codification): never extract.
 *
 * First read-only viewer consumer of Pattern P-006 (vanilla bpmn-js
 * wrapping codified in CLAUDE.md from Story 16.1). Uses
 * `bpmn-js/lib/NavigatedViewer` (read-only base + pan + mouse-wheel
 * zoom) rather than `bpmn-js/lib/Modeler` — no edit affordances. The
 * strictly-read-only `bpmn-js/lib/Viewer` is the wrong fit; operators
 * need pan + zoom on real-world process diagrams.
 *
 * Sequential fetches folded into ONE useApi call (probe → historic
 * fallback for `processDefinitionId` → XML). The folded shape avoids a
 * chained-deps race that surfaced under heavy vitest parallel-worker
 * load when two useApi calls were wired with `[definitionId]` deps. All
 * fetches still funnel through `request()` per Pattern P-001 — the
 * Inspector shows two or three entries (probe + optional historic
 * fallback + XML).
 *
 * Operator-feel decisions:
 *   - Fit-to-viewport after import + on container resize (ResizeObserver).
 *   - Refresh affordance reloads both probe + XML. Useful for
 *     redeploy-then-want-fresh-diagram scenarios — diagrams rarely
 *     change but the panel-as-sibling contract demands the affordance.
 *   - No row-count badge (diagrams aren't row-bearing) and no URL
 *     state (nothing to deep-link to).
 *   - The panel renders whether the instance is alive OR ended — the
 *     historic-fallback probe handles the time-spanning detail-page
 *     contract (CLAUDE.md "Time-spanning detail pages use a single
 *     route + dual fetches").
 */

import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import React from "react";
import { api, FlowableError } from "../api";
import { Icon } from "../components";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

// @migration-any: bpmn-js DI services and the NavigatedViewer instance
// itself are dynamic. Per ADR-001, the modeler/viewer files are the
// allowed `any` zone — every cast is documented at use site.
// biome-ignore lint/suspicious/noExplicitAny: bpmn-js DI surface
type AnyViewer = any;

export interface ProbeResult {
  processDefinitionId: string;
}

/** Probe runtime; on 404 fall back to historic. Other errors propagate. */
export const fetchProcessInstanceOrHistoric = async (
  instanceId: string,
): Promise<ProbeResult | null> => {
  try {
    const runtime = await api.getProcessInstance(instanceId);
    if (runtime.processDefinitionId) return { processDefinitionId: runtime.processDefinitionId };
  } catch (err) {
    if (!(err instanceof FlowableError) || err.status !== 404) throw err;
    // fall through to historic
  }
  try {
    const historic = await api.getHistoricProcessInstance(instanceId);
    if (historic.processDefinitionId) {
      return { processDefinitionId: historic.processDefinitionId };
    }
    return null;
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

/** Fetch the BPMN XML; 404 → null (empty-state branch). Other errors propagate. */
export const fetchProcessDefinitionXmlOrNull = async (
  definitionId: string | null | undefined,
): Promise<string | null> => {
  if (!definitionId) return null;
  try {
    return await api.getProcessDefinitionResource(definitionId);
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

export interface DiagramFetchResult {
  /** null = both probes 404'd */
  definitionId: string | null;
  /** null = definitionId resolved but XML resource 404'd, or definitionId itself is null */
  xml: string | null;
}

/**
 * Single combined fetch: probe → on success fetch XML. Sequential by design;
 * the Inspector shows two (or three with historic fallback) entries. Folded
 * into one useApi to eliminate the chained-deps race that surfaced under
 * heavy vitest parallel-worker load.
 */
export const fetchInstanceDiagram = async (instanceId: string): Promise<DiagramFetchResult> => {
  const probe = await fetchProcessInstanceOrHistoric(instanceId);
  if (!probe) return { definitionId: null, xml: null };
  const xml = await fetchProcessDefinitionXmlOrNull(probe.processDefinitionId);
  return { definitionId: probe.processDefinitionId, xml };
};

interface Props {
  instanceId: string;
}

export function InstanceDiagramPanel({ instanceId }: Props) {
  const fetched = useApi<DiagramFetchResult>(() => fetchInstanceDiagram(instanceId), [instanceId]);
  const definitionId = fetched.data?.definitionId ?? null;
  const xmlData = fetched.data?.xml ?? null;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const viewerRef = React.useRef<AnyViewer | null>(null);
  const [importError, setImportError] = React.useState<Error | null>(null);

  // Mount the NavigatedViewer when XML resolves to a string. The effect
  // re-runs whenever the XML changes (refresh / instance switch). Cleanup
  // destroys the viewer + disconnects the ResizeObserver.
  React.useEffect(() => {
    if (!xmlData) return;
    if (!containerRef.current) return;

    let cancelled = false;
    let viewer: AnyViewer = null;
    let observer: ResizeObserver | null = null;

    (async () => {
      try {
        viewer = new NavigatedViewer({ container: containerRef.current as HTMLElement });
        viewerRef.current = viewer;
        await viewer.importXML(xmlData);
        if (cancelled) return;
        try {
          viewer.get("canvas").zoom("fit-viewport", "auto");
        } catch {
          /* canvas not ready — non-fatal */
        }
        setImportError(null);
        // ResizeObserver re-fits the diagram on container width changes
        // (density toggle / browser resize). Disconnected in cleanup.
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(() => {
            try {
              viewer?.get("canvas").zoom("fit-viewport", "auto");
            } catch {
              /* canvas torn down mid-resize — ignore */
            }
          });
          observer.observe(containerRef.current as HTMLElement);
        }
      } catch (err) {
        if (!cancelled) setImportError(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      try {
        viewer?.destroy();
      } catch {
        /* bpmn-js can throw on already-disposed instances under strict-mode double-mount */
      }
      viewerRef.current = null;
    };
  }, [xmlData]);

  const reload = React.useCallback(() => {
    setImportError(null);
    fetched.reload();
  }, [fetched.reload]);

  const loading = fetched.loading;
  const error = fetched.error ?? importError;
  // Empty cases:
  //   - both probes 404 → definitionId === null
  //   - definition resolved but XML resource 404 → definitionId !== null && xmlData === null
  const emptyNoDefinition =
    !loading && !error && fetched.data !== null && fetched.data?.definitionId === null;
  const emptyNoXml =
    !loading && !error && fetched.data?.definitionId != null && fetched.data?.xml === null;
  const hasData = !loading && !error && !emptyNoDefinition && !emptyNoXml && xmlData != null;

  return (
    <div className="panel" data-testid="instance-diagram-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Process diagram</span>
        {definitionId && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            <span className="sr-only">Definition: </span>
            <span className="mono" style={{ fontSize: 10 }}>
              {definitionId}
            </span>
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /repository/process-definitions/{"{id}"}/resourcedata
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="instance-diagram-refresh"
          onClick={reload}
          disabled={loading}
          aria-label="Refresh diagram"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body">
        {loading && (
          <div
            className="diagram-skeleton"
            data-testid="instance-diagram-loading"
            aria-hidden="true"
          />
        )}
        {error && <ErrorBox error={error} onRetry={reload} />}
        {emptyNoDefinition && (
          <div data-testid="instance-diagram-empty">
            <EmptyState entry={getEmptyState("instanceDiagram")} />
          </div>
        )}
        {emptyNoXml && (
          <div data-testid="instance-diagram-empty-no-xml">
            <EmptyState entry={getEmptyState("instanceDiagramNoXml")} />
          </div>
        )}
        {/* The canvas div is always rendered when xml.data is present so
            the ref is attached before the useEffect runs. The wrapper is
            hidden via display: none when not in the data state. */}
        <div
          ref={containerRef}
          className="instance-diagram-canvas"
          data-testid="instance-diagram-canvas"
          style={hasData ? undefined : { display: "none" }}
        />
      </div>
    </div>
  );
}
