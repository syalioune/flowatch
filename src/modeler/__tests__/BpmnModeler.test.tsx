// SPDX-License-Identifier: Apache-2.0

/**
 * Smoke tests for the BpmnModeler component extracted in Story 16.1 +
 * extended in Story 16.2 (dirty-state, zoom-to-fit, dropdown polish).
 *
 * The full bpmn-js Modeler cannot be mounted in jsdom — it depends on SVG
 * surfaces, the DOM `Range` API, and other browser-tier capabilities that
 * jsdom doesn't ship. Per the AC-9 expectation (`The actual bpmn-js Modeler
 * is too heavy to mount in tests`), we mock `bpmn-js/lib/Modeler` to a
 * thin stub and verify the component:
 *
 *   1. Mounts without throwing.                                  (16.1 AC-9)
 *   2. Calls modeler.destroy() on unmount (cleanup contract).    (16.1 AC-9)
 *   3. Subscribes to selection.changed + commandStack.changed
 *      with typed callbacks — verified by capturing the event-
 *      bus on(...) calls and replaying typed payloads through
 *      them.                                                     (16.1 AC-3)
 *   4. Tracks dirty state from `commandStack.canUndo()` —
 *      initial false; flips to true on canUndo; resets to false
 *      after a successful deploy.                                (16.2 AC-2)
 *   5. Zooms to fit after every importXML.                        (16.2 AC-3)
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

// Minimal stub for the bpmn-js Modeler. We capture event-bus subscriptions
// per instance so the test can replay events through the typed callbacks.
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
const filterSpy = vi.fn(() => []);
const buses: StubBus[] = [];
// Story 16.2: per-test override for commandStack.canUndo(). Default false
// (clean state). Tests that exercise dirty state mutate this between fire()
// calls + commandStack.changed replays.
let canUndoValue = false;

vi.mock("bpmn-js/lib/Modeler", () => {
  class StubModeler {
    private bus: StubBus;
    constructor(_opts: unknown) {
      this.bus = buildStubBus();
      buses.push(this.bus);
    }
    get(service: string): unknown {
      if (service === "eventBus") return this.bus;
      if (service === "canvas") return { zoom: zoomSpy };
      if (service === "elementRegistry") return { filter: filterSpy };
      if (service === "selection") return { select: vi.fn() };
      if (service === "modeling") return { updateProperties: vi.fn() };
      if (service === "commandStack") return { canUndo: () => canUndoValue };
      return {};
    }
    importXML(_xml: string) {
      return importXMLSpy(_xml);
    }
    saveXML(_opts?: unknown) {
      return Promise.resolve({ xml: "<bpmn/>" });
    }
    saveSVG() {
      return Promise.resolve({ svg: "<svg/>" });
    }
    destroy() {
      destroySpy();
    }
  }
  return { default: StubModeler };
});

// Story 16.3: per-test handles on the api so deploy / new tests can assert
// args + tweak return values. `vi.hoisted` lifts the spy declarations above
// the mock factory's evaluation (which runs before module-top-level code).
const { listProcessDefinitionsSpy, getProcessDefinitionResourceSpy, deployBpmnSpy } = vi.hoisted(
  () => ({
    listProcessDefinitionsSpy: vi.fn(),
    getProcessDefinitionResourceSpy: vi.fn(),
    deployBpmnSpy: vi.fn(),
  }),
);

// Mock the api so the dropdown's listProcessDefinitions doesn't network.
vi.mock("../../api", async () => {
  const real = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...real,
    api: {
      ...real.api,
      listProcessDefinitions: listProcessDefinitionsSpy,
      getProcessDefinitionResource: getProcessDefinitionResourceSpy,
      deployBpmn: deployBpmnSpy,
    },
  };
});

// Import AFTER the mock declarations.
import { BpmnModeler } from "../BpmnModeler";

// Story 16.3: the deploy() handler dispatches `app:toast` window events.
// Tests capture them via an event listener installed per-test so each test
// gets a fresh queue.
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

// Story 16.2: `<BpmnModeler>` now calls `useNavigate()` from tanstack-router,
// so the test harness mounts it inside a minimal `<RouterProvider>` rooted
// at `/`. Same shape as <InstanceHistoricPanel> tests.
const renderModeler = () => {
  const rootRoute = createRootRoute({ component: () => <BpmnModeler /> });
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
  filterSpy.mockClear();
  buses.length = 0;
  canUndoValue = false;
  // Story 16.3 defaults: list returns empty by default; deploy returns a
  // canned envelope; getProcessDefinitionResource returns inert XML. Tests
  // mutate via .mockResolvedValueOnce(...) when they need different values.
  listProcessDefinitionsSpy.mockReset();
  listProcessDefinitionsSpy.mockResolvedValue({ data: [] });
  getProcessDefinitionResourceSpy.mockReset();
  getProcessDefinitionResourceSpy.mockResolvedValue("<bpmn:definitions/>");
  deployBpmnSpy.mockReset();
  deployBpmnSpy.mockResolvedValue({ id: "dep-1", name: "x" });
  capturedToasts.length = 0;
  window.addEventListener("app:toast", onToast);
});

afterEach(() => {
  window.removeEventListener("app:toast", onToast);
  cleanup();
  vi.clearAllMocks();
});

describe("<BpmnModeler> — Story 16.1 AC-9 smoke", () => {
  it("mounts the vanilla bpmn-js Modeler via the ref'd container", async () => {
    const { unmount } = renderModeler();
    // The component instantiated the stub Modeler exactly once + imported
    // the LOAN starter on mount
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

  it("subscribes to selection.changed + commandStack.changed with typed callbacks", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    const selHandlers = bus.handlers["selection.changed"];
    const cmdHandlers = bus.handlers["commandStack.changed"];
    expect(selHandlers).toBeDefined();
    expect(selHandlers?.length ?? 0).toBeGreaterThan(0);
    expect(cmdHandlers).toBeDefined();
    expect(cmdHandlers?.length ?? 0).toBeGreaterThan(0);
  });

  it("selection.changed typed payload is consumed without throwing", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    // Replay a typed SelectionChangedEvent — the modeler's onSel reads
    // event.newSelection without crashing
    expect(() =>
      bus.fire("selection.changed", { newSelection: [], oldSelection: [] }),
    ).not.toThrow();
    expect(() =>
      bus.fire("selection.changed", {
        newSelection: [{ id: "Task_1", type: "bpmn:UserTask", businessObject: {} }],
        oldSelection: [],
      }),
    ).not.toThrow();
  });

  it("commandStack.changed typed payload is consumed without throwing", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    expect(() => bus.fire("commandStack.changed", {})).not.toThrow();
    expect(() => bus.fire("commandStack.changed", { context: { foo: "bar" } })).not.toThrow();
  });
});

describe("<BpmnModeler> — Story 16.2 dirty-state + zoom-to-fit", () => {
  it("Deploy button renders 'Deploy' (no asterisk) on initial mount (clean state)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const deployBtn = screen.getByTestId("bpmn-deploy");
    // Initial state: commandStack.canUndo() === false → dirty === false
    expect(deployBtn.textContent).toMatch(/^Deploy$/);
    expect(deployBtn.getAttribute("data-tone")).not.toBe("warn");
  });

  it("Deploy button flips to 'Deploy *' when commandStack.canUndo() === true", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    // Simulate an operator edit: commandStack now has an undoable command
    canUndoValue = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      const deployBtn = screen.getByTestId("bpmn-deploy");
      expect(deployBtn.textContent).toMatch(/Deploy \*/);
      expect(deployBtn.getAttribute("data-tone")).toBe("warn");
    });
  });

  it("zoom-to-fit fires after every importXML (mount, dropdown pick)", async () => {
    renderModeler();
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalled());
    // The mount imports LOAN_BPMN_XML → zoom("fit-viewport", "auto") is called
    expect(zoomSpy).toHaveBeenCalled();
    expect(zoomSpy.mock.calls[0]).toEqual(["fit-viewport", "auto"]);
  });

  it("dirty resets to false after a successful deploy", async () => {
    // Ensure deploy + lookup succeed
    deployBpmnSpy.mockResolvedValue({ id: "dep-77", name: "loan-approval.bpmn20.xml" });
    listProcessDefinitionsSpy.mockResolvedValue({ data: [] });
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    // Operator edited
    canUndoValue = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      expect(screen.getByTestId("bpmn-deploy").textContent).toMatch(/Deploy \*/);
    });
    // Successful deploy resets dirty. canUndo flips false (deployed XML is
    // the new clean baseline). The deploy modal is now in front of the real
    // deploy call — click Deploy → confirm.
    canUndoValue = false;
    fireEvent.click(screen.getByTestId("bpmn-deploy"));
    await waitFor(() => expect(screen.getByTestId("deploy-bpmn-modal")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() => {
      expect(screen.getByTestId("bpmn-deploy").textContent).toMatch(/^Deploy$/);
    });
  });
});

describe("<BpmnModeler> — Story 16.3 New + Deploy + post-deploy toast", () => {
  it("New button renders with data-testid='bpmn-new' (AC-1)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const newBtn = screen.getByTestId("bpmn-new");
    expect(newBtn).toBeInTheDocument();
    expect(newBtn.textContent).toMatch(/New/);
  });

  it("New click on clean state calls importXML with BLANK_BPMN_XML (AC-1)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    // Wait for the initial mount-import (LOAN) to settle so the next import
    // is the operator's "New" click.
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("bpmn-new"));
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(2));
    const lastCall = importXMLSpy.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatch(/<bpmn:definitions/);
    // The BLANK starter declares `id="newProcess"` — the LOAN starter uses
    // `id="loanApproval"`. The new-from-scratch import must be BLANK.
    expect(lastCall?.[0]).toMatch(/newProcess/);
  });

  it("New click with dirty=true prompts window.confirm; cancel skips the import (AC-1)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    // Operator made edits
    canUndoValue = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      expect(screen.getByTestId("bpmn-deploy").textContent).toMatch(/Deploy \*/);
    });
    // Wait for mount import to settle
    await waitFor(() => expect(importXMLSpy).toHaveBeenCalledTimes(1));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByTestId("bpmn-new"));
    expect(confirmSpy).toHaveBeenCalled();
    // confirm returned false → import was NOT called a second time
    expect(importXMLSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  it("Deploy success surfaces a toast with 'Open the deployed definition' action (AC-3)", async () => {
    // Set up the post-deploy lookup to return a definition
    deployBpmnSpy.mockResolvedValue({ id: "dep-99", name: "loan-approval.bpmn20.xml" });
    // The deploy() handler issues TWO listProcessDefinitions calls:
    // (1) refresh the dropdown's 200-row list
    // (2) lookup the deployed definition by deploymentId+latest
    listProcessDefinitionsSpy.mockImplementation((params?: { deploymentId?: string }) => {
      if (params?.deploymentId === "dep-99") {
        return Promise.resolve({
          data: [
            {
              id: "loanApproval:42:abc",
              key: "loanApproval",
              version: 42,
              name: "Loan approval",
              deploymentId: "dep-99",
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });

    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    fireEvent.click(screen.getByTestId("bpmn-deploy"));
    // PR #168 follow-up: Deploy click opens the confirmation modal first.
    await waitFor(() => expect(screen.getByTestId("deploy-bpmn-modal")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() => expect(deployBpmnSpy).toHaveBeenCalledTimes(1));
    // Toast event has the Open action with the right testId
    await waitFor(() => {
      expect(capturedToasts.length).toBeGreaterThan(0);
      const successToast = capturedToasts.find(
        (t) => t.action?.testId === "open-deployed-definition",
      );
      expect(successToast).toBeDefined();
      expect(successToast?.kind).toBe("success");
      expect(successToast?.text).toMatch(/loanApproval v42/);
    });
  });

  it("Deploy failure surfaces an in-modal ErrorBox + dirty stays true (AC-2)", async () => {
    deployBpmnSpy.mockRejectedValue(new Error("Engine returned 500"));
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    // Make operator-dirty so we can check it stays after the failed deploy
    canUndoValue = true;
    bus.fire("commandStack.changed", {});
    await waitFor(() => {
      expect(screen.getByTestId("bpmn-deploy").textContent).toMatch(/Deploy \*/);
    });
    fireEvent.click(screen.getByTestId("bpmn-deploy"));
    // PR #168 follow-up: confirmation modal — confirm to actually attempt the deploy.
    await waitFor(() => expect(screen.getByTestId("deploy-bpmn-modal")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    // Retryable-creation pattern: on failure the modal stays open with an
    // in-modal ErrorBox so the operator can fix-and-resubmit without
    // re-typing.
    await waitFor(() => {
      expect(screen.getByTestId("deploy-bpmn-modal")).toBeInTheDocument();
      expect(screen.getByText(/Engine returned 500/)).toBeInTheDocument();
    });
    // Dirty stays true: commandStack.canUndo() is still true; asterisk remains
    // on the deploy button under the modal.
    expect(screen.getByTestId("bpmn-deploy").textContent).toMatch(/Deploy \*/);
  });

  it("Deploy click opens the modal with filename-derived defaults (PR #168 round 4)", async () => {
    renderModeler();
    await waitFor(() => expect(buses.length).toBe(1));
    fireEvent.click(screen.getByTestId("bpmn-deploy"));
    await waitFor(() => expect(screen.getByTestId("deploy-bpmn-modal")).toBeInTheDocument());
    // Defaults derive from the initial filename "loan-approval.bpmn20.xml"
    const nameInput = screen.getByTestId("deploy-bpmn-name") as HTMLInputElement;
    const keyInput = screen.getByTestId("deploy-bpmn-key") as HTMLInputElement;
    expect(nameInput.value).toBe("Loan Approval");
    expect(keyInput.value).toBe("loan-approval");
  });
});
