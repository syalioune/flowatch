// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BpmnModeler } from "../modeler";

const bpmnSearch = z.object({ defId: z.string().optional() });

export const Route = createFileRoute("/bpmn")({
  validateSearch: bpmnSearch,
  staticData: {
    title: "BPMN modeler",
    endpoints: [
      {
        method: "GET",
        path: "/repository/process-definitions/{id}/resourcedata",
        desc: "Load BPMN XML",
      },
      { method: "POST", path: "/repository/deployments", desc: "Deploy edited model" },
    ],
  },
  component: BpmnRoute,
});

function BpmnRoute() {
  const { defId } = Route.useSearch();
  return <BpmnModeler initialDefinitionId={defId} />;
}
