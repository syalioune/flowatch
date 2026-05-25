// SPDX-License-Identifier: Apache-2.0

/**
 * History list route — seventh application of the Story 9.1 canonical list
 * archetype with multi-endpoint loader dispatch (mirrors src/routes/jobs/
 * index.tsx 12.1's tab-aware dispatch shape, now applied to a READ-only
 * surface).
 *
 * 13.1 introduced the route file with a single `instances` branch + a
 * transitional <LegacyHistoryShim> for `activities|variables|tasks`. 13.3
 * adds canonical-archetype dispatch for `variables` and `tasks` (in this
 * commit) and leaves `activities` routed through the shim. The follow-up
 * `chore(refactor):` commit drops the activities tab, the shim, and the
 * legacy <History> block from src/screens.tsx in a single
 * pure-deletion commit per Epic 12 retro §3.4.
 */

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import type React from "react";
import { z } from "zod";
import {
  api,
  type FlowableHistoricProcessInstance,
  type FlowableHistoricTask,
  type FlowableHistoricVariable,
  type FlowablePage,
} from "../../api";
import { fmtMs, fmtTime, Icon, PageHead } from "../../components";
import { typeTone } from "../../components/InstanceVariablesPanel";
import { EmptyState, type EmptyStateEntry, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { LegacyHistoryShim } from "../../lib/legacy-history-shim";
import { TableSkeleton } from "../../lib/table-skeleton";

type HistoricInstanceWide = FlowableHistoricProcessInstance & {
  processDefinitionName?: string;
};

type HistoricTaskWide = FlowableHistoricTask & {
  startTime?: string;
};

const historySearch = z.object({
  type: z.enum(["instances", "activities", "variables", "tasks"]).optional().default("instances"),
});

export type HistoryType = "instances" | "activities" | "variables" | "tasks";

// Loader dispatches between three historic endpoints + the legacy
// `activities` tab (which still routes through <LegacyHistoryShim> until
// the follow-up chore(refactor) commit). Exported for unit testing of the
// branch behaviour.
export const loadHistoryByType = (type: HistoryType) => {
  if (type === "instances") {
    return api.listHistoricInstances({
      size: 50,
      finished: true,
      sort: "endTime",
      order: "desc",
    });
  }
  if (type === "variables") return api.listHistoricVariables({ size: 50 });
  if (type === "tasks") return api.listHistoricTasks({ size: 50, finished: true });
  // `activities` tab is handled by the legacy shim — no route-level fetch.
  return null;
};

export const Route = createFileRoute("/history/")({
  validateSearch: historySearch,
  loaderDeps: ({ search: { type } }) => ({ type }),
  loader: ({ deps }) => loadHistoryByType(deps.type),
  staticData: {
    title: "History",
    endpoints: [
      {
        method: "GET",
        path: "/history/historic-process-instances",
        desc: "Completed instances",
      },
      {
        method: "GET",
        path: "/history/historic-variable-instances",
        desc: "Historic variables",
      },
      {
        method: "GET",
        path: "/history/historic-task-instances",
        desc: "Historic tasks",
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
          <button
            type="button"
            className="btn"
            data-testid="history-refresh"
            onClick={onRefresh}
            disabled={!onRefresh}
          >
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
  // Column count differs by tab; default to 5 (matches instances + tasks).
  const cols = type === "variables" ? 4 : 5;
  return (
    <PageChrome type={type} onTypeChange={onTypeChange}>
      <TableSkeleton columns={cols} rows={6} />
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

const emptyStateByType = (type: HistoryType): EmptyStateEntry | undefined => {
  if (type === "instances") return emptyStates.historicInstances;
  if (type === "variables") return emptyStates.historicVariables;
  if (type === "tasks") return emptyStates.historicTasks;
  return undefined;
};

function HistoryRoute() {
  const data = Route.useLoaderData();
  const { type, onTypeChange } = useTypeNav();
  const router = useRouter();
  const navigate = useNavigate();

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/history/" });
  const openDetail = (id: string) => navigate({ to: "/instances/$id", params: { id } });

  // `activities` tab keeps routing through the legacy shim until the
  // follow-up chore(refactor) commit drops the legacy block + the
  // tab from the seg-row + the Zod schema atomically.
  if (type === "activities") {
    return (
      <PageChrome type={type} onTypeChange={onTypeChange}>
        <LegacyHistoryShim type={type} />
      </PageChrome>
    );
  }

  if (!data || data.data.length === 0) {
    const entry = emptyStateByType(type);
    return (
      <PageChrome onRefresh={refresh} type={type} onTypeChange={onTypeChange}>
        {entry ? <EmptyState entry={entry} /> : null}
      </PageChrome>
    );
  }

  if (type === "instances") {
    const page = data as FlowablePage<FlowableHistoricProcessInstance>;
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
            {page.data.map((raw) => {
              const p = raw as HistoricInstanceWide;
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

  if (type === "variables") {
    const page = data as FlowablePage<FlowableHistoricVariable>;
    return (
      <PageChrome onRefresh={refresh} type={type} onTypeChange={onTypeChange}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Type</th>
              <th>Instance</th>
              <th>Task</th>
            </tr>
          </thead>
          <tbody>
            {page.data.map((v) => (
              <tr key={v.id} data-historic-variable-id={v.id}>
                <td>
                  <span className="mono">{v.variableName}</span>
                </td>
                <td>
                  <span className="badge" data-tone={typeTone(v.variableType)}>
                    {v.variableType ?? "—"}
                  </span>
                </td>
                <td>
                  {v.processInstanceId ? (
                    <Link
                      to="/instances/$id"
                      params={{ id: v.processInstanceId }}
                      className="mono"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {v.processInstanceId}
                    </Link>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mono mute">{v.taskId || <span className="mute">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PageChrome>
    );
  }

  // type === "tasks"
  const page = data as FlowablePage<FlowableHistoricTask>;
  return (
    <PageChrome onRefresh={refresh} type={type} onTypeChange={onTypeChange}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Assignee</th>
            <th>Instance</th>
            <th>Started</th>
            <th>Ended</th>
          </tr>
        </thead>
        <tbody>
          {page.data.map((raw) => {
            const t = raw as HistoricTaskWide;
            return (
              <tr key={t.id} data-historic-task-id={t.id}>
                <td>{t.name || <span className="mute">—</span>}</td>
                <td className="mono">{t.assignee || <span className="mute">unassigned</span>}</td>
                <td>
                  {t.processInstanceId ? (
                    <Link
                      to="/instances/$id"
                      params={{ id: t.processInstanceId }}
                      className="mono"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.processInstanceId}
                    </Link>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mute mono">{fmtTime(t.startTime ?? t.createTime)}</td>
                <td className="mute mono">
                  {t.endTime ? fmtTime(t.endTime) : <span className="mute">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageChrome>
  );
}
