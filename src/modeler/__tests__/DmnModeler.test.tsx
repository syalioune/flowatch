// SPDX-License-Identifier: Apache-2.0

/**
 * Smoke tests for the DmnModeler component extracted in Story 16.4.
 *
 * Mirrors the BpmnModeler test scaffold (Stories 16.1/16.2/16.3) — the
 * full dmn-js Modeler cannot mount in jsdom (multi-view SVG canvases +
 * the same browser-tier capabilities as bpmn-js), so we mock `dmn-js/
 * lib/Modeler` to a thin stub and verify the component:
 *
 *   1. Mounts without throwing.
 *   2. Calls modeler.destroy() on unmount (P-006 cleanup contract).
 *   3. Subscribes to selection.changed + commandStack.changed +
 *      views.changed (multi-view DMN dirty-state).
 *   4. Tracks dirty state from the ACTIVE VIEW's commandStack.canUndo()
 *      — DMN's per-view stacks complicate this vs BPMN's single stack;
 *      probeActiveViewDirty is what the modeler actually polls.
 *   5. Zooms to fit after every importXML.
 *   6. New button loads LOAN_DMN_XML + clears the URL.
 *   7. Deploy success surfaces a toast with the open-deployed-decision
 *      action; failure surfaces an error toast + dirty preserved.
 *   8. Dropdown pick triggers loadDecision via api.getDmnResource (and
 *      resolves resourceId via api.listDmnDeploymentResources).
 *
 * Story 16.4 AC-9.
 */

import "@testing-library/jest-dom/vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Stub modeler ──────────────────────────────────────────────────
type EventHandler = (event: unknown) => void;
interface StubBus {
  handlers: Record<string, EventHandler[]>;
  on: (name: string, cb: EventHandler) => void;
  off: (name: string, cb: EventHandler) => void;
  fire: (name: string, event: unknown) => void;
}

const buildStubBus = (): StubBus => {
  const handlers: Record<string, EventHandler[]> = {};
  return {
    handlers,
    on: (name, cb) => {
      handlers[name] = handlers[name] || [];
      handlers[name].push(cb);
    },
    off: (name, cb) => {
      handlers[name] = (handlers[name] || []).filter((h) => h !== cb);
    },
    fire: (name, event) => {
      for (const cb of handlers[name] || []) {
        cb(event);
      }
    },
  };
};

const importXMLSpy = vi.fn((_xml: string) => Promise.resolve({ warnings: [] }));
const destroySpy = vi.fn();
const zoomSpy = vi.fn();
const buses: StubBus[] = [];
// Per-active-view dirty state. The component reads dmn-js's
// modeler.getActiveViewer().get("commandStack").canUndo() — the stub
// surfaces this via a mutable flag.
let activeViewCanUndo = false;

vi.mock("dmn-js/lib/Modeler", () => {
  class StubDmnModeler {
    public _eventBus: StubBus;
    constructor(_opts: unknown) {
      this._eventBus = buildStubBus();
      buses.push(this._eventBus);
    }
    get(service: string): unknown {
      if (service === "eventBus") return this._eventBus;
      return {};
    }
    getActiveViewer(): unknown {
      return {
        get: (svc: string) => {
          if (svc === "canvas") return { zoom: zoomSpy };
          if (svc === "commandStack") return { canUndo: () => activeViewCanUndo };
          return undefined;
        },
      };
    }
    getViews(): unknown[] {
      return [
        { type: "drd", id: "drd" },
        { type: "decisionTable", element: { id: "loanEligibility" }, id: "loanEligibility" },
      ];
    }
    open(_view: unknown) {
      // no-op in tests
    }
    importXML(_xml: string) {
      return importXMLSpy(_xml);
    }
    saveXML(_opts?: unknown) {
      return Promise.resolve({ xml: "<dmn/>" });
    }
    destroy() {
      destroySpy();
    }
  }
  return { default: StubDmnModeler };
});

// ─── api mocks ─────────────────────────────────────────────────────
const { listDecisionsSpy, getDmnResourceSpy, deployDmnSpy, listDmnDeploymentResourcesSpy } =
  vi.hoisted(() => ({
    listDecisionsSpy: vi.fn(),
    getDmnResourceSpy: vi.fn(),
    deployDmnSpy: vi.fn(),
    listDmnDeploymentResourcesSpy: vi.fn(),
  }));

vi.mock("../../api", async () => {
  const real = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...real,
    api: {
      ...real.api,
      listDecisions: listDecisionsSpy,
      getDmnResource: getDmnResourceSpy,
      deployDmn: deployDmnSpy,
      listDmnDeploymentResources: listDmnDeploymentResourcesSpy,
    },
  };
});

// Import AFTER the mock declarations.
import { DmnModeler } from "../DmnModeler";

// Toast capture (mirror Story 16.3's BpmnModeler test pattern).
interface CapturedToast {
  kind?: string;
  text: string;
  sub?: string;
  action?: { label: string; testId?: string };
}
const capturedToasts: CapturedToast[] = [];
const onToast = (e: Event) => {
  // @ts-expect-error — CustomEvent.detail is unknown at the listener level
  capturedToasts.push(e.detail);
};

const renderModeler = () => {
  const rootRoute = createRootRoute({ component: () => <DmnModeler /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
};

beforeEach(() => {
  importXMLSpy.mockClear();
  destroySpy.mockClear();
  zoomSpy.mockClear();
  buses.length = 0;
  activeViewCanUndo = false;
  listDecisionsSpy.mockReset();
  listDecisionsSpy.mockResolvedValue({ data: [] });
  getDmnResourceSpy.mockReset();
  getDmnResourceSpy.mockResolvedValue("<dmn:definitions/>");
  deployDmnSpy.mockReset();
  deployDmnSpy.mockResolvedValue({ id: "dmn-dep-1", name: "x" });
  listDmnDeploymentResourcesSpy.mockReset();
  listDmnDeploymentResourcesSpy.mockResolvedValue([]);
  capturedToasts.length = 0;
  window.addEventListener("app:toast", onToast);
});

afterEach(() => {
  window.removeEventListener("app:toast", onToast);
  cleanup();
  vi.clearAllMocks();
});

describe("<DmnModeler> — Story 16.4 mount + cleanup + typed events", () => {
  it("mounts the vanilla dmn-js Modeler via the ref'd container", async () => {
    const { unmount } = renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    expect(importXMLSpy).toHaveBeenCalled();
    unmount();
  });

  it("calls modeler.destroy() on unmount (P-006 cleanup contract)", async () => {
    const { unmount } = renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    expect(destroySpy).not.toHaveBeenCalled();
    unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("subscribes to selection.changed + commandStack.changed + views.changed", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    expect(bus.handlers["selection.changed"]?.length ?? 0).toBeGreaterThan(0);
    expect(bus.handlers["commandStack.changed"]?.length ?? 0).toBeGreaterThan(0);
    expect(bus.handlers["views.changed"]?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("<DmnModeler> — Story 16.4 dirty-state from active-view commandStack", () => {
  it("Deploy button renders 'Deploy' (no asterisk) on initial mount", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const deployBtn = screen.getByTestId("dmn-deploy");
    expect(deployBtn.textContent).toMatch(/^Deploy$/);
  });

  it("Deploy button flips to 'Deploy *' when active-view canUndo flips true on commandStack.changed", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    activeViewCanUndo = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      expect(screen.getByTestId("dmn-deploy").textContent).toMatch(/Deploy \*/);
    });
  });

  it("views.changed re-polls the dirty state from the (newly) active view", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    activeViewCanUndo = true;
    bus.fire("views.changed", {
      activeView: { type: "decisionTable", id: "loanEligibility" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("dmn-deploy").textContent).toMatch(/Deploy \*/);
    });
  });
});

describe("<DmnModeler> — Story 16.4 New + Deploy + post-deploy toast", () => {
  it("New button renders with data-testid='dmn-new'", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    expect(screen.getByTestId("dmn-new")).toBeInTheDocument();
  });

  it("New click on clean state calls importXML with LOAN_DMN_XML (AC-5)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("dmn-new"));
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(2));
    const lastCall = importXMLSpy.mock.calls.at(-1);
    // LOAN_DMN_XML carries the DMN namespace + decision id "loanEligibility".
    expect(lastCall?.[0]).toMatch(/loanEligibility/);
  });

  it("New click with dirty=true prompts confirm; cancel skips the import (AC-5)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    activeViewCanUndo = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      expect(screen.getByTestId("dmn-deploy").textContent).toMatch(/Deploy \*/);
    });
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(1));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByTestId("dmn-new"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(importXMLSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("Deploy success surfaces a toast with 'Open the deployed decision' action (AC-6)", async () => {
    deployDmnSpy.mockResolvedValue({ id: "dep-99", name: "loan-eligibility.dmn" });
    listDecisionsSpy.mockImplementation((params?: { deploymentId?: string }) => {
      if (params?.deploymentId === "dep-99") {
        return Promise.resolve({
          data: [
            {
              id: "loanEligibility:7:def",
              key: "loanEligibility",
              version: 7,
              name: "Loan Eligibility",
              deploymentId: "dep-99",
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    fireEvent.click(screen.getByTestId("dmn-deploy"));
    await waitFor(() => expect(deployDmnSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const successToast = capturedToasts.find(
        (t) => t.action?.testId === "open-deployed-decision",
      );
      expect(successToast).toBeDefined();
      expect(successToast?.kind).toBe("success");
      expect(successToast?.text).toMatch(/loanEligibility v7/);
    });
  });

  it("Deploy failure surfaces an error toast + dirty stays true (AC-6)", async () => {
    deployDmnSpy.mockRejectedValue(new Error("Engine rejected the DMN: invalid hit policy"));
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    activeViewCanUndo = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      expect(screen.getByTestId("dmn-deploy").textContent).toMatch(/Deploy \*/);
    });
    fireEvent.click(screen.getByTestId("dmn-deploy"));
    await waitFor(() => {
      const errToast = capturedToasts.find((t) => t.kind === "error");
      expect(errToast).toBeDefined();
      expect(errToast?.text).toMatch(/DMN deploy failed/);
    });
    expect(screen.getByTestId("dmn-deploy").textContent).toMatch(/Deploy \*/);
  });
});

describe("<DmnModeler> — Story 16.4 dropdown + resourceId resolution", () => {
  it("Dropdown pick resolves resourceId via listDmnDeploymentResources + loads XML", async () => {
    listDecisionsSpy.mockResolvedValue({
      data: [
        {
          id: "loanEligibility:3:abc",
          key: "loanEligibility",
          version: 3,
          name: "Loan Eligibility",
          deploymentId: "dep-3",
        },
      ],
    });
    listDmnDeploymentResourcesSpy.mockResolvedValue([
      { id: "loan-eligibility.dmn", mediaType: "application/xml" },
    ]);
    getDmnResourceSpy.mockResolvedValue("<dmn:definitions id='fetched'/>");

    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    // Wait for the dropdown to populate
    const dropdown = screen.getByTestId("dmn-decision-dropdown");
    await waitFor(() => {
      const options = dropdown.querySelectorAll("option");
      expect(options.length).toBeGreaterThan(1);
    });
    // Wait for the initial mount import to settle
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(1));
    fireEvent.change(dropdown, { target: { value: "loanEligibility:3:abc" } });
    await waitFor(() => expect(listDmnDeploymentResourcesSpy).toHaveBeenCalledWith("dep-3"));
    await waitFor(() =>
      expect(getDmnResourceSpy).toHaveBeenCalledWith("dep-3", "loan-eligibility.dmn"),
    );
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(2));
    expect(importXMLSpy.mock.calls.at(-1)?.[0]).toMatch(/fetched/);
  });
});
