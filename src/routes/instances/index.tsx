// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { ProcessInstances } from "../../screens";

export const Route = createFileRoute("/instances/")({
  staticData: {
    title: "Process instances",
    endpoints: [
      { method: "GET", path: "/runtime/process-instances", desc: "List running instances" },
      { method: "POST", path: "/runtime/process-instances", desc: "Start instance" },
      { method: "DELETE", path: "/runtime/process-instances/{id}", desc: "Cancel" },
    ],
  },
  component: InstancesRoute,
});

function InstancesRoute() {
  return <ProcessInstances />;
}
