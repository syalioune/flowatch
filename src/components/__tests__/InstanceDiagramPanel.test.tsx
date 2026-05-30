// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceDiagramPanel> (Story 26.1) — ninth panel-as-sibling
 * consumer + first read-only viewer consumer of Pattern P-006. Covers:
 *   - Four-state contract (loading / error / empty / data).
 *   - Probe → historic fallback for processDefinitionId.
 *   - XML fetch chained on probe success.
 *   - NavigatedViewer mount (importXML + canvas.zoom("fit-viewport","auto")).
 *   - viewer.destroy() on unmount.
 *   - Refresh affordance reloads both fetches.
 *   - Pattern P-008 empty-states-exhaustiveness stays green (the
 *     `instanceDiagram` and `instanceDiagramNoXml` keys are added in
 *     src/lib/empty-states.tsx).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  FlowableError,
  type FlowableHistoricActivity,
  type FlowableHistoricProcessInstance,
  type FlowablePage,
  type FlowableProcessInstance,
} from "../../api";
import {
  fetchActivitiesForOverlayOrNull,
  fetchProcessDefinitionXmlOrNull,
  fetchProcessInstanceOrHistoric,
  InstanceDiagramPanel,
} from "../InstanceDiagramPanel";

// ─── NavigatedViewer mock ───────────────────────────────────────────
// vi.mock is hoisted to the top of the file ABOVE any `const` declarations,
// so the factory cannot close over module-scoped consts. vi.hoisted is the
// canonical escape hatch — the mocks are created at hoist time and shared
// with the test body via destructuring. Story 26.2 adds addMarker /
// removeMarker to the mocked canvas so the marker-overlay effect can be
// asserted at the bpmn-js boundary.
const {
  importXMLMock,
  zoomMock,
  resizedMock,
  addMarkerMock,
  removeMarkerMock,
  destroyMock,
  canvasGetMock,
  viewerCtor,
} = vi.hoisted(() => {
  const importXMLMock = vi.fn().mockResolvedValue({ warnings: [] });
  const zoomMock = vi.fn();
  const resizedMock = vi.fn();
  const addMarkerMock = vi.fn();
  const removeMarkerMock = vi.fn();
  const destroyMock = vi.fn();
  const canvasGetMock = vi.fn().mockReturnValue({
    zoom: zoomMock,
    resized: resizedMock,
    addMarker: addMarkerMock,
    removeMarker: removeMarkerMock,
  });
  const viewerCtor = vi.fn().mockImplementation(() => ({
    importXML: importXMLMock,
    get: canvasGetMock,
    destroy: destroyMock,
  }));
  return {
    importXMLMock,
    zoomMock,
    resizedMock,
    addMarkerMock,
    removeMarkerMock,
    destroyMock,
    canvasGetMock,
    viewerCtor,
  };
});

vi.mock("bpmn-js/lib/NavigatedViewer", () => ({
  default: viewerCtor,
}));

// ─── api spies (direct property reassignment) ──────────────────────
// Mirrors the canonical panel-test pattern at
// src/components/__tests__/InstanceHistoricVariablesPanel.test.tsx and
// the rest of the suite. vi.spyOn proved racy under heavy parallel-
// worker load when the same property is re-spied across tests.
type GetProcFn = typeof api.getProcessInstance;
type GetHistFn = typeof api.getHistoricProcessInstance;
type GetXmlFn = typeof api.getProcessDefinitionResource;
type ListActsFn = typeof api.listHistoricActivities;
type Host = {
  getProcessInstance: GetProcFn;
  getHistoricProcessInstance: GetHistFn;
  getProcessDefinitionResource: GetXmlFn;
  listHistoricActivities: ListActsFn;
};

const realProc = api.getProcessInstance;
const realHist = api.getHistoricProcessInstance;
const realXml = api.getProcessDefinitionResource;
const realActs = api.listHistoricActivities;

let procSpy: ReturnType<typeof vi.fn>;
let histSpy: ReturnType<typeof vi.fn>;
let xmlSpy: ReturnType<typeof vi.fn>;
let actsSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  procSpy = vi.fn();
  histSpy = vi.fn();
  xmlSpy = vi.fn();
  actsSpy = vi.fn();
  // Sensible default — Story 26.1 contract tests don't care about activities,
  // so resolve empty so the marker effect is a no-op. Story 26.2 tests
  // override per-test.
  actsSpy.mockResolvedValue(activitiesPage([]));
  (api as unknown as Host).getProcessInstance = procSpy as unknown as GetProcFn;
  (api as unknown as Host).getHistoricProcessInstance = histSpy as unknown as GetHistFn;
  (api as unknown as Host).getProcessDefinitionResource = xmlSpy as unknown as GetXmlFn;
  (api as unknown as Host).listHistoricActivities = actsSpy as unknown as ListActsFn;
  importXMLMock.mockClear();
  zoomMock.mockClear();
  resizedMock.mockClear();
  addMarkerMock.mockClear();
  removeMarkerMock.mockClear();
  destroyMock.mockClear();
  canvasGetMock.mockClear();
  viewerCtor.mockClear();
});

afterEach(() => {
  (api as unknown as Host).getProcessInstance = realProc;
  (api as unknown as Host).getHistoricProcessInstance = realHist;
  (api as unknown as Host).getProcessDefinitionResource = realXml;
  (api as unknown as Host).listHistoricActivities = realActs;
  cleanup();
});

// ─── Helpers ────────────────────────────────────────────────────────

const procInstance = (defId: string): FlowableProcessInstance =>
  ({
    id: "pi-1",
    processDefinitionId: defId,
  }) as FlowableProcessInstance;

const histInstance = (defId: string): FlowableHistoricProcessInstance =>
  ({
    id: "pi-1",
    processDefinitionId: defId,
    startTime: "2026-05-30T10:00:00.000Z",
  }) as FlowableHistoricProcessInstance;

const SAMPLE_XML =
  '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>';

// Story 26.2 — helpers for the activities page envelope.
const activitiesPage = (
  data: FlowableHistoricActivity[],
): FlowablePage<FlowableHistoricActivity> => ({
  data,
  total: data.length,
  start: 0,
  size: 200,
  sort: "startTime",
  order: "asc",
});

const completedActivity = (id: string, activityId: string): FlowableHistoricActivity => ({
  id,
  activityId,
  activityType: "userTask",
  processInstanceId: "pi-1",
  startTime: "2026-05-30T10:00:00.000Z",
  endTime: "2026-05-30T10:05:00.000Z",
  durationInMillis: 300_000,
});

const currentActivity = (id: string, activityId: string): FlowableHistoricActivity => ({
  id,
  activityId,
  activityType: "userTask",
  processInstanceId: "pi-1",
  startTime: "2026-05-30T10:00:00.000Z",
});

// ─── Probe-helper unit tests ────────────────────────────────────────

describe("fetchProcessInstanceOrHistoric", () => {
  it("returns the runtime processDefinitionId on success", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    const out = await fetchProcessInstanceOrHistoric("pi-1");
    expect(out).toEqual({ processDefinitionId: "loan:1:abc" });
    expect(histSpy).not.toHaveBeenCalled();
  });

  it("falls back to historic on a runtime 404", async () => {
    procSpy.mockRejectedValue(new FlowableError("Not found", 404));
    histSpy.mockResolvedValue(histInstance("loan:1:def"));
    const out = await fetchProcessInstanceOrHistoric("pi-1");
    expect(out).toEqual({ processDefinitionId: "loan:1:def" });
  });

  it("returns null when both runtime and historic 404", async () => {
    procSpy.mockRejectedValue(new FlowableError("Not found", 404));
    histSpy.mockRejectedValue(new FlowableError("Not found", 404));
    const out = await fetchProcessInstanceOrHistoric("pi-1");
    expect(out).toBeNull();
  });

  it("propagates a non-404 runtime error", async () => {
    procSpy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchProcessInstanceOrHistoric("pi-1")).rejects.toThrow("Boom");
    expect(histSpy).not.toHaveBeenCalled();
  });

  it("propagates a non-404 historic error after a runtime 404", async () => {
    procSpy.mockRejectedValue(new FlowableError("Not found", 404));
    histSpy.mockRejectedValue(new FlowableError("Historic boom", 503));
    await expect(fetchProcessInstanceOrHistoric("pi-1")).rejects.toThrow("Historic boom");
  });
});

describe("fetchProcessDefinitionXmlOrNull", () => {
  it("returns null when the definitionId is missing", async () => {
    const out = await fetchProcessDefinitionXmlOrNull(null);
    expect(out).toBeNull();
    expect(xmlSpy).not.toHaveBeenCalled();
  });

  it("returns the XML string on success", async () => {
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    const out = await fetchProcessDefinitionXmlOrNull("loan:1:abc");
    expect(out).toBe(SAMPLE_XML);
  });

  it("returns null on a 404", async () => {
    xmlSpy.mockRejectedValue(new FlowableError("Not found", 404));
    const out = await fetchProcessDefinitionXmlOrNull("loan:1:abc");
    expect(out).toBeNull();
  });

  it("propagates a non-404 error", async () => {
    xmlSpy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchProcessDefinitionXmlOrNull("loan:1:abc")).rejects.toThrow("Boom");
  });
});

// ─── Panel component tests ──────────────────────────────────────────

describe("<InstanceDiagramPanel>", () => {
  it("renders the loading skeleton while the probe is in-flight", async () => {
    procSpy.mockReturnValue(new Promise(() => undefined));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("instance-diagram-loading")).toBeInTheDocument());
  });

  it("renders the empty state when both runtime + historic 404", async () => {
    procSpy.mockRejectedValue(new FlowableError("Not found", 404));
    histSpy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    expect(await screen.findByText("No diagram available.")).toBeInTheDocument();
    expect(screen.getByTestId("instance-diagram-empty")).toBeInTheDocument();
  });

  it("renders the no-XML empty state when the definition resolves but resource 404s", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    // The chained probe→xml fetches each cycle through setState; under
    // heavy parallel-worker load the default 1000ms sometimes lapses
    // before the empty branch settles. Anchor on the stable testid via
    // findBy + waitFor so we're not racing renders inside a single
    // microtask boundary.
    await waitFor(
      () => {
        expect(screen.getByTestId("instance-diagram-empty-no-xml")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByText("No diagram resource for this definition.")).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 probe error", async () => {
    procSpy.mockRejectedValue(new FlowableError("Server explosion", 500));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 XML error", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockRejectedValue(new FlowableError("XML boom", 500));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/XML boom/)).toBeInTheDocument();
  });

  it("mounts NavigatedViewer with the canvas container, imports XML, and fits viewport", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    render(<InstanceDiagramPanel instanceId="pi-1" />);

    await waitFor(() => expect(importXMLMock).toHaveBeenCalledWith(SAMPLE_XML));
    await waitFor(() => expect(zoomMock).toHaveBeenCalledWith("fit-viewport", "auto"));
    // Regression guard: canvas.resized() MUST run before zoom("fit-viewport")
    // so bpmn-js' cached viewbox is invalidated against the current container
    // dimensions. Without it, fit-viewport measures against stale bounds and
    // produces a tiny diagram (smoke-test bug).
    expect(resizedMock).toHaveBeenCalled();
    expect(viewerCtor).toHaveBeenCalledTimes(1);
    const ctorArg = viewerCtor.mock.calls[0]?.[0] as { container?: HTMLElement } | undefined;
    expect(ctorArg?.container).toBeInstanceOf(HTMLElement);
  });

  it("destroys the viewer on unmount", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    const { unmount } = render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(importXMLMock).toHaveBeenCalled());
    unmount();
    expect(destroyMock).toHaveBeenCalled();
  });

  it("renders the resolved definitionId in the header badge after the probe lands", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("loan:1:abc")).toBeInTheDocument());
  });

  it("Refresh button triggers another probe fetch and is disabled while loading", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    const btn = await screen.findByTestId("instance-diagram-refresh");
    // Wait for the probe + XML to settle so the button is enabled.
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(procSpy).toHaveBeenCalledTimes(2));
  });

  it("anchors the panel with data-testid='instance-diagram-panel'", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("instance-diagram-panel")).toBeInTheDocument());
    expect(screen.getByTestId("instance-diagram-canvas")).toBeInTheDocument();
  });
});

// ─── Story 26.2 — fetchActivitiesForOverlayOrNull helper ────────────

describe("fetchActivitiesForOverlayOrNull", () => {
  it("returns the data array on success", async () => {
    actsSpy.mockResolvedValue(
      activitiesPage([completedActivity("a1", "Task_1"), currentActivity("a2", "Task_2")]),
    );
    const out = await fetchActivitiesForOverlayOrNull("pi-1");
    expect(out).toHaveLength(2);
    expect(actsSpy).toHaveBeenCalledWith({
      processInstanceId: "pi-1",
      size: 200,
      sort: "startTime",
    });
  });

  it("returns null on a 404", async () => {
    actsSpy.mockRejectedValue(new FlowableError("Not found", 404));
    const out = await fetchActivitiesForOverlayOrNull("pi-1");
    expect(out).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    actsSpy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchActivitiesForOverlayOrNull("pi-1")).rejects.toThrow("Boom");
  });
});

// ─── Story 26.2 — marker overlay + legend ──────────────────────────

describe("<InstanceDiagramPanel> — activity overlay (Story 26.2)", () => {
  it("applies activity-current marker for activities with no endTime", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(activitiesPage([currentActivity("a1", "Task_1")]));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(addMarkerMock).toHaveBeenCalledWith("Task_1", "activity-current"));
  });

  it("applies activity-completed marker for activities with an endTime", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(activitiesPage([completedActivity("a1", "Task_2")]));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(addMarkerMock).toHaveBeenCalledWith("Task_2", "activity-completed"));
  });

  it("applies the correct class for a mixed page (current + completed)", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(
      activitiesPage([
        completedActivity("a1", "Task_1"),
        currentActivity("a2", "Task_2"),
        completedActivity("a3", "Task_3"),
      ]),
    );
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(addMarkerMock).toHaveBeenCalledTimes(3));
    expect(addMarkerMock).toHaveBeenCalledWith("Task_1", "activity-completed");
    expect(addMarkerMock).toHaveBeenCalledWith("Task_2", "activity-current");
    expect(addMarkerMock).toHaveBeenCalledWith("Task_3", "activity-completed");
  });

  it("removes previously-applied markers before applying fresh ones on reload", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(activitiesPage([currentActivity("a1", "Task_1")]));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(addMarkerMock).toHaveBeenCalledWith("Task_1", "activity-current"));
    // Reload activities with a different shape — the Task_1 marker should be
    // removed before the new Task_2 marker is applied.
    actsSpy.mockResolvedValue(activitiesPage([completedActivity("a2", "Task_2")]));
    fireEvent.click(screen.getByTestId("instance-diagram-refresh"));
    await waitFor(() => expect(addMarkerMock).toHaveBeenCalledWith("Task_2", "activity-completed"));
    expect(removeMarkerMock).toHaveBeenCalledWith("Task_1", "activity-current");
  });

  it("warns once per missing activity id even across reloads", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      addMarkerMock.mockImplementation((id: string) => {
        if (id === "Task_missing") throw new Error("element not found");
      });
      procSpy.mockResolvedValue(procInstance("loan:1:abc"));
      xmlSpy.mockResolvedValue(SAMPLE_XML);
      // mockImplementation (not mockResolvedValue) so each call returns a
      // FRESH array reference — otherwise React.useEffect's dep comparison
      // sees identical activities.data and skips the second marker apply.
      actsSpy.mockImplementation(() =>
        Promise.resolve(activitiesPage([currentActivity("a1", "Task_missing")])),
      );
      render(<InstanceDiagramPanel instanceId="pi-1" />);
      await waitFor(() =>
        expect(addMarkerMock).toHaveBeenCalledWith("Task_missing", "activity-current"),
      );
      await waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
      // Reload with the same missing id — should NOT log a second warning.
      fireEvent.click(screen.getByTestId("instance-diagram-refresh"));
      await waitFor(() =>
        expect(addMarkerMock.mock.calls.filter(([id]) => id === "Task_missing").length).toBe(2),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
      addMarkerMock.mockReset();
    }
  });

  it("renders the legend with correct completed + current counts", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(
      activitiesPage([
        completedActivity("a1", "Task_1"),
        completedActivity("a2", "Task_2"),
        currentActivity("a3", "Task_3"),
      ]),
    );
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("instance-diagram-legend")).toBeInTheDocument());
    expect(screen.getByTestId("legend-completed")).toHaveTextContent("Completed (2)");
    expect(screen.getByTestId("legend-current")).toHaveTextContent("Current (1)");
  });

  it("hides the 'Current' swatch when only completed activities exist", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(activitiesPage([completedActivity("a1", "Task_1")]));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("instance-diagram-legend")).toBeInTheDocument());
    expect(screen.getByTestId("legend-completed")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("legend-current")).toHaveAttribute("hidden");
  });

  it("refresh re-fetches activities (plus probe + XML)", async () => {
    procSpy.mockResolvedValue(procInstance("loan:1:abc"));
    xmlSpy.mockResolvedValue(SAMPLE_XML);
    actsSpy.mockResolvedValue(activitiesPage([completedActivity("a1", "Task_1")]));
    render(<InstanceDiagramPanel instanceId="pi-1" />);
    const btn = await screen.findByTestId("instance-diagram-refresh");
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(actsSpy).toHaveBeenCalledTimes(2));
    expect(procSpy).toHaveBeenCalledTimes(2);
  });
});
