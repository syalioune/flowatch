// SPDX-License-Identifier: Apache-2.0

/**
 * Jobs list route (Story 12.1) — fifth application of the Story 9.1 canonical
 * list archetype (loader + four-state contract + EmptyState + RowActionMenu +
 * TableSkeleton). Structural copy of src/routes/tasks/index.tsx (11.1) with
 * one new shape: the URL-driven `<seg-row>` selects between THREE DIFFERENT
 * API endpoints (executable / timer / dead-letter), not three parameter
 * variants of the same endpoint. Three placeholder row actions forward-
 * reference Stories 12.2 (Execute now), 12.3 (Move to executable), 12.4
 * (View stacktrace).
 */

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { z } from "zod";
import { api, type FlowableJob } from "../../api";
import { fmtDue, Icon, PageHead, toast } from "../../components";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { NAV_INVALIDATE_COUNTS } from "../../lib/nav-events";
import { type RowActionItem, RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";

// Engine-returned fields not on the typed FlowableJob DTO — same rationale
// as the legacy screens.tsx `Loose<T>` pattern. A formal widening of
// FlowableJob is deferred to a future API-surface story.
type JobWide = FlowableJob & {
  elementId?: string;
  elementName?: string;
};

const jobsSearch = z.object({
  type: z.enum(["executable", "timer", "deadletter"]).optional().default("executable"),
});

export type JobsType = "executable" | "timer" | "deadletter";

// Exported for unit testing of the AC-1 three-endpoint branching. Not re-used
// elsewhere — the route's `loader` slot is the only production caller.
export const loadJobs = (type: JobsType) => {
  if (type === "timer") return api.listTimerJobs({ size: 50 });
  if (type === "deadletter") return api.listDeadLetterJobs({ size: 50 });
  // FR-24: the executable tab filters with withException=true so failing
  // jobs surface first.
  return api.listJobs({ size: 50, withException: true });
};

export const Route = createFileRoute("/jobs/")({
  validateSearch: jobsSearch,
  loaderDeps: ({ search: { type } }) => ({ type }),
  loader: ({ deps }) => loadJobs(deps.type),
  staticData: {
    title: "Jobs",
    endpoints: [
      { method: "GET", path: "/management/jobs", desc: "List executable jobs" },
      { method: "GET", path: "/management/timer-jobs", desc: "List timer jobs" },
      { method: "GET", path: "/management/deadletter-jobs", desc: "List dead-letter jobs" },
    ],
  },
  component: JobsRoute,
  pendingComponent: JobsPending,
  errorComponent: JobsError,
});

interface PageChromeProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  type: JobsType;
  onTypeChange: (t: JobsType) => void;
}

function PageChrome({ children, onRefresh, type, onTypeChange }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Jobs"
        subtitle="Background work: timers, async continuations, and retry queues."
        actions={
          <button type="button" className="btn" onClick={onRefresh} disabled={!onRefresh}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="seg-row" data-testid="jobs-type-filter" style={{ padding: "0 0 12px 0" }}>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "executable" ? "1" : "0"}
          onClick={() => onTypeChange("executable")}
        >
          Jobs
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "timer" ? "1" : "0"}
          onClick={() => onTypeChange("timer")}
        >
          Timers
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={type === "deadletter" ? "1" : "0"}
          onClick={() => onTypeChange("deadletter")}
        >
          Dead-letter
        </button>
      </div>
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function useTypeNav() {
  const { type } = Route.useSearch();
  const navigate = useNavigate({ from: "/jobs/" });
  const onTypeChange = (next: JobsType) =>
    navigate({ search: (prev) => ({ ...prev, type: next }) });
  return { type: type as JobsType, onTypeChange };
}

function JobsPending() {
  const { type, onTypeChange } = useTypeNav();
  return (
    <PageChrome type={type} onTypeChange={onTypeChange}>
      <TableSkeleton columns={6} rows={6} />
    </PageChrome>
  );
}

interface JobsErrorProps {
  error: Error;
  reset: () => void;
}

function JobsError({ error, reset }: JobsErrorProps) {
  const { type, onTypeChange } = useTypeNav();
  return (
    <PageChrome type={type} onTypeChange={onTypeChange}>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  );
}

function JobsRoute() {
  const data = Route.useLoaderData();
  const { type, onTypeChange } = useTypeNav();
  const router = useRouter();
  // Story 12.2: optimistic busy-Set archetype (second consumer after 11.2's
  // optimisticComplete). RC-3-safe: every mutation replaces the Set identity
  // so React re-renders. Lifecycle: add on dispatch, delete on settle
  // (success AND failure). The list reconciliation comes from
  // router.invalidate on both paths — engine is source of truth.
  const [optimisticExecuting, setOptimisticExecuting] = React.useState<Set<string>>(new Set());
  // Story 12.3: third consumer of the optimistic busy-Set archetype (after
  // 11.2 optimisticComplete + 12.2 optimisticExecuting). Same shape, new
  // instance. Extraction deferred — see Story 12.3 AC-9 rationale (three
  // handlers diverge meaningfully).
  const [optimisticMoving, setOptimisticMoving] = React.useState<Set<string>>(new Set());

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/jobs/" });

  // Story 12.2 AC-1: Execute on demand with optimistic busy-flag.
  // Live-engine review patch: timer-job IDs do NOT resolve at
  // /management/jobs/{id} — Flowable 7.x keeps a separate namespace. Branch
  // on the active tab so the executable tab hits api.executeJob and the
  // timer tab hits api.executeTimerJob.
  const handleExecute = async (j: FlowableJob) => {
    setOptimisticExecuting((s) => new Set(s).add(j.id));
    try {
      if (type === "timer") await api.executeTimerJob(j.id);
      else await api.executeJob(j.id);
      toast({ kind: "ok", text: `Executed: ${j.id}`, ttl: 3000 });
      await router.invalidate({ filter: (r) => r.routeId === "/jobs/" });
      window.dispatchEvent(new CustomEvent(NAV_INVALIDATE_COUNTS));
      setOptimisticExecuting((s) => {
        const copy = new Set(s);
        copy.delete(j.id);
        return copy;
      });
    } catch (err) {
      setOptimisticExecuting((s) => {
        const copy = new Set(s);
        copy.delete(j.id);
        return copy;
      });
      toast({
        kind: "err",
        text: "Execute failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
      // Engine may have executed the job in a parallel session — reload to
      // converge with engine truth (mirror 11.2 handleComplete).
      void router.invalidate({ filter: (r) => r.routeId === "/jobs/" });
    }
  };

  // Story 12.3 AC-1: Move a dead-letter job back to executable.
  // Deliberate variance from handleExecute (AC-4): NO NAV_INVALIDATE_COUNTS
  // dispatch — the badge counts withException=true executable jobs, and a
  // freshly-moved row is queued (not failing), so the count is unchanged.
  // router.invalidate({ filter }) invalidates ALL /jobs/ matches regardless
  // of loaderDeps key (Result A from AC-3 probe), so the executable tab
  // also picks up the moved row on next visit.
  const handleMove = async (j: FlowableJob) => {
    setOptimisticMoving((s) => new Set(s).add(j.id));
    try {
      await api.moveDeadLetterJob(j.id);
      toast({ kind: "ok", text: `Moved to executable: ${j.id}`, ttl: 3000 });
      await router.invalidate({ filter: (r) => r.routeId === "/jobs/" });
      setOptimisticMoving((s) => {
        const copy = new Set(s);
        copy.delete(j.id);
        return copy;
      });
    } catch (err) {
      setOptimisticMoving((s) => {
        const copy = new Set(s);
        copy.delete(j.id);
        return copy;
      });
      toast({
        kind: "err",
        text: "Move failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
      void router.invalidate({ filter: (r) => r.routeId === "/jobs/" });
    }
  };

  if (data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh} type={type} onTypeChange={onTypeChange}>
        {(() => {
          const entry = emptyStates.jobs;
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
            <th>Job</th>
            <th>Element</th>
            <th>Process instance</th>
            <th>Due</th>
            <th>Retries</th>
            <th>Exception</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((raw) => {
            const j = raw as JobWide;
            const isExecuting = optimisticExecuting.has(j.id);
            const isMoving = optimisticMoving.has(j.id);
            const isBusy = isExecuting || isMoving;
            // Jobs has no detail page — row click would have no destination.
            // Stacktrace inspection lands inside the row in Story 12.4.
            const items: RowActionItem[] = [
              type !== "deadletter" && {
                label: "Execute now",
                disabled: isExecuting,
                onSelect: () => handleExecute(j),
              },
              type === "deadletter" && {
                label: "Move to executable",
                disabled: isMoving,
                onSelect: () => handleMove(j),
              },
              !!j.exceptionMessage && {
                label: "View stacktrace",
                onSelect: () =>
                  toast({ kind: "info", text: "View stacktrace arrives in Story 12.4", ttl: 4000 }),
                testId: "view-stacktrace-placeholder",
              },
            ].filter(Boolean) as RowActionItem[];

            return (
              <tr
                key={j.id}
                data-job-id={j.id}
                data-busy={isBusy ? "1" : undefined}
                style={isBusy ? { opacity: 0.6 } : undefined}
              >
                <td className="mono">{j.id}</td>
                <td className="mono mute">{j.elementId || j.elementName || "—"}</td>
                <td className="mono">
                  {j.processInstanceId ? (
                    <Link
                      to="/instances/$id"
                      params={{ id: j.processInstanceId }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {j.processInstanceId}
                    </Link>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mute mono">{j.dueDate ? fmtDue(j.dueDate) : "—"}</td>
                <td className="mono">
                  <span
                    className="badge"
                    data-tone={j.retries === 0 ? "bad" : j.retries === 1 ? "warn" : "ok"}
                  >
                    {j.retries}
                  </span>
                </td>
                <td className="mono">
                  {j.exceptionMessage ? (
                    <span
                      className="badge"
                      data-tone="bad"
                      style={{
                        maxWidth: 240,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={j.exceptionMessage}
                    >
                      {j.exceptionMessage}
                    </span>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td>
                  {items.length > 0 && (
                    <RowActionMenu ariaLabel={`Actions for job ${j.id}`} items={items} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PageChrome>
  );
}
