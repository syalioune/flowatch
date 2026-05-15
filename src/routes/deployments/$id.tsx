import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../api";
import { DeploymentDetail } from "../../components/DeploymentDetail";
import { ErrorBox } from "../../lib/error-box";
import { openInspector } from "../../lib/nav";

export const Route = createFileRoute("/deployments/$id")({
  loader: ({ params }) => api.getDeployment(params.id),
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
  return <DeploymentDetail deployment={deployment} onOpenInspector={openInspector} />;
}
