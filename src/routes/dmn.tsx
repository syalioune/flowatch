// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DmnModeler } from "../modeler/DmnModeler";

// Story 16.4 AC-3: `?decisionId=` Zod-validated deep-link mirrors the BPMN
// route at src/routes/bpmn.tsx. The DmnModeler component resolves the
// decision's `deploymentId` + `resourceId` (via api.listDmnDeploymentResources)
// to fetch the XML.
const dmnSearch = z.object({ decisionId: z.string().optional() });

export const Route = createFileRoute("/dmn")({
  validateSearch: dmnSearch,
  staticData: {
    title: "DMN modeler",
    endpoints: [
      { method: "GET", path: "/dmn-repository/decisions", desc: "List decisions" },
      {
        method: "GET",
        path: "/dmn-repository/deployments/{depId}/resourcedata/{resId}",
        desc: "Load DMN XML",
      },
      { method: "POST", path: "/dmn-rule/execute", desc: "Test rule execution" },
      { method: "POST", path: "/dmn-repository/deployments", desc: "Deploy decision" },
    ],
  },
  component: DmnRoute,
});

function DmnRoute() {
  const { decisionId } = Route.useSearch();
  return <DmnModeler initialDecisionId={decisionId} />;
}
