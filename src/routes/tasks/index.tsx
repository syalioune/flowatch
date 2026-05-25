// SPDX-License-Identifier: Apache-2.0

/**
 * Tasks list route (Story 11.1) — fourth application of the Story 9.1
 * canonical list archetype (loader + four-state contract + EmptyState +
 * RowActionMenu + TableSkeleton). Structural copy of
 * src/routes/instances/index.tsx with two new shapes: a search-param-driven
 * filter <seg-row> above the table (first list screen with an in-page
 * filter affordance) and four placeholder row-actions forward-referencing
 * Stories 11.2 (Claim + Complete), 11.4 (Delegate), and 11.5 (Unclaim).
 */

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { z } from "zod";
import { api, type FlowableTask } from "../../api";
import { fmtDue, Icon, PageHead, toast } from "../../components";
import { DelegateTaskModal } from "../../lib/delegate-task-modal";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { type RowActionItem, RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";

// Engine-returned fields not on the typed FlowableTask DTO — same rationale
// as the legacy screens.tsx `Loose<T>` pattern. A formal widening of
// FlowableTask is deferred to a future API-surface story.
type TaskWide = FlowableTask & {
  candidateGroup?: string;
  processDefinitionName?: string;
  processDefinitionKey?: string;
};

const tasksSearch = z.object({
  assignee: z.enum(["me", "all", "unassigned"]).optional().default("all"),
});

export type TasksAssignee = "me" | "all" | "unassigned";

// Exported for unit testing of the AC-1 branching. Not re-used elsewhere —
// the route's `loader` slot is the only production caller.
export const loadTasks = (assignee: TasksAssignee) => {
  // Trim before truthy-check so a whitespace-only username (`" "`) is treated
  // as "missing" per AC-1's "empty / missing" wording. Otherwise we'd forward
  // `assignee=" "` to the engine and get an empty list silently.
  const username = api.config().username?.trim() ?? "";
  if (assignee === "me" && username) return api.listTasks({ size: 50, assignee: username });
  if (assignee === "unassigned") return api.listTasks({ size: 50, unassigned: true });
  return api.listTasks({ size: 50 });
};

// Overdue red, ≤24h amber, else green. Local-only helper — not exported.
const dueTone = (due: string): "bad" | "warn" | "ok" => {
  const t = new Date(due).getTime();
  if (t < Date.now()) return "bad";
  if (t < Date.now() + 86400000) return "warn";
  return "ok";
};

// High amber, low grey, default green. Local-only helper — not exported.
// Flowable's default priority is 50 per the engine docs.
const priTone = (p: number | undefined): "warn" | "mute" | "ok" => {
  const v = p ?? 50;
  if (v >= 75) return "warn";
  if (v <= 25) return "mute";
  return "ok";
};

export const Route = createFileRoute("/tasks/")({
  validateSearch: tasksSearch,
  loaderDeps: ({ search: { assignee } }) => ({ assignee }),
  loader: ({ deps }) => loadTasks(deps.assignee),
  staticData: {
    title: "Tasks",
    endpoints: [{ method: "GET", path: "/runtime/tasks", desc: "List tasks" }],
  },
  component: TasksRoute,
  pendingComponent: TasksPending,
  errorComponent: TasksError,
});

interface PageChromeProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  assignee: TasksAssignee;
  onFilterChange: (a: TasksAssignee) => void;
}

function PageChrome({ children, onRefresh, assignee, onFilterChange }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Tasks"
        subtitle="Work assigned to you or available to claim."
        actions={
          <button type="button" className="btn" onClick={onRefresh} disabled={!onRefresh}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div
        className="seg-row"
        data-testid="tasks-assignee-filter"
        style={{ padding: "0 0 12px 0" }}
      >
        <button
          type="button"
          className="seg-btn"
          data-on={assignee === "me" ? "1" : "0"}
          onClick={() => onFilterChange("me")}
        >
          Mine
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={assignee === "unassigned" ? "1" : "0"}
          onClick={() => onFilterChange("unassigned")}
        >
          Unassigned
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={assignee === "all" ? "1" : "0"}
          onClick={() => onFilterChange("all")}
        >
          All
        </button>
      </div>
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function useFilterNav() {
  const { assignee } = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks/" });
  const onFilterChange = (next: TasksAssignee) =>
    navigate({ search: (prev) => ({ ...prev, assignee: next }) });
  return { assignee: assignee as TasksAssignee, onFilterChange };
}

function TasksPending() {
  const { assignee, onFilterChange } = useFilterNav();
  return (
    <PageChrome assignee={assignee} onFilterChange={onFilterChange}>
      <TableSkeleton columns={5} rows={6} />
    </PageChrome>
  );
}

interface TasksErrorProps {
  error: Error;
  reset: () => void;
}

function TasksError({ error, reset }: TasksErrorProps) {
  const { assignee, onFilterChange } = useFilterNav();
  return (
    <PageChrome assignee={assignee} onFilterChange={onFilterChange}>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  );
}

function TasksRoute() {
  const data = Route.useLoaderData();
  const { assignee, onFilterChange } = useFilterNav();
  const router = useRouter();
  const navigate = useNavigate();
  // Trim so a whitespace-only username triggers the AC-6 warning + the AC-7
  // Unclaim-visibility predicate behaves consistently with the loader.
  const cfgUsername = api.config().username?.trim() ?? "";

  // Story 11.2: optimistic-UI Map archetype (second application; 9.4 was the
  // first). RC-3-safe: every mutation replaces the Map/Set identity so React
  // re-renders. Per Story 11.2 Dev Notes "Why the asymmetric optimistic shape":
  //   - Claim flips Assignee immediately (toggle-with-flip-immediately)
  //   - Complete uses busy-flag-then-reload (remove-with-confirmation-from-engine)
  const [optimisticClaimed, setOptimisticClaimed] = React.useState<Map<string, string>>(new Map());
  const [optimisticComplete, setOptimisticComplete] = React.useState<Set<string>>(new Set());
  // Story 11.4: Delegate modal target. Per CLAUDE.md modal triggerRef
  // convention, the focus-restore target is the last-clicked row's
  // RowActionMenu trigger.
  const [delegateTarget, setDelegateTarget] = React.useState<FlowableTask | null>(null);
  const delegateTriggerRef = React.useRef<HTMLElement | null>(null);

  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/tasks/" });
  const openDetail = (id: string) => navigate({ to: "/tasks/$id", params: { id } });

  // Story 11.2 AC-1: optimistic claim with revert-on-failure.
  const handleClaim = async (t: TaskWide) => {
    if (!cfgUsername) {
      toast({
        kind: "warn",
        text: "No username configured",
        sub: "Set a username in Settings to claim tasks.",
        ttl: 6000,
      });
      return;
    }
    setOptimisticClaimed((m) => new Map(m).set(t.id, cfgUsername));
    try {
      await api.taskAction(t.id, "claim", { assignee: cfgUsername });
      toast({ kind: "ok", text: `Claimed: ${t.name || t.id}`, ttl: 3000 });
      await router.invalidate({ filter: (r) => r.routeId === "/tasks/" });
      window.dispatchEvent(new CustomEvent("nav:invalidate-counts"));
      setOptimisticClaimed((m) => {
        const copy = new Map(m);
        copy.delete(t.id);
        return copy;
      });
    } catch (err) {
      // Revert the optimistic flip — engine state unchanged.
      setOptimisticClaimed((m) => {
        const copy = new Map(m);
        copy.delete(t.id);
        return copy;
      });
      toast({
        kind: "err",
        text: "Claim failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    }
  };

  // Story 11.2 AC-2: busy-flag-then-reload. Engine is source of truth; reload
  // on both success and failure to converge the list.
  const handleComplete = async (t: TaskWide) => {
    setOptimisticComplete((s) => new Set(s).add(t.id));
    try {
      await api.taskAction(t.id, "complete");
      toast({ kind: "ok", text: `Completed: ${t.name || t.id}`, ttl: 3000 });
      await router.invalidate({ filter: (r) => r.routeId === "/tasks/" });
      window.dispatchEvent(new CustomEvent("nav:invalidate-counts"));
      setOptimisticComplete((s) => {
        const copy = new Set(s);
        copy.delete(t.id);
        return copy;
      });
    } catch (err) {
      setOptimisticComplete((s) => {
        const copy = new Set(s);
        copy.delete(t.id);
        return copy;
      });
      toast({
        kind: "err",
        text: "Complete failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
      // Engine may have completed the task in a parallel session — reload to
      // converge.
      void router.invalidate({ filter: (r) => r.routeId === "/tasks/" });
    }
  };

  // AC-6: one-shot warning toast when the operator selected "Mine" but has no
  // username configured. Keyed on [assignee, cfgUsername] so it fires exactly
  // once per route mount (not on every render).
  React.useEffect(() => {
    if (assignee === "me" && !cfgUsername) {
      toast({
        kind: "warn",
        text: "No username configured — showing all tasks.",
        sub: "Set a username in Settings to filter by 'Mine'.",
        ttl: 6000,
      });
    }
  }, [assignee, cfgUsername]);

  if (data.data.length === 0) {
    return (
      <PageChrome onRefresh={refresh} assignee={assignee} onFilterChange={onFilterChange}>
        {(() => {
          const entry = emptyStates.tasks;
          if (!entry) return null;
          return <EmptyState entry={entry} />;
        })()}
      </PageChrome>
    );
  }

  return (
    <PageChrome onRefresh={refresh} assignee={assignee} onFilterChange={onFilterChange}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Task name</th>
            <th>Assignee</th>
            <th>Process instance</th>
            <th>Due date</th>
            <th>Priority</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((raw) => {
            const t = raw as TaskWide;
            // Story 11.2 AC-3: effectiveAssignee folds the optimistic Map over
            // the engine value, so the column + visibility predicates flip
            // immediately on a claim while the API call settles.
            const effectiveAssignee = optimisticClaimed.get(t.id) ?? t.assignee ?? "";
            const isMine = !!effectiveAssignee && effectiveAssignee === cfgUsername;
            const isCompleting = optimisticComplete.has(t.id);
            // Per-row action menu items.
            //   Claim — only when unassigned (Story 11.2 real handler)
            //   Complete — always (Story 11.2 real handler; disabled while busy)
            //   Delegate… — always (forward-ref 11.4, still placeholder)
            //   Unclaim — only when effectiveAssignee === cfg.username (forward-ref 11.5, still placeholder)
            const items: RowActionItem[] = [
              !effectiveAssignee && {
                label: "Claim",
                onSelect: () => handleClaim(t),
              },
              {
                label: "Complete",
                disabled: isCompleting,
                onSelect: () => handleComplete(t),
              },
              {
                label: "Delegate…",
                onSelect: () => setDelegateTarget(t),
              },
              isMine && {
                label: "Unclaim",
                testId: "unclaim-task-placeholder",
                onSelect: () =>
                  toast({ kind: "info", text: "Unclaim arrives in Story 11.5", ttl: 4000 }),
              },
            ].filter(Boolean) as RowActionItem[];

            return (
              <tr
                key={t.id}
                data-task-id={t.id}
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => openDetail(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(t.id);
                }}
              >
                <td>
                  <b style={{ fontWeight: 500 }}>{t.name || t.id}</b>
                </td>
                <td className="mono">
                  {effectiveAssignee ? (
                    effectiveAssignee
                  ) : t.candidateGroup ? (
                    `group:${t.candidateGroup}`
                  ) : (
                    <span className="mute">unclaimed</span>
                  )}
                </td>
                <td className="mono">
                  {t.processInstanceId ? (
                    <Link
                      to="/instances/$id"
                      params={{ id: t.processInstanceId }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.processInstanceId}
                    </Link>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mono">
                  {t.dueDate ? (
                    <span className="badge" data-tone={dueTone(t.dueDate)}>
                      <span className="dot" />
                      {fmtDue(t.dueDate)}
                    </span>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mono">
                  <span className="badge" data-tone={priTone(t.priority)}>
                    {t.priority ?? 50}
                  </span>
                </td>
                <td
                  // Capture the actually-clicked row's RowActionMenu trigger
                  // for focus-restore on modal close (Story 11.4 / CLAUDE.md
                  // modal triggerRef convention).
                  onClickCapture={(e) => {
                    const target = e.target as HTMLElement | null;
                    const trigger = target?.closest(
                      '[data-testid="row-action-trigger"]',
                    ) as HTMLElement | null;
                    if (trigger) delegateTriggerRef.current = trigger;
                  }}
                >
                  {/* `items` is always ≥ 2 (Complete + Delegate are unconditional). */}
                  <RowActionMenu ariaLabel={`Actions for task ${t.name || t.id}`} items={items} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <DelegateTaskModal
        task={delegateTarget}
        triggerRef={delegateTriggerRef}
        onClose={() => setDelegateTarget(null)}
        onSubmitted={() => {
          setDelegateTarget(null);
          void router.invalidate({ filter: (r) => r.routeId === "/tasks/" });
        }}
      />
    </PageChrome>
  );
}
