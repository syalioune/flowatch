// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the empty-states registry + EmptyState renderer.
 *
 * Story 9.1 bootstraps the registry with the deployments entry. The contract
 * tested here:
 *   (1) the deployments entry's title + body render verbatim;
 *   (2) the CTA <a> is NOT rendered when entry.cta is undefined;
 *   (3) the CTA <a> IS rendered when entry.cta is provided (forward-compat
 *       for stories that ship CTAs).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState, emptyStates } from "../empty-states";

describe("empty-states registry", () => {
  afterEach(cleanup);

  it("bootstraps a deployments entry with the documented copy", () => {
    expect(emptyStates.deployments).toBeDefined();
    expect(emptyStates.deployments?.title).toBe("No deployments yet.");
    expect(emptyStates.deployments?.body).toBe(
      "Upload a .bpmn file or use the BPMN modeler to deploy your first process.",
    );
    expect(emptyStates.deployments?.cta).toBeUndefined();
  });

  it("exposes a definitions entry (added in Story 9.4)", () => {
    expect(emptyStates.definitions).toBeDefined();
    expect(emptyStates.definitions?.title).toBe("No process definitions yet.");
    expect(emptyStates.definitions?.body).toBe(
      "Upload a BPMN deployment to see process definitions here.",
    );
    expect(emptyStates.definitions?.cta).toBeUndefined();
  });

  it("exposes a deploymentResources entry (added in Story 9.6)", () => {
    expect(emptyStates.deploymentResources).toBeDefined();
    expect(emptyStates.deploymentResources?.title).toBe("No resources.");
    expect(emptyStates.deploymentResources?.body).toMatch(/deployments typically bundle/);
  });

  it("exposes an instances entry (added in Story 10.1)", () => {
    expect(emptyStates.instances).toBeDefined();
    expect(emptyStates.instances?.title).toBe("No running process instances.");
    expect(emptyStates.instances?.body).toBe(
      "Start an instance from a process definition to see it listed here.",
    );
    expect(emptyStates.instances?.cta).toBeUndefined();
  });

  it("exposes an instanceVariables entry (added in Story 10.4)", () => {
    expect(emptyStates.instanceVariables).toBeDefined();
    expect(emptyStates.instanceVariables?.title).toBe("No variables.");
    expect(emptyStates.instanceVariables?.body).toBe(
      "This instance is not carrying any global or local variables yet.",
    );
    expect(emptyStates.instanceVariables?.cta).toBeUndefined();
  });

  it("exposes a jobs entry (added in Story 12.1)", () => {
    expect(emptyStates.jobs).toBeDefined();
    expect(emptyStates.jobs?.title).toBe("No jobs on this tab.");
    expect(emptyStates.jobs?.body).toBe(
      "Try switching to Timers or Dead-letter, or trigger a workflow that schedules background work.",
    );
    expect(emptyStates.jobs?.cta).toBeUndefined();
  });

  it("exposes a stacktrace entry (added in Story 12.4)", () => {
    expect(emptyStates.stacktrace).toBeDefined();
    expect(emptyStates.stacktrace?.title).toBe("No stacktrace available.");
    expect(emptyStates.stacktrace?.body).toMatch(/no recorded exception/);
    expect(emptyStates.stacktrace?.cta).toBeUndefined();
  });

  it("exposes a historicInstances entry (added in Story 13.1)", () => {
    expect(emptyStates.historicInstances).toBeDefined();
    expect(emptyStates.historicInstances?.title).toBe("No completed instances yet.");
    expect(emptyStates.historicInstances?.body).toMatch(/historic record/);
    expect(emptyStates.historicInstances?.cta).toBeUndefined();
  });

  it("exposes a historicNoRecord entry (added in Story 13.1)", () => {
    expect(emptyStates.historicNoRecord).toBeDefined();
    expect(emptyStates.historicNoRecord?.title).toBe("No historic record yet.");
    expect(emptyStates.historicNoRecord?.body).toMatch(/still running/);
    expect(emptyStates.historicNoRecord?.cta).toBeUndefined();
  });

  it("exposes a runtimeEnded entry (added in Story 13.1)", () => {
    expect(emptyStates.runtimeEnded).toBeDefined();
    expect(emptyStates.runtimeEnded?.title).toBe("This instance has ended.");
    expect(emptyStates.runtimeEnded?.body).toMatch(/historic record below/);
    expect(emptyStates.runtimeEnded?.cta).toBeUndefined();
  });

  it("exposes a tasks entry (added in Story 11.1)", () => {
    expect(emptyStates.tasks).toBeDefined();
    expect(emptyStates.tasks?.title).toBe("No tasks for this filter.");
    expect(emptyStates.tasks?.body).toBe(
      "Try switching the filter, or wait for a workflow to assign one.",
    );
    expect(emptyStates.tasks?.cta).toBeUndefined();
  });

  it("renders title + body for the deployments entry", () => {
    const entry = emptyStates.deployments;
    if (!entry) throw new Error("deployments entry missing");
    render(<EmptyState entry={entry} />);
    expect(screen.getByText("No deployments yet.")).toBeInTheDocument();
    expect(screen.getByText(/Upload a .bpmn file or use the BPMN modeler/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders a CTA link when entry.cta is provided", () => {
    const entry = {
      title: "Future CTA test",
      body: "Story 17.5 may widen the entry shape.",
      cta: { label: "Open docs", href: "/docs" },
    };
    render(<EmptyState entry={entry} />);
    const link = screen.getByRole("link", { name: "Open docs" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/docs");
  });

  it("exposes the empty-state container with data-testid for E2E selection", () => {
    const entry = emptyStates.deployments;
    if (!entry) throw new Error("deployments entry missing");
    render(<EmptyState entry={entry} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });
});
