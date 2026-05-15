import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { openInspector } from "../../lib/nav";
import { Identity, type IdentityTab } from "../../screens";

const identitySearch = z.object({
  tab: z.enum(["users", "groups"]).optional().default("users"),
});

export const Route = createFileRoute("/identity/")({
  validateSearch: identitySearch,
  component: IdentityRoute,
});

function IdentityRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/identity/" });
  return (
    <Identity
      initialTab={tab as IdentityTab}
      onTabChange={(v) => navigate({ search: (prev) => ({ ...prev, tab: v }) })}
      onOpenInspector={openInspector}
    />
  );
}
