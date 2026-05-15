import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { openInspector } from "../lib/nav";
import { Jobs, type JobsType } from "../screens";

const jobsSearch = z.object({
  type: z.enum(["executable", "timer", "deadletter"]).optional().default("executable"),
});

export const Route = createFileRoute("/jobs")({
  validateSearch: jobsSearch,
  component: JobsRoute,
});

function JobsRoute() {
  const { type } = Route.useSearch();
  const navigate = useNavigate({ from: "/jobs" });
  return (
    <Jobs
      initialType={type as JobsType}
      onTypeChange={(newType) => navigate({ search: (prev) => ({ ...prev, type: newType }) })}
      onOpenInspector={openInspector}
    />
  );
}
