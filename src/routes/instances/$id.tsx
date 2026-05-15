// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../api";
import { ProcessInstanceDetail } from "../../components/ProcessInstanceDetail";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/instances/$id")({
  loader: ({ params }) => api.getProcessInstance(params.id),
  staticData: {
    title: "Process instance detail",
    endpoints: [
      { method: "GET", path: "/runtime/process-instances/{id}", desc: "Get instance" },
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
  return <ProcessInstanceDetail instance={instance} />;
}
