// SPDX-License-Identifier: Apache-2.0

/**
 * Instance Diagram panel (Stories 26.1 + 26.2) — ninth panel-as-sibling
 * consumer after 10.4 / 11.3 / 12.4 / 13.1-runtime / 13.1-historic / 13.2 /
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
 * Sequential probe + XML fetches folded into ONE useApi call. The folded
 * shape avoids a chained-deps race that surfaced under heavy vitest
 * parallel-worker load when two useApi calls were wired with
 * `[definitionId]` deps. All fetches still funnel through `request()`
 * per Pattern P-001 — the Inspector shows two-or-three entries (probe +
 * optional historic fallback + XML).
 *
 * Story 26.2 adds a SECOND useApi for activities
 * (`api.listHistoricActivities`) — fired in parallel with the
 * probe+XML chain, NOT chained on it. Markers are applied via
 * `canvas.addMarker(activityId, "activity-current"|"activity-completed")`
 * after BOTH the viewer has mounted (importXML resolved) AND activities
 * have resolved. Classification follows the runtime-via-historic recipe
 * (RC-13/RC-14): `endTime == null` → current, else completed. The
 * duplicate activities call with `<InstanceHistoricActivitiesPanel>`
 * (the 3rd sibling) is by design — CLAUDE.md "Parent-level state-gating
 * fetches are an acceptable duplication"; threading state up would
 * break the single-stable-identifier panel contract.
 *
 * Operator-feel decisions:
 *   - Fit-to-viewport after import + on container resize (ResizeObserver).
 *   - Refresh affordance reloads probe+XML AND activities.
 *   - No row-count badge (diagrams aren't row-bearing) and no URL state.
 *   - Activity overlay: thicker stroke + accent color for "current",
 *     thinner stroke + ok-green for "completed". Stroke-width is the
 *     constant cue across the 8 look × theme combinations; color
 *     reinforces but doesn't carry the discrimination alone.
 *   - The panel renders whether the instance is alive OR ended — the
 *     historic-fallback probe handles the time-spanning detail-page
 *     contract (CLAUDE.md "Time-spanning detail pages use a single
 *     route + dual fetches").
 *   - Missing-element warnings deduplicated to one console.warn per
 *     (activityId × panel-lifetime); typical when a definition was
 *     redeployed mid-instance and old activity ids no longer exist.
 */

import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import React from "react";
import { api, type FlowableHistoricActivity, FlowableError } from "../api";
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

const ACTIVITIES_PAGE_SIZE = 200;

/**
 * Fetch activities for marker overlay (Story 26.2). 404 → null → skip overlay;
 * other errors propagate (caller swallows or surfaces). Mirrors the shape of
 * `fetchActivitiesOrNull` in `<InstanceHistoricActivitiesPanel>` per the spec's
 * "duplicate inline rather than extract" decision (CLAUDE.md "Never extract").
 */
export const fetchActivitiesForOverlayOrNull = async (
  instanceId: string,
): Promise<FlowableHistoricActivity[] | null> => {
  try {
    const page = await api.listHistoricActivities({
      processInstanceId: instanceId,
      size: ACTIVITIES_PAGE_SIZE,
      sort: "startTime",
    });
    return page.data ?? [];
  } catch (err) {
    if (err instanceof FlowableError && err.status === 404) return null;
    throw err;
  }
};

/** Classify per RC-13/RC-14 — endTime == null → current, else completed. */
const classifyActivity = (
  activity: FlowableHistoricActivity,
): "activity-current" | "activity-completed" =>
  activity.endTime == null ? "activity-current" : "activity-completed";

interface Props {
  instanceId: string;
}

export function InstanceDiagramPanel({ instanceId }: Props) {
  const fetched = useApi<DiagramFetchResult>(() => fetchInstanceDiagram(instanceId), [instanceId]);
  const definitionId = fetched.data?.definitionId ?? null;
  const xmlData = fetched.data?.xml ?? null;

  // Story 26.2 — activities fetch fired in parallel with the probe+XML chain.
  // The duplicate call with <InstanceHistoricActivitiesPanel> is by design
  // per CLAUDE.md "Parent-level state-gating fetches are an acceptable
  // duplication." The Inspector shows two entries against the same endpoint.
  const activities = useApi<FlowableHistoricActivity[] | null>(
    () => fetchActivitiesForOverlayOrNull(instanceId),
    [instanceId],
  );

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const viewerRef = React.useRef<AnyViewer | null>(null);
  const [importError, setImportError] = React.useState<Error | null>(null);
  // Story 26.2 — track viewer-ready state so the marker effect knows when
  // the viewer is mounted. Set after importXML resolves; cleared on
  // viewer-effect cleanup or on XML re-fetch.
  const [viewerReady, setViewerReady] = React.useState(false);
  // Story 26.2 — track applied (activityId, className) pairs for cleanup
  // on activities reload. canvas.removeMarker requires the explicit pair.
  const appliedMarkersRef = React.useRef<Set<string>>(new Set());
  // Story 26.2 — dedupe missing-element warnings (one per activityId per
  // panel lifetime).
  const warnedActivitiesRef = React.useRef<Set<string>>(new Set());

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
          const canvas = viewer.get("canvas");
          // canvas.resized() invalidates bpmn-js' cached viewbox so the
          // subsequent fit-viewport measures against the current container
          // dimensions — required because the canvas may have been created
          // before the surrounding layout settled (e.g. parent panel just
          // exited the loading branch). Without this, fit-viewport keeps
          // using stale container measurements and produces a tiny SVG.
          canvas.resized();
          canvas.zoom("fit-viewport", "auto");
        } catch {
          /* canvas not ready — non-fatal */
        }
        setImportError(null);
        setViewerReady(true);
        // ResizeObserver re-fits the diagram on container width changes
        // (density toggle / browser resize). Disconnected in cleanup.
        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(() => {
            try {
              const canvas = viewer?.get("canvas");
              canvas?.resized();
              canvas?.zoom("fit-viewport", "auto");
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
      setViewerReady(false);
      // The viewer's destroy() teardown wipes the SVG; no need to
      // canvas.removeMarker each one. Reset bookkeeping for the next mount.
      appliedMarkersRef.current.clear();
    };
  }, [xmlData]);

  // Story 26.2 — marker overlay effect. Runs after viewer is mounted AND
  // whenever activities resolve / re-resolve. Removes any previously-applied
  // markers (tracked via the ref Set so we can pair-by-pair removeMarker) and
  // applies fresh markers from activities.data. Missing-element catches are
  // warn-once-per-(activityId, panel-lifetime).
  React.useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;
    let canvas: AnyViewer;
    try {
      canvas = viewer.get("canvas");
    } catch {
      return;
    }
    // Remove previously-applied markers.
    for (const pair of appliedMarkersRef.current) {
      const sep = pair.indexOf("::");
      if (sep < 0) continue;
      const activityId = pair.slice(0, sep);
      const className = pair.slice(sep + 2);
      try {
        canvas.removeMarker(activityId, className);
      } catch {
        /* element may have been disposed; safe to ignore */
      }
    }
    appliedMarkersRef.current.clear();
    // Apply fresh markers.
    const list = activities.data ?? [];
    for (const activity of list) {
      const className = classifyActivity(activity);
      try {
        canvas.addMarker(activity.activityId, className);
        appliedMarkersRef.current.add(`${activity.activityId}::${className}`);
      } catch {
        if (!warnedActivitiesRef.current.has(activity.activityId)) {
          warnedActivitiesRef.current.add(activity.activityId);
          // biome-ignore lint/suspicious/noConsole: warn-once for missing diagram element (AC-6)
          console.warn(
            `[InstanceDiagramPanel] activity ${activity.activityId} not found in current diagram XML — older version?`,
          );
        }
      }
    }
  }, [viewerReady, activities.data]);

  const reload = React.useCallback(() => {
    setImportError(null);
    fetched.reload();
    activities.reload();
  }, [fetched.reload, activities.reload]);

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

  // Story 26.2 — legend counts. Computed from activities.data which fetches
  // in parallel with probe+XML, so may be null when the diagram is otherwise
  // ready — that's fine; legend hides until activities lands.
  const activityList = activities.data ?? [];
  const completedCount = activityList.filter((a) => a.endTime != null).length;
  const currentCount = activityList.filter((a) => a.endTime == null).length;

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
        {/* Story 26.2 — legend below the canvas. Rendered in the data
            state. Each swatch carries a sr-only "Legend:" prefix per
            Story 18.2 codification; visual swatches hidden when their
            count is zero but the landmark survives for AT users. */}
        {hasData && (
          <div className="instance-diagram-legend" data-testid="instance-diagram-legend">
            <span className="sr-only">Legend: </span>
            <span
              data-testid="legend-completed"
              hidden={completedCount === 0}
              style={{ marginRight: 12 }}
            >
              <span className="legend-swatch legend-completed" aria-hidden="true" />
              <span style={{ fontSize: 11 }}>Completed ({completedCount})</span>
            </span>
            <span data-testid="legend-current" hidden={currentCount === 0}>
              <span className="legend-swatch legend-current" aria-hidden="true" />
              <span style={{ fontSize: 11 }}>Current ({currentCount})</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
