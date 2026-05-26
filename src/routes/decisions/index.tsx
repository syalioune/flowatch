// SPDX-License-Identifier: Apache-2.0

/**
 * Decisions list route (Story 15.1) — tenth application of the Story 9.1
 * canonical list archetype with tab-aware loader dispatch (fifth consumer
 * of the inline tab-aware dispatch pattern after 12.1 / 13.1 / 13.3 / 14.1
 * / 14.2).
 *
 * Tabs: Decisions / Deployments — each tab dispatches via the URL
 * search-param to a different DMN-namespace endpoint (under dmnBase(),
 * NOT under /service per Pattern P-004). Forward-references:
 *   - 15.2 swapped the Deploy DMN placeholder + Delete DMN deployment row action
 *     for real modals + `router.invalidate()`-driven cross-tab reload.
 *   - 15.3 swaps the Test execute row action + detail-page button.
 *   - 15.4 extends loadDecisions(tab) with a third "executions" branch.
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { z } from "zod";
import { api, type FlowableDecision, type FlowableDeployment, type FlowablePage } from "../../api";
import { fmtTime, Icon, PageHead, toast } from "../../components";
import { DeleteDmnDeploymentModal } from "../../lib/delete-dmn-deployment-modal";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { ExecuteDecisionModal } from "../../lib/execute-decision-modal";
import { RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";
import { UploadDmnDeploymentModal } from "../../lib/upload-dmn-deployment-modal";

const decisionsSearch = z.object({
  tab: z.enum(["decisions", "deployments"]).optional().default("decisions"),
});

export type DecisionsTab = "decisions" | "deployments";

// Exported for unit testing of the tab-aware dispatch. Not re-used
// elsewhere — the route's `loader` slot is the only production caller.
export const loadDecisions = (
  tab: DecisionsTab,
): Promise<FlowablePage<FlowableDecision> | FlowablePage<FlowableDeployment>> => {
  if (tab === "decisions") return api.listDecisions({ size: 50 });
  return api.listDmnDeployments({ size: 50 });
};

export const Route = createFileRoute("/decisions/")({
  validateSearch: decisionsSearch,
  loaderDeps: ({ search: { tab } }) => ({ tab }),
  loader: ({ deps }) => loadDecisions(deps.tab),
  staticData: {
    title: "Decisions",
    endpoints: [
      { method: "GET", path: "/dmn-repository/decisions", desc: "List decisions (dmnBase)" },
      {
        method: "GET",
        path: "/dmn-repository/deployments",
        desc: "List DMN deployments (dmnBase)",
      },
      {
        method: "POST",
        path: "/dmn-repository/deployments",
        desc: "Deploy a DMN file (multipart, dmnBase)",
      },
      {
        method: "DELETE",
        path: "/dmn-repository/deployments/{id}",
        desc: "Delete a DMN deployment (dmnBase, cascade optional)",
      },
    ],
  },
  component: DecisionsRoute,
  pendingComponent: DecisionsPending,
  errorComponent: DecisionsError,
});

interface PageChromeProps {
  children: React.ReactNode;
  tab: DecisionsTab;
  onTabChange: (t: DecisionsTab) => void;
  actions?: React.ReactNode;
}

function PageChrome({ children, tab, onTabChange, actions }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Decisions"
        subtitle="DMN decision tables, decisions, and deployments."
        actions={actions}
      />
      <div className="seg-row" data-testid="decisions-tabs" style={{ padding: "0 0 12px 0" }}>
        <button
          type="button"
          className="seg-btn"
          data-on={tab === "decisions" ? "1" : "0"}
          onClick={() => onTabChange("decisions")}
        >
          Decisions
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={tab === "deployments" ? "1" : "0"}
          onClick={() => onTabChange("deployments")}
        >
          Deployments
        </button>
      </div>
      <div className="tbl-wrap">{children}</div>
    </div>
  );
}

function useTabNav() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/decisions/" });
  const onTabChange = (next: DecisionsTab) =>
    navigate({ search: (prev) => ({ ...prev, tab: next }) });
  return { tab: tab as DecisionsTab, onTabChange };
}

function DecisionsPending() {
  const { tab, onTabChange } = useTabNav();
  return (
    <PageChrome tab={tab} onTabChange={onTabChange}>
      <TableSkeleton columns={tab === "decisions" ? 5 : 4} rows={6} />
    </PageChrome>
  );
}

interface DecisionsErrorProps {
  error: Error;
  reset: () => void;
}

function DecisionsError({ error, reset }: DecisionsErrorProps) {
  const { tab, onTabChange } = useTabNav();
  return (
    <PageChrome tab={tab} onTabChange={onTabChange}>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  );
}

function DecisionsRoute() {
  const data = Route.useLoaderData();
  const { tab, onTabChange } = useTabNav();
  const router = useRouter();
  // Story 15.2: modal trigger refs for focus-restore per Story 10.2 AC-7.
  const uploadTriggerRef = React.useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = React.useRef<HTMLElement | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  // Story 15.3: execute decision modal target — null when closed.
  const executeTriggerRef = React.useRef<HTMLElement | null>(null);
  const [executeTarget, setExecuteTarget] = React.useState<FlowableDecision | null>(null);

  // After a successful Upload OR a Delete-settled, re-run the active
  // route's loader. The mental model: the operator stays on the same tab;
  // the data refreshes. Tab switches fire a fresh loader automatically.
  const refresh = () => {
    void router.invalidate({ filter: (r) => r.routeId === "/decisions/" });
  };

  const handleUploadSuccess = (deployment: FlowableDeployment) => {
    toast({
      kind: "ok",
      text: `Deployed DMN: ${deployment.name || deployment.id}`,
      sub: `id ${deployment.id}`,
      ttl: 3000,
    });
    refresh();
  };

  const modals = (
    <>
      <UploadDmnDeploymentModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        triggerRef={uploadTriggerRef}
      />
      <DeleteDmnDeploymentModal
        deploymentId={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSettled={refresh}
        triggerRef={deleteTriggerRef}
      />
      <ExecuteDecisionModal
        decision={executeTarget}
        onClose={() => setExecuteTarget(null)}
        triggerRef={executeTriggerRef}
      />
    </>
  );

  if (tab === "decisions") {
    return (
      <>
        <PageChrome tab={tab} onTabChange={onTabChange}>
          <DecisionsList
            page={data as FlowablePage<FlowableDecision>}
            onTestExecute={(d) => setExecuteTarget(d)}
            executeTriggerRef={executeTriggerRef}
          />
        </PageChrome>
        {modals}
      </>
    );
  }

  return (
    <>
      <PageChrome
        tab={tab}
        onTabChange={onTabChange}
        actions={
          <button
            ref={uploadTriggerRef}
            type="button"
            className="btn"
            data-testid="deploy-dmn"
            onClick={() => setUploadOpen(true)}
          >
            <Icon name="upload" size={12} />
            Deploy DMN
          </button>
        }
      >
        <DmnDeploymentsList
          page={data as FlowablePage<FlowableDeployment>}
          onDeleteClick={(id) => setDeleteTarget(id)}
          deleteTriggerRef={deleteTriggerRef}
        />
      </PageChrome>
      {modals}
    </>
  );
}

interface DecisionsListProps {
  page: FlowablePage<FlowableDecision>;
  onTestExecute: (d: FlowableDecision) => void;
  executeTriggerRef: React.MutableRefObject<HTMLElement | null>;
}

function DecisionsList({ page, onTestExecute, executeTriggerRef }: DecisionsListProps) {
  const navigate = useNavigate();
  const openDetail = (key: string) => navigate({ to: "/decisions/$key", params: { key } });

  if (page.data.length === 0) {
    const entry = emptyStates.decisions;
    return entry ? <EmptyState entry={entry} /> : null;
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Decision</th>
          <th>Key</th>
          <th>Version</th>
          <th>Category</th>
          <th>Tenant</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {page.data.map((d) => (
          <tr
            key={d.id}
            data-testid={`decision-row-${d.key}`}
            tabIndex={0}
            style={{ cursor: "pointer" }}
            onClick={() => openDetail(d.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter") openDetail(d.key);
            }}
          >
            <td>
              <b style={{ fontWeight: 500 }}>{d.name || d.key}</b>
            </td>
            <td className="mono mute">{d.key}</td>
            <td className="mono">{d.version}</td>
            <td>{d.category || <span className="mute">—</span>}</td>
            <td className="mono mute">{d.tenantId || <span className="mute">—</span>}</td>
            <td
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onClickCapture={(e) => {
                const target = e.target as HTMLElement | null;
                const trigger = target?.closest(
                  '[data-testid="row-action-trigger"]',
                ) as HTMLElement | null;
                if (trigger) executeTriggerRef.current = trigger;
              }}
            >
              <RowActionMenu
                ariaLabel={`Actions for decision ${d.name || d.key}`}
                items={[
                  {
                    label: "Test execute",
                    testId: "test-execute",
                    onSelect: () => onTestExecute(d),
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface DmnDeploymentsListProps {
  page: FlowablePage<FlowableDeployment>;
  onDeleteClick: (id: string) => void;
  deleteTriggerRef: React.MutableRefObject<HTMLElement | null>;
}

function DmnDeploymentsList({ page, onDeleteClick, deleteTriggerRef }: DmnDeploymentsListProps) {
  if (page.data.length === 0) {
    const entry = emptyStates.dmnDeployments;
    return entry ? <EmptyState entry={entry} /> : null;
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Deployment</th>
          <th>ID</th>
          <th>Deployed</th>
          <th>Tenant</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {page.data.map((dep) => (
          <tr key={dep.id} data-testid={`dmn-deployment-row-${dep.id}`}>
            <td>
              <b style={{ fontWeight: 500 }}>{dep.name || dep.id}</b>
            </td>
            <td className="mono mute">{dep.id}</td>
            <td className="mute mono">{fmtTime(dep.deploymentTime)}</td>
            <td className="mono mute">{dep.tenantId || <span className="mute">—</span>}</td>
            <td
              onClickCapture={(e) => {
                const target = e.target as HTMLElement | null;
                const trigger = target?.closest(
                  '[data-testid="row-action-trigger"]',
                ) as HTMLElement | null;
                if (trigger) deleteTriggerRef.current = trigger;
              }}
            >
              <RowActionMenu
                ariaLabel={`Actions for DMN deployment ${dep.name || dep.id}`}
                items={[
                  {
                    label: "Delete deployment",
                    danger: true,
                    testId: "delete-dmn-deployment",
                    onSelect: () => onDeleteClick(dep.id),
                  },
                ]}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
