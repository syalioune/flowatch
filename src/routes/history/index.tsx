// SPDX-License-Identifier: Apache-2.0

/**
 * History list route (Story 13.1) — sixth application of the Story 9.1
 * canonical list archetype (loader + four-state contract + EmptyState +
 * TableSkeleton). Structural copy of src/routes/jobs/index.tsx (12.1) with
 * one new shape: the URL-driven `<seg-row>` dispatches between the
 * canonical archetype (Instances tab) AND a transitional `<LegacyHistoryShim>`
 * for the remaining three tabs. Story 13.3 migrates the Variables + Tasks
 * tabs to real canonical loaders and deletes the shim.
 *
 * Routing identity: the old `src/routes/history.tsx` is DELETED in the same
 * PR — TanStack Router treats `routes/history.tsx` and `routes/history/index.tsx`
 * as the same `/history` route, so the directory form is a structural
 * relocation (no URL change).
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { z } from "zod";
import { api, type FlowableHistoricProcessInstance } from "../../api";
import { fmtMs, fmtTime, Icon, PageHead } from "../../components";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { LegacyHistoryShim } from "../../lib/legacy-history-shim";
import { TableSkeleton } from "../../lib/table-skeleton";

type HistoricWide = FlowableHistoricProcessInstance & {
  processDefinitionName?: string;
};

const historySearch = z.object({
  type: z.enum(["instances", "activities", "variables", "tasks"]).optional().default("instances"),
});

export type HistoryType = "instances" | "activities" | "variables" | "tasks";

// Exported for unit testing of the AC-1 type-branch behaviour. The loader
// returns null when the type is not `instances` so the legacy shim renders
// without re-fetching at the route level.
export const loadHistoricInstances = (type: HistoryType) => {
  if (type !== "instances") return null;
  return api.listHistoricInstances({
    size: 50,
    finished: true,
    sort: "endTime",
    order: "desc",
  });
};

export const Route = createFileRoute("/history/")({
  validateSearch: historySearch,
  loaderDeps: ({ search: { type } }) => ({ type }),
  loader: ({ deps }) => loadHistoricInstances(deps.type),
  staticData: {
    title: "History",
    endpoints: [
      {
        method: "GET",
        path: "/history/historic-process-instances",
        desc: "List completed instances",
      },
    ],
  },
  component: HistoryRoute,
  pendingComponent: HistoryPending,
  errorComponent: HistoryError,
});

interface PageChromeProps {
  children: React.ReactNode;
  onRefresh?: (() => void) | undefined;
  type: HistoryType;
  onTypeChange: (t: HistoryType) => void;
}

function PageChrome({ children, onRefresh, type, onTypeChange }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="History"
        subtitle="Completed process instances and audit trail."
        actions={
          <button type="button" className="btn" onClick={onRefresh} disabled={!onRefresh}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="seg-row" data-testid="history-type-filter" style={{ padding: "0 0 12px 0" }}>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "instances" ? "1" : "0"}
          onClick={() => onTypeChange("instances")}
        >
          Instances
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "activities" ? "1" : "0"}
          onClick={() => onTypeChange("activities")}
        >
          Activities
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "variables" ? "1" : "0"}
          onClick={() => onTypeChange("variables")}
        >
          Variables
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "tasks" ? "1" : "0"}
          onClick={() => onTypeChange("tasks")}
        >
          Tasks
        </button>
      </div>
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function useTypeNav() {
  const { type } = Route.useSearch();
  const navigate = useNavigate({ from: "/history/" });
  const onTypeChange = (next: HistoryType) =>
    navigate({ search: (prev) => ({ ...prev, type: next }) });
  return { type: type as HistoryType, onTypeChange };
}

function HistoryPending() {
  const { type, onTypeChange } = useTypeNav();
  return (
    <PageChrome type={type} onTypeChange={onTypeChange}>
      <TableSkeleton columns={5} rows={6} />
    </PageChrome>
  );
}

interface HistoryErrorProps {
  error: Error;
  reset: () => void;
}

function HistoryError({ error, reset }: HistoryErrorProps) {
  const { type, onTypeChange } = useTypeNav();
  return (
    <PageChrome type={type} onTypeChange={onTypeChange}>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  );
}

function HistoryRoute() {
  const data = Route.useLoaderData();
  const { type, onTypeChange } = useTypeNav();
  const router = useRouter();
  const navigate = useNavigate();

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/history/" });
  const openDetail = (id: string) => navigate({ to: "/instances/$id", params: { id } });

  if (type !== "instances") {
    return (
      <PageChrome type={type} onTypeChange={onTypeChange}>
        <LegacyHistoryShim type={type} />
      </PageChrome>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh} type={type} onTypeChange={onTypeChange}>
        {(() => {
          const entry = emptyStates.historicInstances;
          if (!entry) return null;
          return <EmptyState entry={entry} />;
        })()}
      </PageChrome>
    );
  }

  return (
    <PageChrome onRefresh={refresh} type={type} onTypeChange={onTypeChange}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Business key</th>
            <th>Definition</th>
            <th>Duration</th>
            <th>Started</th>
            <th>Ended</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((raw) => {
            const p = raw as HistoricWide;
            return (
              <tr
                key={p.id}
                data-historic-instance-id={p.id}
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => openDetail(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(p.id);
                }}
              >
                <td className="mono">{p.businessKey || p.id}</td>
                <td>{p.processDefinitionName || p.processDefinitionKey}</td>
                <td className="mono">{fmtMs(p.durationInMillis)}</td>
                <td className="mute mono">{fmtTime(p.startTime)}</td>
                <td className="mute mono">{fmtTime(p.endTime)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageChrome>
  );
}
