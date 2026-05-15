import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { api } from "../../api";
import { ProcessDefinitionDetail } from "../../components/ProcessDefinitionDetail";
import { ErrorBox } from "../../lib/error-box";
import { openInspector } from "../../lib/nav";

export const Route = createFileRoute("/definitions/$id")({
  loader: ({ params }) => api.getProcessDefinition(params.id),
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
  return (
    <ProcessDefinitionDetail
      definition={definition}
      onOpenInspector={openInspector}
      reload={() => router.invalidate()}
    />
  );
}
