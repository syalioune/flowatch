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
import { EmptyState, emptyStates, getEmptyState } from "../empty-states";

describe("empty-states registry", () => {
  afterEach(cleanup);

  it("exposes an activeActivities entry (added with InstanceActiveActivitiesPanel)", () => {
    expect(emptyStates.activeActivities).toBeDefined();
    expect(getEmptyState("activeActivities").title).toBe("No active activities right now.");
    expect(getEmptyState("activeActivities").body).toMatch(/idle/);
    expect(getEmptyState("activeActivities").cta).toBeUndefined();
  });

  it("bootstraps a deployments entry with the documented copy", () => {
    expect(emptyStates.deployments).toBeDefined();
    expect(getEmptyState("deployments").title).toBe("No deployments yet.");
    expect(getEmptyState("deployments").body).toBe(
      "Upload a .bpmn file or use the BPMN modeler to deploy your first process.",
    );
    expect(getEmptyState("deployments").cta).toBeUndefined();
  });

  it("exposes a definitions entry (added in Story 9.4)", () => {
    expect(emptyStates.definitions).toBeDefined();
    expect(getEmptyState("definitions").title).toBe("No process definitions yet.");
    expect(getEmptyState("definitions").body).toBe(
      "Upload a BPMN deployment to see process definitions here.",
    );
    expect(getEmptyState("definitions").cta).toBeUndefined();
  });

  it("exposes a deploymentResources entry (added in Story 9.6)", () => {
    expect(emptyStates.deploymentResources).toBeDefined();
    expect(getEmptyState("deploymentResources").title).toBe("No resources.");
    expect(getEmptyState("deploymentResources").body).toMatch(/deployments typically bundle/);
  });

  it("exposes an instances entry (added in Story 10.1)", () => {
    expect(emptyStates.instances).toBeDefined();
    expect(getEmptyState("instances").title).toBe("No running process instances.");
    expect(getEmptyState("instances").body).toBe(
      "Start an instance from a process definition to see it listed here.",
    );
    expect(getEmptyState("instances").cta).toBeUndefined();
  });

  it("exposes an instanceVariables entry (added in Story 10.4)", () => {
    expect(emptyStates.instanceVariables).toBeDefined();
    expect(getEmptyState("instanceVariables").title).toBe("No variables.");
    expect(getEmptyState("instanceVariables").body).toBe(
      "This instance is not carrying any global or local variables yet.",
    );
    expect(getEmptyState("instanceVariables").cta).toBeUndefined();
  });

  it("exposes a jobs entry (added in Story 12.1)", () => {
    expect(emptyStates.jobs).toBeDefined();
    expect(getEmptyState("jobs").title).toBe("No jobs on this tab.");
    expect(getEmptyState("jobs").body).toBe(
      "Try switching to Timers or Dead-letter, or trigger a workflow that schedules background work.",
    );
    expect(getEmptyState("jobs").cta).toBeUndefined();
  });

  it("exposes a stacktrace entry (added in Story 12.4)", () => {
    expect(emptyStates.stacktrace).toBeDefined();
    expect(getEmptyState("stacktrace").title).toBe("No stacktrace available.");
    expect(getEmptyState("stacktrace").body).toMatch(/no recorded exception/);
    expect(getEmptyState("stacktrace").cta).toBeUndefined();
  });

  it("exposes a historicActivities entry (added in Story 13.2)", () => {
    expect(emptyStates.historicActivities).toBeDefined();
    expect(getEmptyState("historicActivities").title).toBe(
      "No recorded activities for this instance yet.",
    );
    expect(getEmptyState("historicActivities").body).toMatch(/Activities appear here/);
    expect(getEmptyState("historicActivities").cta).toBeUndefined();
  });

  it("exposes a historicInstanceVariables entry (added with InstanceHistoricVariablesPanel)", () => {
    expect(emptyStates.historicInstanceVariables).toBeDefined();
    expect(getEmptyState("historicInstanceVariables").title).toBe(
      "No historic variables for this instance.",
    );
    expect(getEmptyState("historicInstanceVariables").body).toMatch(/Variables appear here/);
    expect(getEmptyState("historicInstanceVariables").cta).toBeUndefined();
  });

  it("exposes a historicInstances entry (added in Story 13.1)", () => {
    expect(emptyStates.historicInstances).toBeDefined();
    expect(getEmptyState("historicInstances").title).toBe("No completed instances yet.");
    expect(getEmptyState("historicInstances").body).toMatch(/historic record/);
    expect(getEmptyState("historicInstances").cta).toBeUndefined();
  });

  it("exposes a historicNoRecord entry (added in Story 13.1)", () => {
    expect(emptyStates.historicNoRecord).toBeDefined();
    expect(getEmptyState("historicNoRecord").title).toBe("No historic record yet.");
    expect(getEmptyState("historicNoRecord").body).toMatch(/still running/);
    expect(getEmptyState("historicNoRecord").cta).toBeUndefined();
  });

  it("exposes a historicTasks entry (added in Story 13.3)", () => {
    expect(emptyStates.historicTasks).toBeDefined();
    expect(getEmptyState("historicTasks").title).toBe("No historic tasks yet.");
    expect(getEmptyState("historicTasks").body).toMatch(/Completed tasks/);
    expect(getEmptyState("historicTasks").cta).toBeUndefined();
  });

  it("exposes a historicVariables entry (added in Story 13.3)", () => {
    expect(emptyStates.historicVariables).toBeDefined();
    expect(getEmptyState("historicVariables").title).toBe("No historic variables yet.");
    expect(getEmptyState("historicVariables").body).toMatch(/archives its variable history/);
    expect(getEmptyState("historicVariables").cta).toBeUndefined();
  });

  it("exposes a runtimeEnded entry (added in Story 13.1)", () => {
    expect(emptyStates.runtimeEnded).toBeDefined();
    expect(getEmptyState("runtimeEnded").title).toBe("This instance has ended.");
    expect(getEmptyState("runtimeEnded").body).toMatch(/historic record below/);
    expect(getEmptyState("runtimeEnded").cta).toBeUndefined();
  });

  it("exposes a tasks entry (added in Story 11.1)", () => {
    expect(emptyStates.tasks).toBeDefined();
    expect(getEmptyState("tasks").title).toBe("No tasks for this filter.");
    expect(getEmptyState("tasks").body).toBe(
      "Try switching the filter, or wait for a workflow to assign one.",
    );
    expect(getEmptyState("tasks").cta).toBeUndefined();
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
