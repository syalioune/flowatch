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
