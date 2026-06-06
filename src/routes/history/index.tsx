// SPDX-License-Identifier: Apache-2.0

/**
 * History list route — seventh application of the Story 9.1 canonical list
 * archetype with multi-endpoint loader dispatch (mirrors src/routes/jobs/
 * index.tsx 12.1's tab-aware dispatch shape, applied to a READ-only
 * surface).
 *
 * Tabs: Instances / Variables / Tasks — each tab dispatches via the
 * URL search-param to a different historic endpoint with its own
 * canonical-archetype table render. The legacy `?type=activities` flat
 * list was dropped in the Story 13.3 follow-up refactor commit; the
 * per-instance audit trail in <InstanceHistoricActivitiesPanel> on
 * /instances/$id is the operator-relevant view (Story 13.2).
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
import { prettyJson, typeTone } from "../../components/InstanceVariablesPanel";
import { EmptyState, type EmptyStateEntry, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { TableSkeleton } from "../../lib/table-skeleton";

type HistoricInstanceWide = FlowableHistoricProcessInstance & {
  processDefinitionName?: string;
};

type HistoricTaskWide = FlowableHistoricTask & {
  startTime?: string;
};

// Render historic variable values for the row preview. Mirrors the
// `InstanceVariablesPanel` strategy: primitive types render via String(),
// JSON-typed values pretty-print via the shared `prettyJson` helper (so
// the 4 KB render-side budget applies), and null / undefined collapse to
// a muted dash. This is a row-cell render — no <pre>; truncate to a short
// width so the table stays readable.
const HISTORIC_VALUE_ROW_BUDGET = 120;

const renderHistoricValue = (value: unknown): React.ReactNode => {
  if (value === null || value === undefined) return <span className="mute">—</span>;
  if (typeof value === "object") {
    const pretty = prettyJson(value);
    if (pretty.length > HISTORIC_VALUE_ROW_BUDGET) {
      return `${pretty.slice(0, HISTORIC_VALUE_ROW_BUDGET)}…`;
    }
    return pretty;
  }
  const raw = String(value);
  const quoted = typeof value === "string" ? `"${raw}"` : raw;
  if (quoted.length > HISTORIC_VALUE_ROW_BUDGET)
    return `${quoted.slice(0, HISTORIC_VALUE_ROW_BUDGET)}…`;
  return quoted;
};

const historySearch = z.object({
  type: z.enum(["instances", "variables", "tasks"]).optional().default("instances"),
});

export type HistoryType = "instances" | "variables" | "tasks";

// Loader dispatches between the three canonical-archetype historic
// endpoints. Exported for unit testing of the branch behaviour.
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
  return api.listHistoricTasks({ size: 50, finished: true });
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
  // All three tabs ship a 5-column table (Instances, Variables, Tasks).
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
  // Operator clicked a HISTORIC row → land on the History tab of the
  // instance detail, not the default Runtime tab. The historic data is
  // what the operator was looking at and clicked through to.
  const openDetail = (id: string) =>
    navigate({ to: "/instances/$id", params: { id }, search: { tab: "history" } });

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
              <th scope="col">Business key</th>
              <th scope="col">Definition</th>
              <th scope="col">Duration</th>
              <th scope="col">Started</th>
              <th scope="col">Ended</th>
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
              <th scope="col">Variable</th>
              <th scope="col">Type</th>
              <th scope="col">Value</th>
              <th scope="col">Instance</th>
              <th scope="col">Task</th>
            </tr>
          </thead>
          <tbody>
            {page.data.map((v) => {
              const inner = v.variable;
              return (
                <tr key={v.id} data-historic-variable-id={v.id}>
                  <td>
                    <span className="mono">{inner?.name ?? <span className="mute">—</span>}</span>
                  </td>
                  <td>
                    <span className="badge" data-tone={typeTone(inner?.type)}>
                      <span className="sr-only">Variable type: </span>
                      {inner?.type ?? "—"}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>
                    {renderHistoricValue(inner?.value)}
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
              );
            })}
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
            <th scope="col">Name</th>
            <th scope="col">Assignee</th>
            <th scope="col">Instance</th>
            <th scope="col">Started</th>
            <th scope="col">Ended</th>
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
