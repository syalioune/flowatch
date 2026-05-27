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

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { z } from "zod";
import {
  api,
  type FlowableDecision,
  type FlowableDeployment,
  type FlowableDmnRuleExecution,
  type FlowableHistoricDecisionExecution,
  type FlowablePage,
} from "../../api";
import { fmtMs, fmtTime, Icon, PageHead, toast } from "../../components";
import { DeleteDmnDeploymentModal } from "../../lib/delete-dmn-deployment-modal";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { ExecuteDecisionModal } from "../../lib/execute-decision-modal";
import { RowActionMenu } from "../../lib/row-action-menu";
import { TableSkeleton } from "../../lib/table-skeleton";
import { UploadDmnDeploymentModal } from "../../lib/upload-dmn-deployment-modal";
import { useApi } from "../../lib/useApi";

const decisionsSearch = z.object({
  // Deployments is the FIRST tab AND the default — operators think
  // "deployment → decisions inside it" rather than "decision → which
  // deployment is it from." Tab order mirrors that mental model.
  tab: z.enum(["deployments", "decisions", "executions"]).optional().default("deployments"),
});

export type DecisionsTab = "deployments" | "decisions" | "executions";

// Exported for unit testing of the tab-aware dispatch. Not re-used
// elsewhere — the route's `loader` slot is the only production caller.
// Story 15.4 extended this from 2 to 3 branches (added "executions").
export const loadDecisions = (
  tab: DecisionsTab,
): Promise<
  | FlowablePage<FlowableDecision>
  | FlowablePage<FlowableDeployment>
  | FlowablePage<FlowableHistoricDecisionExecution>
> => {
  if (tab === "decisions") return api.listDecisions({ size: 50 });
  if (tab === "deployments") return api.listDmnDeployments({ size: 50 });
  return api.listDmnHistoryExecutions({ size: 50, sort: "startTime", order: "desc" });
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
      {
        method: "GET",
        path: "/dmn-history/historic-decision-executions",
        desc: "List historic decision executions (sorted by startTime desc)",
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
          data-on={tab === "deployments" ? "1" : "0"}
          onClick={() => onTabChange("deployments")}
        >
          Deployments
        </button>
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
          data-on={tab === "executions" ? "1" : "0"}
          onClick={() => onTabChange("executions")}
        >
          Executions
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
  const cols = tab === "decisions" ? 5 : tab === "deployments" ? 4 : 5;
  return (
    <PageChrome tab={tab} onTabChange={onTabChange}>
      <TableSkeleton columns={cols} rows={6} />
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

  if (tab === "executions") {
    return (
      <>
        <PageChrome tab={tab} onTabChange={onTabChange}>
          <DmnExecutionsList page={data as FlowablePage<FlowableHistoricDecisionExecution>} />
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
          <th scope="col">Decision</th>
          <th scope="col">Key</th>
          <th scope="col">Version</th>
          <th scope="col">Category</th>
          <th scope="col">Tenant</th>
          <th scope="col" />
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
  const navigate = useNavigate();
  // Mirrors the /deployments page: a DMN deployment row navigates to the
  // detail route with ?kind=dmn so the loader hits the right sub-app.
  const openDetail = (id: string) =>
    navigate({ to: "/deployments/$id", params: { id }, search: { kind: "dmn" as const } });

  if (page.data.length === 0) {
    const entry = emptyStates.dmnDeployments;
    return entry ? <EmptyState entry={entry} /> : null;
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th scope="col">Deployment</th>
          <th scope="col">ID</th>
          <th scope="col">Deployed</th>
          <th scope="col">Tenant</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {page.data.map((dep) => (
          <tr
            key={dep.id}
            data-testid={`dmn-deployment-row-${dep.id}`}
            tabIndex={0}
            style={{ cursor: "pointer" }}
            onClick={() => openDetail(dep.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") openDetail(dep.id);
            }}
          >
            <td>
              <b style={{ fontWeight: 500 }}>{dep.name || dep.id}</b>
            </td>
            <td className="mono mute">{dep.id}</td>
            <td className="mute mono">{fmtTime(dep.deploymentTime)}</td>
            <td className="mono mute">{dep.tenantId || <span className="mute">—</span>}</td>
            <td
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
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

// Hit-policy → tone mapping for the badge in the audit panel.
function hitPolicyTone(policy?: string): "ok" | "neutral" | "warn" | "mute" {
  if (!policy) return "mute";
  const upper = policy.toUpperCase();
  if (upper === "UNIQUE" || upper === "FIRST" || upper === "ANY") return "ok";
  if (upper === "COLLECT") return "warn";
  if (upper === "RULE ORDER" || upper === "OUTPUT ORDER" || upper === "PRIORITY") {
    return "neutral";
  }
  return "mute";
}

// Compute duration in ms from start/end ISO timestamps. Returns undefined
// when either bound is missing or invalid — the renderer shows "—".
function computeDurationMs(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return b - a;
}

interface DmnExecutionsListProps {
  page: FlowablePage<FlowableHistoricDecisionExecution>;
}

export function DmnExecutionsList({ page }: DmnExecutionsListProps) {
  // Row-expand-for-detail pattern. Single string holds the currently-
  // expanded id; clicking another row collapses the previous.
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  if (page.data.length === 0) {
    const entry = emptyStates.dmnExecutions;
    return entry ? <EmptyState entry={entry} /> : null;
  }

  return (
    <table className="tbl">
      <thead>
        <tr>
          <th scope="col">Decision</th>
          <th scope="col">Process instance</th>
          <th scope="col">Started</th>
          <th scope="col">Duration</th>
          <th scope="col">Status</th>
          <th scope="col" />
        </tr>
      </thead>
      <tbody>
        {page.data.map((e) => {
          const isOpen = expandedId === e.id;
          const durationMs = computeDurationMs(e.startTime, e.endTime);
          const instanceId = e.instanceId;
          return (
            <React.Fragment key={e.id}>
              <tr
                data-testid={`execution-row-${e.id}`}
                tabIndex={0}
                style={{ cursor: "pointer" }}
                onClick={() => setExpandedId((prev) => (prev === e.id ? null : e.id))}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    setExpandedId((prev) => (prev === e.id ? null : e.id));
                  }
                }}
              >
                <td>
                  <b style={{ fontWeight: 500 }}>{e.decisionName || e.decisionKey || e.id}</b>
                </td>
                <td className="mono">
                  {instanceId ? (
                    <Link
                      to="/instances/$id"
                      params={{ id: instanceId }}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {instanceId}
                    </Link>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mute mono">{fmtTime(e.startTime)}</td>
                <td className="mono">{fmtMs(durationMs)}</td>
                <td>
                  <span className="badge" data-tone={e.failed ? "bad" : "ok"}>
                    <span className="sr-only">Status: </span>
                    {e.failed ? "failed" : "ok"}
                  </span>
                </td>
                <td style={{ width: 24, textAlign: "right" }}>
                  <Icon name="chevron" size={12} />
                </td>
              </tr>
              {isOpen && (
                <tr data-testid={`execution-detail-${e.id}`}>
                  <td colSpan={6} style={{ padding: "16px 20px", background: "var(--bg-sunken)" }}>
                    <DmnExecutionAuditPanel executionId={e.id} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Audit panel for the executions row-expand ───────────────────────────
// Fetches the per-execution auditdata lazily (only when the row expands).
// Surfaces hit policy, decision version, multipleResults / strictMode
// flags, typed input + result maps, and the per-rule trace (which rule
// fired, condition+conclusion results) — none of which are available on
// the list endpoint.
function DmnExecutionAuditPanel({ executionId }: { executionId: string }) {
  const audit = useApi(() => api.getDmnHistoryAuditdata(executionId), [executionId]);

  if (audit.loading) {
    return (
      <div className="empty" style={{ padding: 20 }}>
        Loading audit data…
      </div>
    );
  }
  if (audit.error) {
    return <ErrorBox error={audit.error} onRetry={audit.reload} />;
  }
  if (!audit.data) {
    return (
      <div className="empty" style={{ padding: 20 }}>
        No audit data.
      </div>
    );
  }

  const a = audit.data;
  const inputs: Record<string, unknown> = a.inputVariables ?? {};
  const inputTypes: Record<string, string> = a.inputVariableTypes ?? {};
  const resultTypes: Record<string, string> = a.decisionResultTypes ?? {};
  const decisionResultRows: Array<Record<string, unknown>> = a.decisionResult ?? [];
  const rules: Record<string, FlowableDmnRuleExecution> = a.ruleExecutions ?? {};
  const ruleEntries: Array<[string, FlowableDmnRuleExecution]> = Object.entries(rules).sort(
    ([x], [y]) => Number(x) - Number(y),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Meta strip — hit policy + flags + decision version. */}
      <div
        data-testid={`execution-audit-meta-${executionId}`}
        style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}
      >
        {a.hitPolicy && (
          <span>
            <span className="mute" style={{ fontSize: 11, marginRight: 6 }}>
              Hit policy:
            </span>
            <span className="badge" data-tone={hitPolicyTone(a.hitPolicy)}>
              <span className="sr-only">Hit policy: </span>
              {a.hitPolicy}
            </span>
          </span>
        )}
        {a.decisionVersion !== undefined && (
          <span>
            <span className="mute" style={{ fontSize: 11, marginRight: 6 }}>
              Version:
            </span>
            <span className="mono">v{a.decisionVersion}</span>
          </span>
        )}
        {a.multipleResults !== undefined && (
          <span>
            <span className="mute" style={{ fontSize: 11, marginRight: 6 }}>
              Multiple results:
            </span>
            <span className="mono">{a.multipleResults ? "yes" : "no"}</span>
          </span>
        )}
        {a.strictMode !== undefined && (
          <span>
            <span className="mute" style={{ fontSize: 11, marginRight: 6 }}>
              Strict mode:
            </span>
            <span className="mono">{a.strictMode ? "on" : "off"}</span>
          </span>
        )}
        {a.failed && (
          <span className="badge" data-tone="bad">
            <span className="sr-only">Status: </span>
            failed
          </span>
        )}
      </div>

      {/* Typed input table */}
      <div data-testid={`execution-audit-inputs-${executionId}`}>
        <div className="panel-title" style={{ marginBottom: 6 }}>
          Input variables · {Object.keys(inputs).length}
        </div>
        {Object.keys(inputs).length === 0 ? (
          <div className="empty" style={{ padding: 12 }}>
            (none)
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(inputs).map(([name, value]) => (
                <tr key={name}>
                  <td className="mono">{name}</td>
                  <td>
                    <span className="badge" data-tone="neutral">
                      <span className="sr-only">Variable type: </span>
                      {inputTypes[name] ?? "—"}
                    </span>
                  </td>
                  <td className="mono">{formatAuditValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Typed result table — one row group per result row (COLLECT etc.) */}
      <div data-testid={`execution-audit-results-${executionId}`}>
        <div className="panel-title" style={{ marginBottom: 6 }}>
          Decision result · {decisionResultRows.length} row
          {decisionResultRows.length === 1 ? "" : "s"}
        </div>
        {decisionResultRows.length === 0 ? (
          <div className="empty" style={{ padding: 12 }}>
            No matching rule fired — the decision produced no result rows.
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                {decisionResultRows.length > 1 && <th scope="col">Row</th>}
                <th scope="col">Name</th>
                <th scope="col">Type</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {decisionResultRows.flatMap((row, rowIdx) =>
                Object.entries(row).map(([name, value]) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: COLLECT can repeat names across rows; composite row+name is the minimum unique key
                  <tr key={`r${rowIdx}-${name}`}>
                    {decisionResultRows.length > 1 && <td className="mono mute">#{rowIdx + 1}</td>}
                    <td className="mono">{name}</td>
                    <td>
                      <span className="badge" data-tone="neutral">
                        <span className="sr-only">Result type: </span>
                        {resultTypes[name] ?? "—"}
                      </span>
                    </td>
                    <td className="mono">{formatAuditValue(value)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Per-rule trace — which rule fired, condition + conclusion results */}
      {ruleEntries.length > 0 && (
        <div data-testid={`execution-audit-rules-${executionId}`}>
          <div className="panel-title" style={{ marginBottom: 6 }}>
            Rule executions · {ruleEntries.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ruleEntries.map(([ruleNum, rule]) => (
              <div
                key={ruleNum}
                data-testid={`execution-audit-rule-${executionId}-${ruleNum}`}
                style={{
                  border: "1px solid var(--bd)",
                  borderRadius: 4,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginBottom: 8,
                    fontSize: 12,
                  }}
                >
                  <span>
                    <span className="mute" style={{ marginRight: 6 }}>
                      Rule
                    </span>
                    <b className="mono">#{ruleNum}</b>
                  </span>
                  <span className="badge" data-tone={rule.valid ? "ok" : "mute"}>
                    <span className="sr-only">Status: </span>
                    {rule.valid ? "matched" : "skipped"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <RuleResultList title="Conditions" results={rule.conditionResults} />
                  <RuleResultList title="Conclusions" results={rule.conclusionResults} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleResultList({
  title,
  results,
}: {
  title: string;
  results: Array<{ id?: string; result?: unknown }> | undefined;
}) {
  if (!results || results.length === 0) {
    return (
      <div style={{ minWidth: 200 }}>
        <div className="mute" style={{ fontSize: 11, marginBottom: 4 }}>
          {title}
        </div>
        <div className="mute" style={{ fontSize: 12 }}>
          —
        </div>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 220 }}>
      <div className="mute" style={{ fontSize: 11, marginBottom: 4 }}>
        {title}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          fontSize: 12,
        }}
      >
        {results.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rule-result entries are tied to a stable cell order; index is the canonical key
          <li key={`${r.id ?? "row"}-${i}`} style={{ display: "flex", gap: 8 }}>
            <span className="mono mute">{r.id ?? "—"}</span>
            <span className="mono">{formatAuditValue(r.result)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable]";
    }
  }
  return String(value);
}
