import { createFileRoute } from "@tanstack/react-router";
import { openInspector } from "../../lib/nav";
import { Deployments } from "../../screens";

export const Route = createFileRoute("/deployments/")({
  component: DeploymentsRoute,
});

function DeploymentsRoute() {
  return <Deployments onOpenInspector={openInspector} />;
}
