import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Tasks, type TasksAssignee } from "../../screens";

const tasksSearch = z.object({
  assignee: z.enum(["me", "all", "unassigned"]).optional().default("all"),
});

export const Route = createFileRoute("/tasks/")({
  validateSearch: tasksSearch,
  staticData: {
    title: "Tasks",
    endpoints: [
      { method: "GET", path: "/runtime/tasks?assignee={user}", desc: "My tasks" },
      { method: "POST", path: "/runtime/tasks/{taskId}", desc: "Claim / complete / delegate" },
      { method: "GET", path: "/form/form-data?taskId={id}", desc: "Render form" },
    ],
  },
  component: TasksRoute,
});

function TasksRoute() {
  const { assignee } = Route.useSearch();
  const navigate = useNavigate({ from: "/tasks/" });
  return (
    <Tasks
      initialAssignee={assignee as TasksAssignee}
      onAssigneeChange={(v) => navigate({ search: (prev) => ({ ...prev, assignee: v }) })}
    />
  );
}
