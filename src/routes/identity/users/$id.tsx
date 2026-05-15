import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../../api";
import { UserDetail } from "../../../components/UserDetail";
import { ErrorBox } from "../../../lib/error-box";
import { openInspector } from "../../../lib/nav";

export const Route = createFileRoute("/identity/users/$id")({
  loader: ({ params }) => api.getUser(params.id),
  component: UserDetailRoute,
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

function UserDetailRoute() {
  const user = Route.useLoaderData();
  return <UserDetail user={user} onOpenInspector={openInspector} />;
}
