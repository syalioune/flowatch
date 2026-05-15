// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { History, type HistoryType } from "../screens";

const historySearch = z.object({
  type: z.enum(["instances", "activities", "variables", "tasks"]).optional().default("instances"),
});

export const Route = createFileRoute("/history")({
  validateSearch: historySearch,
  staticData: {
    title: "History",
    endpoints: [
      { method: "GET", path: "/history/historic-process-instances", desc: "Completed instances" },
      {
        method: "GET",
        path: "/history/historic-activity-instances?processInstanceId={id}",
        desc: "Audit trail",
      },
      {
        method: "GET",
        path: "/history/historic-variable-instances?processInstanceId={id}",
        desc: "Variables",
      },
    ],
  },
  component: HistoryRoute,
});

function HistoryRoute() {
  const { type } = Route.useSearch();
  const navigate = useNavigate({ from: "/history" });
  return (
    <History
      initialType={type as HistoryType}
      onTypeChange={(v) => navigate({ search: (prev) => ({ ...prev, type: v }) })}
    />
  );
}
