// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "../../api";
import { DeploymentDetail } from "../../components/DeploymentDetail";
import { ErrorBox } from "../../lib/error-box";

// The deployments list merges BPMN + DMN rows (each tagged with `kind`).
// DMN rows navigate here with `?kind=dmn` so the loader hits the right
// sub-app — without it, the engine 404s for DMN ids on the BPMN namespace.
// Default to "bpmn" so deep-link URLs from before the merge still resolve.
const detailSearch = z.object({
  kind: z.enum(["bpmn", "dmn"]).optional().default("bpmn"),
});

export type DeploymentKind = "bpmn" | "dmn";

export const Route = createFileRoute("/deployments/$id")({
  validateSearch: detailSearch,
  loaderDeps: ({ search: { kind } }) => ({ kind }),
  loader: ({ params, deps }) =>
    deps.kind === "dmn" ? api.getDmnDeployment(params.id) : api.getDeployment(params.id),
  staticData: {
    title: "Deployment detail",
    endpoints: [
      {
        method: "GET",
        path: "/repository/deployments/{deploymentId}",
        desc: "Get BPMN deployment",
      },
      {
        method: "GET",
        path: "/dmn-repository/deployments/{deploymentId}",
        desc: "Get DMN deployment (dmnBase)",
      },
      { method: "DELETE", path: "/repository/deployments/{deploymentId}", desc: "Remove BPMN" },
      {
        method: "DELETE",
        path: "/dmn-repository/deployments/{deploymentId}",
        desc: "Remove DMN (dmnBase)",
      },
    ],
  },
  component: DeploymentDetailRoute,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/deployments" className="btn">
          Back to deployments
        </Link>
      </div>
    </div>
  ),
  pendingComponent: () => (
    <div className="page">
      <div className="empty" style={{ padding: 24 }}>
        Loading…
      </div>
    </div>
  ),
});

function DeploymentDetailRoute() {
  const deployment = Route.useLoaderData();
  const { kind } = Route.useSearch();
  return <DeploymentDetail deployment={deployment} kind={kind} />;
}
