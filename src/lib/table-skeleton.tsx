// SPDX-License-Identifier: Apache-2.0

/**
 * TableSkeleton — generic shimmer placeholder for the `pendingComponent` slot.
 *
 * Per Pattern P-002 (four-state render contract): list routes render this
 * during loader in-flight so layout stays stable through the transition. The
 * component is intentionally copy-free — every list screen reuses the same
 * shape; per-screen column headers would just blink in for a fraction of a
 * second and then be replaced by the real headers, so the skeleton renders
 * blank header cells.
 *
 * Per Pattern P-007 (design tokens only): all visual styling is driven from
 * CSS variables in src/styles.css (`.skeleton-cell` uses `--bg-elev` /
 * `--bg-hover` / `--border`). No hard-coded colours.
 *
 * `aria-busy="true"` on the wrapping `<table>` is the screen-reader contract
 * for "data loading"; no separate `aria-live` region is needed.
 */

import type React from "react";

export interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ columns = 4, rows = 6 }) => {
  const cols = Math.max(1, columns);
  const rowCount = Math.max(1, rows);
  return (
    <table className="tbl" aria-busy="true" data-testid="table-skeleton">
      <thead>
        <tr>
          {Array.from({ length: cols }, (_unused, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells have no identity beyond their position
            <th key={`h-${c}`}>
              <span aria-hidden="true">&nbsp;</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rowCount }, (_unused, r) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells have no identity beyond their position
          <tr key={`r-${r}`}>
            {Array.from({ length: cols }, (_unused2, c) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells have no identity beyond their position
              <td key={`c-${r}-${c}`}>
                <span className="skeleton-cell" aria-hidden="true">
                  &nbsp;
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
