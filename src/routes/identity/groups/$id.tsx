import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../../api";
import { GroupDetail } from "../../../components/GroupDetail";
import { ErrorBox } from "../../../lib/error-box";
import { openInspector } from "../../../lib/nav";

export const Route = createFileRoute("/identity/groups/$id")({
  loader: ({ params }) => api.getGroup(params.id),
  component: GroupDetailRoute,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/identity" className="btn">
          Back to identity
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

function GroupDetailRoute() {
  const group = Route.useLoaderData();
  return <GroupDetail group={group} onOpenInspector={openInspector} />;
}
