import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { openInspector } from "../lib/nav";
import { History, type HistoryType } from "../screens";

const historySearch = z.object({
  type: z.enum(["instances", "activities", "variables", "tasks"]).optional().default("instances"),
});

export const Route = createFileRoute("/history")({
  validateSearch: historySearch,
  component: HistoryRoute,
});

function HistoryRoute() {
  const { type } = Route.useSearch();
  const navigate = useNavigate({ from: "/history" });
  return (
    <History
      initialType={type as HistoryType}
      onTypeChange={(v) => navigate({ search: (prev) => ({ ...prev, type: v }) })}
      onOpenInspector={openInspector}
    />
  );
}
