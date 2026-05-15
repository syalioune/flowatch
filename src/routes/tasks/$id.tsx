import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { api } from "../../api";
import { TaskDetail } from "../../components/TaskDetail";
import { ErrorBox } from "../../lib/error-box";

export const Route = createFileRoute("/tasks/$id")({
  loader: ({ params }) => api.getTask(params.id),
  staticData: {
    title: "Task detail",
    endpoints: [
      { method: "GET", path: "/runtime/tasks/{id}", desc: "Get task" },
      { method: "POST", path: "/runtime/tasks/{taskId}", desc: "Claim / complete / delegate" },
      { method: "GET", path: "/form/form-data?taskId={id}", desc: "Render form" },
    ],
  },
  component: TaskDetailRoute,
  errorComponent: ({ error }) => (
    <div className="page">
      <ErrorBox error={error} />
      <div style={{ padding: 24 }}>
        <Link to="/tasks" className="btn">
          Back to tasks
        </Link>
      </div>
    </div>
  ),
  pendingComponent: () => (
    <div className="page">
      <div className="empty" style={{ padding: 24 }}>
        Loading…
      </div>
    </div>
  ),
});

function TaskDetailRoute() {
  const task = Route.useLoaderData();
  const router = useRouter();
  return <TaskDetail task={task} reload={() => router.invalidate()} />;
}
