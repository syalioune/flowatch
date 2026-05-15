import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { openInspector } from "../../lib/nav";
import { Tasks, type TasksAssignee } from "../../screens";

const tasksSearch = z.object({
  assignee: z.enum(["me", "all", "unassigned"]).optional().default("all"),
});

export const Route = createFileRoute("/tasks/")({
  validateSearch: tasksSearch,
  component: TasksRoute,
});

function TasksRoute() {
  const { assignee } = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks/" });
  return (
    <Tasks
      initialAssignee={assignee as TasksAssignee}
      onAssigneeChange={(v) => navigate({ search: (prev) => ({ ...prev, assignee: v }) })}
      onOpenInspector={openInspector}
    />
  );
}
