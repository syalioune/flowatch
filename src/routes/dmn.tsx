import { createFileRoute } from "@tanstack/react-router";
import { DmnModeler } from "../modeler";

export const Route = createFileRoute("/dmn")({
  staticData: {
    title: "DMN modeler",
    endpoints: [
      { method: "GET", path: "/dmn-repository/decisions", desc: "List decisions" },
      { method: "POST", path: "/dmn-rule/execute", desc: "Test rule execution" },
      { method: "POST", path: "/dmn-repository/deployments", desc: "Deploy decision" },
    ],
  },
  component: DmnRoute,
});

function DmnRoute() {
  return <DmnModeler />;
}
