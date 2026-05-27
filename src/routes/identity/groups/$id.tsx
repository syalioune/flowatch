// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../../api";
import { GroupDetail } from "../../../components/GroupDetail";
import { ErrorBox } from "../../../lib/error-box";

export const Route = createFileRoute("/identity/groups/$id")({
  loader: ({ params }) => api.getGroup(params.id),
  staticData: {
    title: "Group detail",
    endpoints: [
      { method: "GET", path: "/identity/groups/{id}", desc: "Get group" },
      {
        method: "GET",
        path: "/identity/users?memberOfGroup={id}",
        desc: "Group members (workaround)",
      },
    ],
  },
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
  return <GroupDetail group={group} />;
}
