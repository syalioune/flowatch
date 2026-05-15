import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../api";
import { ProcessInstanceDetail } from "../../components/ProcessInstanceDetail";
import { ErrorBox } from "../../lib/error-box";
import { openInspector } from "../../lib/nav";

export const Route = createFileRoute("/instances/$id")({
  loader: ({ params }) => api.getProcessInstance(params.id),
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
  pendingComponent: () => (
    <div className="page">
      <div className="empty" style={{ padding: 24 }}>
        Loading…
      </div>
    </div>
  ),
});

function ProcessInstanceDetailRoute() {
  const instance = Route.useLoaderData();
  return <ProcessInstanceDetail instance={instance} onOpenInspector={openInspector} />;
}
