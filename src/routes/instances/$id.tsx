// SPDX-License-Identifier: Apache-2.0

/**
 * Process instance detail route (Story 13.1 dual-fetch sibling pattern,
 * Story 26.x diagram + overlay, polish iteration: tabbed organisation).
 *
 * Pre-Story 26 polish: all panels were stacked siblings — runtime + historic
 * + audit-activities + diagram — which scrolled past one screen on most
 * instances and made the diagram (the visual anchor) feel buried below
 * textual data. The tabbed reorg keeps the dual-fetch sibling pattern (each
 * panel still owns its own useApi, four-state contract, refresh affordance)
 * but groups the textual panels behind a `?tab=runtime|history|audit`
 * search-param so operators can switch perspectives without scrolling.
 *
 * The diagram panel (Story 26.1+26.2) renders ABOVE the active tab content
 * for the Runtime and History tabs — it's the at-a-glance "where in the
 * flow is this?" surface for both alive and ended instances. The Audit
 * tab hides the diagram (the activity audit trail is timeline-shaped,
 * not shape-shaped — the two perspectives don't overlap). Diagram stays
 * MOUNTED in the DOM and is hidden via CSS when Audit is active — avoids
 * the ~150ms bpmn-js NavigatedViewer remount cost when toggling tabs.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Icon, PageHead } from "../../components";
import { InstanceDiagramPanel } from "../../components/InstanceDiagramPanel";
import { InstanceHistoricActivitiesPanel } from "../../components/InstanceHistoricActivitiesPanel";
import { InstanceHistoricPanel } from "../../components/InstanceHistoricPanel";
import { InstanceRuntimePanel } from "../../components/InstanceRuntimePanel";
import { ErrorBox } from "../../lib/error-box";

// `tab` is truly optional in the schema (no zod `.default()`) so TanStack
// Router doesn't append `?tab=runtime` to URLs that omit the parameter.
// The component resolves the default to "runtime" — preserves clean URLs
// for incoming navigations from /instances list, history list, start-instance
// modal, etc. that previously expected `/instances/{id}` without query.
const instanceDetailSearch = z.object({
  tab: z.enum(["runtime", "history", "audit"]).optional(),
});

export type InstanceDetailTab = "runtime" | "history" | "audit";

export const Route = createFileRoute("/instances/$id")({
  validateSearch: instanceDetailSearch,
  staticData: {
    title: "Process instance detail",
    endpoints: [
      { method: "GET", path: "/runtime/process-instances/{id}", desc: "Get runtime instance" },
      {
        method: "GET",
        path: "/runtime/process-instances/{id}/variables",
        desc: "Runtime variables",
      },
      {
        method: "GET",
        path: "/history/historic-process-instances/{id}",
        desc: "Get historic record",
      },
      {
        method: "GET",
        path: "/history/historic-variable-instances",
        desc: "Historic variables (per instance)",
      },
      {
        method: "GET",
        path: "/history/historic-activity-instances?finished=false",
        desc: "Active activities",
      },
      {
        method: "GET",
        path: "/history/historic-activity-instances",
        desc: "Audit trail (per instance)",
      },
      {
        method: "GET",
        path: "/repository/process-definitions/{id}/resourcedata",
        desc: "Process diagram XML",
      },
      { method: "DELETE", path: "/runtime/process-instances/{id}", desc: "Cancel" },
    ],
  },
  component: ProcessInstanceDetailRoute,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/instances" className="btn">
          Back to process instances
        </Link>
      </div>
    </div>
  ),
});

function ProcessInstanceDetailRoute() {
  const { id } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const navigate = useNavigate();
  const tab: InstanceDetailTab = tabParam ?? "runtime";

  const setTab = (next: InstanceDetailTab) => {
    navigate({
      to: "/instances/$id",
      params: { id },
      // Omit the param entirely when switching to the default tab so the URL
      // stays clean (`/instances/{id}` rather than `/instances/{id}?tab=runtime`).
      search: next === "runtime" ? {} : { tab: next },
      replace: true,
    });
  };

  // Diagram is always mounted to keep the bpmn-js viewer alive across tab
  // switches; CSS-hidden when the Audit tab is active.
  const diagramHidden = tab === "audit";

  return (
    <div className="page">
      <PageHead title={id} subtitle="Process instance" />
      <div className="seg-row" data-testid="instance-detail-tabs" style={{ padding: "0 0 16px 0" }}>
        <button
          type="button"
          className="seg-btn"
          data-on={tab === "runtime" ? "1" : "0"}
          data-testid="instance-tab-runtime"
          onClick={() => setTab("runtime")}
        >
          <Icon name="play" size={13} />
          Runtime
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={tab === "history" ? "1" : "0"}
          data-testid="instance-tab-history"
          onClick={() => setTab("history")}
        >
          <Icon name="history" size={13} />
          History
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={tab === "audit" ? "1" : "0"}
          data-testid="instance-tab-audit"
          onClick={() => setTab("audit")}
        >
          <Icon name="task" size={13} />
          Audit
        </button>
      </div>
      <div
        data-testid="instance-diagram-slot"
        style={diagramHidden ? { display: "none" } : undefined}
      >
        <InstanceDiagramPanel instanceId={id} />
      </div>
      {tab === "runtime" && (
        <div data-testid="instance-tabpanel-runtime">
          <InstanceRuntimePanel instanceId={id} />
        </div>
      )}
      {tab === "history" && (
        <div data-testid="instance-tabpanel-history">
          <InstanceHistoricPanel instanceId={id} />
        </div>
      )}
      {tab === "audit" && (
        <div data-testid="instance-tabpanel-audit">
          <InstanceHistoricActivitiesPanel instanceId={id} />
        </div>
      )}
    </div>
  );
}
