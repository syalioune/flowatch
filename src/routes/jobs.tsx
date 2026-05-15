// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Jobs, type JobsType } from "../screens";

const jobsSearch = z.object({
  type: z.enum(["executable", "timer", "deadletter"]).optional().default("executable"),
});

export const Route = createFileRoute("/jobs")({
  validateSearch: jobsSearch,
  staticData: {
    title: "Jobs",
    endpoints: [
      { method: "GET", path: "/management/jobs", desc: "List jobs" },
      { method: "POST", path: "/management/jobs/{jobId}", desc: "Execute now / retry" },
      { method: "GET", path: "/management/jobs/{jobId}/exception-stacktrace", desc: "Stacktrace" },
    ],
  },
  component: JobsRoute,
});

function JobsRoute() {
  const { type } = Route.useSearch();
  const navigate = useNavigate({ from: "/jobs" });
  return (
    <Jobs
      initialType={type as JobsType}
      onTypeChange={(newType) => navigate({ search: (prev) => ({ ...prev, type: newType }) })}
    />
  );
}
