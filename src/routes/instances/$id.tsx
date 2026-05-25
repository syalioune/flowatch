// SPDX-License-Identifier: Apache-2.0

/**
 * Process instance detail route (Story 13.1 restructure — R-1 dual-fetch
 * sibling pattern, time-spanning detail page).
 *
 * Before 13.1 the route's loader did `api.getProcessInstance(id)` which
 * 404'd the entire page for any ended instance — operators couldn't open
 * a historic instance from a history list without context-switching to a
 * different URL. Per Epic 12 retro R-1 (codified in CLAUDE.md), the route
 * is now a thin shell mounting two sibling panels. Each panel owns its
 * own useApi, four-state contract, and 404 → empty-state probe. The
 * operator sees runtime details when the instance is alive AND historic
 * record when it has ended — both on the same URL.
 *
 * Parent-level state-gating fetches are an acceptable duplication per
 * CLAUDE.md; both panels show up as separate entries in the Inspector by
 * design.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHead } from "../../components";
import { InstanceHistoricActivitiesPanel } from "../../components/InstanceHistoricActivitiesPanel";
import { InstanceHistoricPanel } from "../../components/InstanceHistoricPanel";
import { InstanceRuntimePanel } from "../../components/InstanceRuntimePanel";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/instances/$id")({
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
        path: "/history/historic-activity-instances",
        desc: "Audit trail (per instance)",
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
  return (
    <div className="page">
      <PageHead title={id} subtitle="Process instance" />
      <InstanceRuntimePanel instanceId={id} />
      <InstanceHistoricPanel instanceId={id} />
      <InstanceHistoricActivitiesPanel instanceId={id} />
    </div>
  );
}
