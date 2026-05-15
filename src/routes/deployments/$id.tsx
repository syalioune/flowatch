// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../api";
import { DeploymentDetail } from "../../components/DeploymentDetail";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/deployments/$id")({
  loader: ({ params }) => api.getDeployment(params.id),
  staticData: {
    title: "Deployment detail",
    endpoints: [
      { method: "GET", path: "/repository/deployments", desc: "List deployments" },
      { method: "GET", path: "/repository/deployments/{deploymentId}", desc: "Get deployment" },
      { method: "DELETE", path: "/repository/deployments/{deploymentId}", desc: "Remove" },
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
  return <DeploymentDetail deployment={deployment} />;
}
