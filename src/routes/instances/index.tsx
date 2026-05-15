import { createFileRoute } from "@tanstack/react-router";
import { openInspector } from "../../lib/nav";
import { ProcessInstances } from "../../screens";

export const Route = createFileRoute("/instances/")({
  component: InstancesRoute,
});

function InstancesRoute() {
  return <ProcessInstances onOpenInspector={openInspector} />;
}
