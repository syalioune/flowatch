import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { openInspector } from "../lib/nav";
import { BpmnModeler } from "../modeler";

const bpmnSearch = z.object({ defId: z.string().optional() });

export const Route = createFileRoute("/bpmn")({
  validateSearch: bpmnSearch,
  component: BpmnRoute,
});

function BpmnRoute() {
  const { defId } = Route.useSearch();
  return <BpmnModeler initialDefinitionId={defId} onOpenInspector={openInspector} />;
}
