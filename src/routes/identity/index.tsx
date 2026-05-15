import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Identity, type IdentityTab } from "../../screens";

const identitySearch = z.object({
  tab: z.enum(["users", "groups"]).optional().default("users"),
});

export const Route = createFileRoute("/identity/")({
  validateSearch: identitySearch,
  staticData: {
    title: "Identity",
    endpoints: [
      { method: "GET", path: "/identity/users", desc: "List users" },
      { method: "GET", path: "/identity/groups", desc: "List groups" },
      { method: "POST", path: "/identity/users/{id}/groups", desc: "Add to group" },
    ],
  },
  component: IdentityRoute,
});

function IdentityRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/identity/" });
  return (
    <Identity
      initialTab={tab as IdentityTab}
      onTabChange={(v) => navigate({ search: (prev) => ({ ...prev, tab: v }) })}
    />
  );
}
