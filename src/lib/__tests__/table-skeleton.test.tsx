// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for TableSkeleton.
 *
 * Renders in jsdom — purely structural; the shimmer animation is CSS-only
 * and is verified visually via the design-system snapshot story (out of scope
 * for unit). What's asserted here: shape, aria-busy, .skeleton-cell hook,
 * sensible defaults.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TableSkeleton } from "../table-skeleton";

describe("<TableSkeleton>", () => {
  afterEach(cleanup);

  it("renders the configured row x column shape", () => {
    render(<TableSkeleton columns={5} rows={3} />);
    const table = screen.getByTestId("table-skeleton");
    expect(table.tagName).toBe("TABLE");
    const headerCells = table.querySelectorAll("thead th");
    const bodyCells = table.querySelectorAll("tbody td");
    expect(headerCells.length).toBe(5);
    expect(bodyCells.length).toBe(15); // 5 cols * 3 rows
  });

  it("uses sensible defaults of 4 columns x 6 rows when props are omitted", () => {
    render(<TableSkeleton />);
    const table = screen.getByTestId("table-skeleton");
    expect(table.querySelectorAll("thead th").length).toBe(4);
    expect(table.querySelectorAll("tbody td").length).toBe(24);
  });

  it("has aria-busy='true' so screen readers announce loading state", () => {
    render(<TableSkeleton columns={2} rows={2} />);
    expect(screen.getByTestId("table-skeleton")).toHaveAttribute("aria-busy", "true");
  });

  it("uses the .skeleton-cell class on every body cell shimmer", () => {
    render(<TableSkeleton columns={2} rows={2} />);
    const cells = screen.getByTestId("table-skeleton").querySelectorAll("tbody td .skeleton-cell");
    expect(cells.length).toBe(4);
  });

  it("clamps non-positive props to 1 so callers can't render zero-row tables", () => {
    render(<TableSkeleton columns={0} rows={0} />);
    const table = screen.getByTestId("table-skeleton");
    expect(table.querySelectorAll("thead th").length).toBe(1);
    expect(table.querySelectorAll("tbody td").length).toBe(1);
  });
});
