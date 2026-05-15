import { createFileRoute } from "@tanstack/react-router";
import { openInspector, ROUTED_VIEWS, setLegacyView, VIEW_TO_PATH } from "../../lib/nav";
import { ProcessDefinitions } from "../../screens";

export const Route = createFileRoute("/definitions/")({
  component: DefinitionsRoute,
});

function DefinitionsRoute() {
  const navigate = Route.useNavigate();
  const onNav = (view: string) => {
    if (ROUTED_VIEWS.has(view) && VIEW_TO_PATH[view]) {
      navigate({ to: VIEW_TO_PATH[view] });
    } else {
      setLegacyView(view);
    }
  };
  return <ProcessDefinitions onOpenInspector={openInspector} onNav={onNav} />;
}
