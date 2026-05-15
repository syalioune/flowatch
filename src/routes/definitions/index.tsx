// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { ProcessDefinitions } from "../../screens";

export const Route = createFileRoute("/definitions/")({
  staticData: {
    title: "Process definitions",
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
  component: DefinitionsRoute,
});

function DefinitionsRoute() {
  return <ProcessDefinitions />;
}
