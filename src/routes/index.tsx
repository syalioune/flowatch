// SPDX-License-Identifier: Apache-2.0

/**
 * Dashboard route: four KPI tiles, per-tile state handling.
 *
 * Per NFR-3: all four API calls fire in parallel via Promise.allSettled —
 * one slow endpoint does not delay the others.
 * Per NFR-6: partial failure shows three healthy tiles + one error badge;
 * a failing endpoint never blanks the whole screen. There is NO top-level
 * <ErrorBox> on this route — the per-tile error badge is the contract.
 * Per Pattern P-002 (per-tile extension): each tile independently renders
 * loading (.kpi-skeleton), data (count), empty (0, not error), or error
 * (em-dash + .badge[data-tone="bad"] with verbatim engine message in title).
 *
 * Story 7.4 / Epic 7.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import React from "react";
import { api, type FlowablePage } from "../api";
import { errorStatus } from "../lib/error";

type TileResult = PromiseSettledResult<FlowablePage<unknown> | { total: number }>;

interface TileSpec {
  label: string;
  to: "/" | "/instances" | "/jobs" | "/tasks" | "/deployments";
  search?: Record<string, string>;
}

const TILES: ReadonlyArray<TileSpec> = [
  { label: "Running instances", to: "/instances" },
  { label: "Failing jobs", to: "/jobs", search: { type: "executable" } },
  { label: "My tasks", to: "/tasks", search: { assignee: "me" } },
  { label: "Deployments", to: "/deployments" },
];

export const Route = createFileRoute("/")({
  staticData: {
    title: "Dashboard",
    endpoints: [
      {
        method: "GET",
        path: "/runtime/process-instances?size=0",
        desc: "Running instances count",
      },
      {
        method: "GET",
        path: "/management/jobs?size=0&withException=true",
        desc: "Failing jobs count",
      },
      {
        method: "GET",
        path: "/runtime/tasks?size=0&assignee=<current-user>",
        desc: "My tasks count",
      },
      { method: "GET", path: "/repository/deployments?size=0", desc: "Deployments count" },
    ],
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  const [results, setResults] = React.useState<TileResult[] | null>(null);

  React.useEffect(() => {
    const currentUser = api.config().username;
    let cancelled = false;
    void Promise.allSettled([
      api.listProcessInstances({ size: 0 }),
      api.listJobs({ size: 0, withException: true }),
      api.listTasks({ size: 0, assignee: currentUser }),
      api.listDeployments({ size: 0 }),
    ]).then((settled) => {
      if (!cancelled) setResults(settled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page" style={{ padding: 24 }}>
      <div className="kpi-grid">
        {TILES.map((spec, i) => (
          <KpiTile key={spec.label} spec={spec} result={results?.[i] ?? null} />
        ))}
      </div>
    </div>
  );
}

interface KpiTileProps {
  spec: TileSpec;
  result: TileResult | null;
}

function KpiTile({ spec, result }: KpiTileProps) {
  return (
    <Link
      to={spec.to}
      search={spec.search as never}
      className="kpi"
      style={{ cursor: "pointer", textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div className="kpi-lbl">{spec.label}</div>
      <div className="kpi-val">
        <KpiValue result={result} />
      </div>
    </Link>
  );
}

function KpiValue({ result }: { result: TileResult | null }) {
  if (result === null) {
    return <span className="kpi-skeleton" aria-hidden="true" />;
  }
  if (result.status === "fulfilled") {
    return <>{result.value.total}</>;
  }
  const err = result.reason;
  const status = errorStatus(err);
  const message = err instanceof Error ? err.message : String(err ?? "");
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span>—</span>
      <span
        className="badge"
        data-tone="bad"
        title={message}
        style={{ fontSize: 11, alignSelf: "center" }}
      >
        {status > 0 ? `HTTP ${status}` : "Error"}
      </span>
    </span>
  );
}
