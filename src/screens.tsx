// SPDX-License-Identifier: Apache-2.0
// size-exempt: pending split into per-screen modules per NFR-21 (deferred refactor; tracked as a separate story).

import { Icon, PageHead } from "./components";
import { ErrorBox } from "./lib/error-box";

// Re-export ErrorBox at the original public path so tests that imported it
// from "../../screens" (Story 2.2) continue to compile.
export { ErrorBox };

interface TenantsScreenProps {
  tenants?: { id: string; name: string }[];
}

// Dashboard moved to src/routes/index.tsx (Story 7.4): four
// Promise.allSettled KPI tiles with per-tile state handling per NFR-6.
// The previous rich Dashboard (tables + panels) is intentionally gone:
// the page is now "tile-shaped, not list-shaped".

// ── Deployments — moved to src/routes/deployments/index.tsx (Story 9.1) ──
// Canonical list archetype now lives in the route file. EmptyState / TableSkeleton
// / RowActionMenu in src/lib/ are reusable primitives every list screen will copy.

// ── Process Definitions — moved to src/routes/definitions/index.tsx (Story 9.4) ──
// Canonical list archetype (loader + four-state + RowActionMenu). The previous
// inline Start Instance modal is deferred to Story 10.2; 9.4 ships a placeholder
// menu item that toasts a forward-reference until 10.2 lands.

// ── Process Instances — moved to src/routes/instances/index.tsx (Story 10.1) ──
// Canonical list archetype (loader + four-state). The Cancel menu item is a
// placeholder forward-referencing Story 10.3.

// ── Jobs — moved to src/routes/jobs/index.tsx (Story 12.1) ────────
// Canonical list archetype (loader + four-state + RowActionMenu) with the
// URL-driven `<seg-row>` selecting between three different management
// endpoints. Three placeholder row actions forward-reference Stories 12.2
// (Execute now), 12.3 (Move to executable), 12.4 (View stacktrace).

// ── Tasks — moved to src/routes/tasks/index.tsx (Story 11.1) ──────
// Canonical list archetype (loader + four-state + RowActionMenu) with the
// first in-page search-param-driven filter `<seg-row>` and four placeholder
// row actions forward-referencing Stories 11.2 / 11.4 / 11.5.

// ── History — moved to src/routes/history/index.tsx (Stories 13.1 + 13.3) ──
// Canonical list archetype with multi-endpoint loader dispatch. The per-
// instance audit trail lives in <InstanceHistoricActivitiesPanel> on
// /instances/$id (Story 13.2). The legacy <History> + <HistoryFlatTable>
// block was removed in the Story 13.3 follow-up refactor commit.

// ── Identity — moved to src/routes/identity/index.tsx (Stories 14.1 + 14.2) ──
// Canonical list archetype with tab-aware loader dispatch (users / groups).
// The per-group members panel lives in <GroupMembersPanel> on
// /identity/groups/$id (Story 14.2). The legacy <Identity> + <LegacyIdentityShim>
// block was removed in the Story 14.2 follow-up refactor commit.

// ── Tenants ─────────────────────────────────────────────────────
export const Tenants = ({ tenants }: TenantsScreenProps) => {
  return (
    <div className="page">
      <PageHead
        title="Tenants"
        subtitle="Logical isolation boundaries derived from deployment tenantIds (Flowable REST 7.2 has no /identity/tenants endpoint)."
      />
      {(tenants || []).length === 0 && (
        <div className="empty" style={{ padding: 30 }}>
          No tenant-scoped resources found. Deploy a process with a{" "}
          <span className="mono">tenantId</span> to populate this view.
        </div>
      )}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {(tenants || []).map((t) => (
          <div key={t.id} className="kpi" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Icon name="tenant" size={16} />
              <div style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</div>
              <span className="mono mute" style={{ marginLeft: "auto", fontSize: 11 }}>
                {t.id}
              </span>
            </div>
            <div className="text-xs mute">
              Set this as your active tenant from the topbar; subsequent reads will filter to it.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
