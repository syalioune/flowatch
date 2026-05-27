// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { DmnModeler } from "../modeler/DmnModeler";

// `?decisionId=` Zod-validated deep-link mirrors the BPMN route at
// src/routes/bpmn.tsx. The DmnModeler component fetches XML directly via
// `/dmn-repository/decision-tables/{decisionId}/resourcedata` — no
// deployment-resources lookup hop (that endpoint returns 500 on the DMN
// sub-app).
const dmnSearch = z.object({ decisionId: z.string().optional() });

export const Route = createFileRoute("/dmn")({
  validateSearch: dmnSearch,
  staticData: {
    title: "DMN modeler",
    endpoints: [
      { method: "GET", path: "/dmn-repository/decisions", desc: "List decisions" },
      {
        method: "GET",
        path: "/dmn-repository/decision-tables/{decisionId}/resourcedata",
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
