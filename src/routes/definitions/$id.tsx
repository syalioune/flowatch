// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { api } from "../../api";
import { ProcessDefinitionDetail } from "../../components/ProcessDefinitionDetail";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/definitions/$id")({
  // Story 20.1: use getProcessDefinitionFresh so the detail page reflects
  // post-edit `category` values. The single-GET endpoint returns a
  // BPMN-cached value that ignores PUT updates — see RC-16.
  loader: ({ params }) => api.getProcessDefinitionFresh(params.id),
  staticData: {
    title: "Process definition detail",
    endpoints: [
      { method: "GET", path: "/repository/process-definitions", desc: "List process definitions" },
      { method: "PUT", path: "/repository/process-definitions/{id}", desc: "Suspend / activate" },
      {
        method: "GET",
        path: "/repository/process-definitions/{id}/resourcedata",
        desc: "Fetch BPMN XML",
      },
    ],
  },
  component: ProcessDefinitionDetailRoute,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/definitions" className="btn">
          Back to process definitions
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

function ProcessDefinitionDetailRoute() {
  const definition = Route.useLoaderData();
  const router = useRouter();
  return <ProcessDefinitionDetail definition={definition} reload={() => router.invalidate()} />;
}
