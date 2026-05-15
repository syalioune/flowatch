// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Dashboard } from "../screens";

const VIEW_TO_PATH: Record<string, string> = {
  dashboard: "/",
  bpmn: "/bpmn",
  dmn: "/dmn",
  deployments: "/deployments",
  definitions: "/definitions",
  instances: "/instances",
  jobs: "/jobs",
  tasks: "/tasks",
  history: "/history",
  identity: "/identity",
  tenants: "/tenants",
};

export const Route = createFileRoute("/")({
  staticData: {
    title: "Dashboard",
    endpoints: [
      {
        method: "GET",
        path: "/repository/deployments?size=5&sort=deployTime&order=desc",
        desc: "Recent deployments",
      },
      { method: "GET", path: "/runtime/process-instances?size=10", desc: "Active instances" },
      { method: "GET", path: "/management/jobs?withException=true", desc: "Failing jobs" },
    ],
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  const navigate = useNavigate();
  const onNav = (view: string) => {
    const target = VIEW_TO_PATH[view];
    if (target) navigate({ to: target });
  };
  return <Dashboard onNav={onNav} />;
}
