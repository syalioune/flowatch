// SPDX-License-Identifier: Apache-2.0

/**
 * Smoke tests for the BpmnModeler component extracted in Story 16.1.
 *
 * The full bpmn-js Modeler cannot be mounted in jsdom — it depends on SVG
 * surfaces, the DOM `Range` API, and other browser-tier capabilities that
 * jsdom doesn't ship. Per the AC-9 expectation (`The actual bpmn-js Modeler
 * is too heavy to mount in tests`), we mock `bpmn-js/lib/Modeler` to a
 * thin stub and verify the component:
 *
 *   1. Mounts without throwing.
 *   2. Calls modeler.destroy() on unmount (cleanup contract).
 *   3. Subscribes to selection.changed + commandStack.changed with typed
 *      callbacks — verified by capturing the event-bus on(...) calls and
 *      replaying typed payloads through them.
 *
 * AC-3 + AC-9, Story 16.1.
 */

import { render } from "@testing-library/react";
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
      if (service === "commandStack") return { canUndo: () => false };
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

// Mock the api so the dropdown's listProcessDefinitions doesn't network.
vi.mock("../../api", async () => {
  const real = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...real,
    api: {
      ...real.api,
      listProcessDefinitions: vi.fn(() => Promise.resolve({ data: [] })),
      getProcessDefinitionResource: vi.fn(() => Promise.resolve("<bpmn:definitions/>")),
      deployBpmn: vi.fn(() => Promise.resolve({ id: "dep-1", name: "x" })),
    },
  };
});

// Import AFTER the mock declarations.
import { BpmnModeler } from "../BpmnModeler";

beforeEach(() => {
  importXMLSpy.mockClear();
  destroySpy.mockClear();
  zoomSpy.mockClear();
  filterSpy.mockClear();
  buses.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<BpmnModeler> — Story 16.1 AC-9 smoke", () => {
  it("mounts the vanilla bpmn-js Modeler via the ref'd container", async () => {
    const { unmount } = render(<BpmnModeler />);
    // The component instantiated the stub Modeler exactly once + imported
    // the LOAN starter on mount
    expect(buses.length).toBe(1);
    expect(importXMLSpy).toHaveBeenCalled();
    unmount();
  });

  it("calls modeler.destroy() on unmount (P-006 cleanup contract)", () => {
    const { unmount } = render(<BpmnModeler />);
    expect(destroySpy).not.toHaveBeenCalled();
    unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("subscribes to selection.changed + commandStack.changed with typed callbacks", () => {
    render(<BpmnModeler />);
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    const selHandlers = bus.handlers["selection.changed"];
    const cmdHandlers = bus.handlers["commandStack.changed"];
    expect(selHandlers).toBeDefined();
    expect(selHandlers?.length ?? 0).toBeGreaterThan(0);
    expect(cmdHandlers).toBeDefined();
    expect(cmdHandlers?.length ?? 0).toBeGreaterThan(0);
  });

  it("selection.changed typed payload is consumed without throwing", () => {
    render(<BpmnModeler />);
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

  it("commandStack.changed typed payload is consumed without throwing", () => {
    render(<BpmnModeler />);
    const bus = buses[0];
    if (!bus) throw new Error("bus not captured");
    expect(() => bus.fire("commandStack.changed", {})).not.toThrow();
    expect(() => bus.fire("commandStack.changed", { context: { foo: "bar" } })).not.toThrow();
  });
});
