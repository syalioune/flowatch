// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <LegacyHistoryShim> (Story 13.1 — transitional component).
 *
 * The shim wraps the legacy <History> from src/screens.tsx so the new
 * canonical `/history` route can delegate non-`instances` tabs without
 * forking the rendering shape. Asserts the wrapper renders + carries the
 * suppression data-attribute so the inline CSS rule hides the duplicate
 * `.seg-row`.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the legacy `History` component so the shim's contract (wrapper div +
// suppression style) can be exercised in jsdom without bringing in the
// History component's TanStack-router-bound <PageHead> / useApi chains.
vi.mock("../../screens", () => ({
  History: ({ initialType }: { initialType: string }) => (
    <div data-testid="mock-legacy-history">legacy:{initialType}</div>
  ),
}));

import { LegacyHistoryShim } from "../legacy-history-shim";

afterEach(() => {
  cleanup();
});

describe("<LegacyHistoryShim>", () => {
  it("renders the wrapping div with the suppression data attribute", () => {
    render(<LegacyHistoryShim type="variables" />);
    const wrap = screen.getByTestId("legacy-history-shim");
    expect(wrap).toBeInTheDocument();
    expect(wrap).toHaveAttribute("data-suppress-internal-seg-row", "1");
  });

  it("emits the inline style block hiding the legacy seg-row", () => {
    const { container } = render(<LegacyHistoryShim type="activities" />);
    const style = container.querySelector("style");
    expect(style?.textContent).toMatch(/seg-row:first-of-type/);
  });

  it("passes the active type through to the legacy History component", () => {
    render(<LegacyHistoryShim type="tasks" />);
    expect(screen.getByTestId("mock-legacy-history")).toHaveTextContent("legacy:tasks");
  });
});
