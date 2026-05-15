import { createFileRoute } from "@tanstack/react-router";
import { openInspector } from "../lib/nav";
import { BpmnModeler } from "../modeler";

export const Route = createFileRoute("/bpmn")({
  component: BpmnRoute,
});

function BpmnRoute() {
  return <BpmnModeler onOpenInspector={openInspector} />;
}
