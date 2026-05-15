import { createFileRoute } from "@tanstack/react-router";
import { openInspector } from "../lib/nav";
import { DmnModeler } from "../modeler";

export const Route = createFileRoute("/dmn")({
  component: DmnRoute,
});

function DmnRoute() {
  return <DmnModeler onOpenInspector={openInspector} />;
}
