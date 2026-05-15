// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { Deployments } from "../../screens";

export const Route = createFileRoute("/deployments/")({
  staticData: {
    title: "Deployments",
    endpoints: [
      { method: "GET", path: "/repository/deployments", desc: "List deployments" },
      { method: "POST", path: "/repository/deployments", desc: "Upload .bpmn / .dmn / .bar" },
      { method: "DELETE", path: "/repository/deployments/{deploymentId}", desc: "Remove" },
    ],
  },
  component: DeploymentsRoute,
});

function DeploymentsRoute() {
  return <Deployments />;
}
