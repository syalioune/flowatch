// SPDX-License-Identifier: Apache-2.0

/**
 * App definitions list route (Story 25.1) — canonical list archetype consumer
 * for FR-55 (scope-reduced). Browses the Flowable App API's read-only
 * /app-repository/app-definitions endpoint. App-runtime is unmounted in
 * flowable-rest:7.2.0 — the scope-reduction note documents this inline.
 */

import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import type React from "react";
import { z } from "zod";
import { api, type FlowableAppDefinition, type QueryParams } from "../../api";
import { fmtTime, Icon, PageHead } from "../../components";
import { EmptyState, getEmptyState } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { TableSkeleton } from "../../lib/table-skeleton";

// `z.coerce.boolean()` treats ANY non-empty string as true (e.g.
// "?latest=false" → true). Use an explicit transform so the URL string
// "false" round-trips to the boolean `false`.
const boolish = z
  .union([z.boolean(), z.literal("true"), z.literal("false")])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"));

const appDefsSearch = z.object({
  key: z.string().optional(),
  tenantId: z.string().optional(),
  latest: boolish.optional().default(true),
});

export type AppDefsSearch = z.infer<typeof appDefsSearch>;

// Exported for unit testing of param mapping. Not re-used elsewhere.
export const loadAppDefinitions = (params: AppDefsSearch) => {
  const q: QueryParams = { size: 50 };
  if (params.key) q.key = params.key;
  if (params.tenantId) q.tenantId = params.tenantId;
  if (params.latest) q.latest = true;
  return api.listAppDefinitions(q);
};

export const Route = createFileRoute("/app-definitions/")({
  validateSearch: appDefsSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadAppDefinitions(deps),
  staticData: {
    title: "App definitions",
    endpoints: [
      {
        method: "GET",
        path: "/app-repository/app-definitions",
        desc: "List app definitions (appBase)",
      },
      {
        method: "POST",
        path: "/repository/deployments",
        desc: "Upload .bar / .zip multi-artefact archive",
      },
    ],
  },
  component: AppDefinitionsRoute,
  pendingComponent: AppDefinitionsPending,
  errorComponent: AppDefinitionsError,
});

interface PageChromeProps {
  children: React.ReactNode;
  onRefresh?: () => void;
}

function PageChrome({ children, onRefresh }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="App definitions"
        subtitle="Flowable App archives (.bar) deployed to this engine."
        actions={
          <button type="button" className="btn" onClick={onRefresh} disabled={!onRefresh}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div
        className="mute"
        style={{ padding: "8px 0", fontSize: 12 }}
        data-testid="app-runtime-scope-note"
      >
        App-instances (running app sessions) are not exposed in this engine image — see compat.md
        FR-55.
      </div>
      {children}
    </div>
  );
}

function AppDefinitionsPending() {
  return (
    <PageChrome>
      <TableSkeleton columns={6} rows={6} />
    </PageChrome>
  );
}

function AppDefinitionsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <PageChrome>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  );
}

function AppDefinitionsRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate({ from: "/app-definitions/" });

  const refresh = () => router.invalidate();

  const setKey = (next: string) =>
    navigate({ search: (prev) => ({ ...prev, key: next || undefined }) });
  const setTenantId = (next: string) =>
    navigate({ search: (prev) => ({ ...prev, tenantId: next || undefined }) });
  const toggleLatest = (next: boolean) =>
    navigate({ search: (prev) => ({ ...prev, latest: next }) });

  const rows: FlowableAppDefinition[] = data?.data ?? [];

  return (
    <PageChrome onRefresh={refresh}>
      <div
        className="filter-strip"
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          padding: "8px 0 12px 0",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          aria-label="Filter by key"
          data-testid="app-definitions-key-filter"
          placeholder="Key"
          defaultValue={search.key ?? ""}
          onBlur={(e) => setKey(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setKey((e.target as HTMLInputElement).value);
          }}
          style={{ width: 200 }}
        />
        <input
          type="text"
          aria-label="Filter by tenant ID"
          data-testid="app-definitions-tenant-id-filter"
          placeholder="Tenant ID"
          defaultValue={search.tenantId ?? ""}
          onBlur={(e) => setTenantId(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setTenantId((e.target as HTMLInputElement).value);
          }}
          style={{ width: 200 }}
        />
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--fg)",
          }}
        >
          <input
            // `key` forces remount when URL state changes — keeps the
            // checkbox in sync with the validated search.latest without
            // becoming a fully-controlled input (which Playwright's
            // `uncheck()` can't transition because the controlled
            // `checked` re-asserts before the test reads the next state).
            key={`latest-${search.latest === true ? "on" : "off"}`}
            type="checkbox"
            data-testid="app-definitions-latest-filter"
            defaultChecked={search.latest === true}
            onChange={(e) => toggleLatest(e.currentTarget.checked)}
          />
          Latest version only
        </label>
      </div>
      <div className="tbl-wrap">
        {rows.length === 0 ? (
          <EmptyState entry={getEmptyState("appDefinitions")} />
        ) : (
          <table className="tbl" data-testid="app-definitions-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Key</th>
                <th scope="col">Version</th>
                <th scope="col">Deployment</th>
                <th scope="col">Tenant</th>
                <th scope="col">Deployed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr
                  key={a.id}
                  data-testid={`app-definition-row-${a.id}`}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate({ to: "/app-definitions/$id", params: { id: a.id } })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      navigate({ to: "/app-definitions/$id", params: { id: a.id } });
                  }}
                >
                  <td>
                    <b style={{ fontWeight: 500 }}>{a.name || "—"}</b>
                  </td>
                  <td className="mono">{a.key || "—"}</td>
                  <td className="mono">{a.version !== undefined ? `v${a.version}` : "—"}</td>
                  <td className="mono">
                    {a.deploymentId ? (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Link to="/app-definitions/$id" params={{ id: a.id }}>
                          {a.deploymentId}
                        </Link>
                      </span>
                    ) : (
                      <span className="mute">—</span>
                    )}
                  </td>
                  <td className="mono mute">{a.tenantId || "—"}</td>
                  <td className="mono mute">{fmtTime(a.deploymentTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageChrome>
  );
}
