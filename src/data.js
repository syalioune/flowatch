// Per-screen REST endpoint hints, surfaced in the page header and the API
// Inspector. Pure documentation — no runtime data lives here anymore.

const endpoints = {
  dashboard: [
    { method: "GET", path: "/repository/deployments?size=5&sort=deployTime&order=desc", desc: "Recent deployments" },
    { method: "GET", path: "/runtime/process-instances?size=10", desc: "Active instances" },
    { method: "GET", path: "/management/jobs?withException=true", desc: "Failing jobs" },
  ],
  deployments: [
    { method: "GET", path: "/repository/deployments", desc: "List deployments" },
    { method: "POST", path: "/repository/deployments", desc: "Upload .bpmn / .dmn / .bar" },
    { method: "DELETE", path: "/repository/deployments/{deploymentId}", desc: "Remove" },
  ],
  definitions: [
    { method: "GET", path: "/repository/process-definitions", desc: "List process definitions" },
    { method: "PUT", path: "/repository/process-definitions/{id}", desc: "Suspend / activate" },
    { method: "GET", path: "/repository/process-definitions/{id}/resourcedata", desc: "Fetch BPMN XML" },
  ],
  instances: [
    { method: "GET", path: "/runtime/process-instances", desc: "List running instances" },
    { method: "POST", path: "/runtime/process-instances", desc: "Start instance" },
    { method: "DELETE", path: "/runtime/process-instances/{id}", desc: "Cancel" },
  ],
  jobs: [
    { method: "GET", path: "/management/jobs", desc: "List jobs" },
    { method: "POST", path: "/management/jobs/{jobId}", desc: "Execute now / retry" },
    { method: "GET", path: "/management/jobs/{jobId}/exception-stacktrace", desc: "Stacktrace" },
  ],
  tasks: [
    { method: "GET", path: "/runtime/tasks?assignee={user}", desc: "My tasks" },
    { method: "POST", path: "/runtime/tasks/{taskId}", desc: "Claim / complete / delegate" },
    { method: "GET", path: "/form/form-data?taskId={id}", desc: "Render form" },
  ],
  history: [
    { method: "GET", path: "/history/historic-process-instances", desc: "Completed instances" },
    { method: "GET", path: "/history/historic-activity-instances?processInstanceId={id}", desc: "Audit trail" },
    { method: "GET", path: "/history/historic-variable-instances?processInstanceId={id}", desc: "Variables" },
  ],
  identity: [
    { method: "GET", path: "/identity/users", desc: "List users" },
    { method: "GET", path: "/identity/groups", desc: "List groups" },
    { method: "POST", path: "/identity/users/{id}/groups", desc: "Add to group" },
  ],
  bpmnModeler: [
    { method: "GET", path: "/repository/process-definitions/{id}/resourcedata", desc: "Load BPMN XML" },
    { method: "POST", path: "/repository/deployments", desc: "Deploy edited model" },
  ],
  dmnModeler: [
    { method: "GET", path: "/dmn-repository/decisions", desc: "List decisions" },
    { method: "POST", path: "/dmn-rule/execute", desc: "Test rule execution" },
    { method: "POST", path: "/dmn-repository/deployments", desc: "Deploy decision" },
  ],
  tenants: [
    { method: "GET", path: "/repository/deployments?size=1000", desc: "Distinct tenantIds (no /identity/tenants in 7.2)" },
  ],
};

export default { endpoints };
