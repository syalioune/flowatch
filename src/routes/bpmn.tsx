// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BpmnModeler } from "../modeler/BpmnModeler";

// Story 9.5 renamed the search param `defId` → `definitionId` to match the
// API resource path (`/repository/process-definitions/{id}`) and the epic
// AC wording. Clean break — no legacy `defId` alias.
const bpmnSearch = z.object({ definitionId: z.string().optional() });

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
  const { definitionId } = Route.useSearch();
  return <BpmnModeler initialDefinitionId={definitionId} />;
}
