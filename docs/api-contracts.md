# API Contracts

This document catalogs every Flowable REST endpoint that Flowatch consumes, grouped by the band it appears in within [src/api.js](../src/api.js). Flowatch owns no API of its own — it is purely a client.

## Connection model

- **Base URL** (configurable, defaults to `http://localhost:8080/flowable-rest/service`) — used for BPMN/runtime/identity/management/history/form endpoints.
- **DMN base** — derived at call time by `dmnBase()` which replaces `/service` with `/dmn-api`, yielding `…/flowable-rest/dmn-api`. Used for all DMN endpoints.
- **Auth** — HTTP Basic, encoded from the connection config (`username` / `password`).
- **Content negotiation** — `Accept: application/json` by default; `Accept: */*` when the wrapper opts into `{ raw: true }` (used for XML downloads and exception stacktraces).
- **Multipart** — deployment uploads bypass the JSON funnel and POST `FormData`.

Every JSON wrapper passes through `request(method, path, { params, body, base, raw })` in [src/api.js:50](../src/api.js#L50). On success it returns parsed JSON (or text if not JSON). On failure it throws an `Error` with `.status` set to the HTTP code and `.message` set to the server's response body (or `HTTP NNN` if the body is empty).

Every call — success or failure — pushes an entry into `API_LOG` and fires a `window` `CustomEvent('api:log', { detail: entry })`. The `ApiInspector` component listens for this event.

## Repository (BPMN)

| Wrapper                                | Method | Path                                                              | Notes                                                                |
| -------------------------------------- | ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `listDeployments(params)`              | GET    | `/repository/deployments`                                         | Standard Flowable pagination params (`size`, `start`, `sort`, `order`, `tenantId`) |
| `createDeployment(form)`               | POST   | `/repository/deployments`                                         | JSON body. Most code uses `deployBpmn` / `deployDmn` instead (multipart, see below) |
| `deleteDeployment(id, cascade)`        | DELETE | `/repository/deployments/{id}?cascade=true`                       | `cascade=true` only when explicitly requested                        |
| `listDeploymentResources(id)`          | GET    | `/repository/deployments/{id}/resources`                          |                                                                      |
| `listProcessDefinitions(params)`       | GET    | `/repository/process-definitions`                                 |                                                                      |
| `suspendProcessDefinition(id, suspend)`| PUT    | `/repository/process-definitions/{id}`                            | Body `{ action: "suspend" \| "activate" }`                           |
| `getProcessDefinitionResource(id)`     | GET    | `/repository/process-definitions/{id}/resourcedata`               | Returns **raw XML** (`raw: true`)                                    |

## Runtime

| Wrapper                                    | Method | Path                                                  | Notes                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------- | ------------------------------------------- |
| `listProcessInstances(params)`             | GET    | `/runtime/process-instances`                          |                                             |
| `startProcessInstance(body)`               | POST   | `/runtime/process-instances`                          | Body shape: `{ processDefinitionKey \| processDefinitionId, businessKey?, tenantId?, variables? }` |
| `deleteProcessInstance(id, reason)`        | DELETE | `/runtime/process-instances/{id}?deleteReason=…`      |                                             |
| `getProcessInstanceVariables(id)`          | GET    | `/runtime/process-instances/{id}/variables`           |                                             |
| `listTasks(params)`                        | GET    | `/runtime/tasks`                                      | Used both for screens and for `navCounts`   |
| `taskAction(taskId, action, body)`         | POST   | `/runtime/tasks/{taskId}`                             | Body: `{ action, ...extra }`. Actions: `claim`, `complete`, `delegate`, `resolve`, `unclaim` |
| `getTaskVariables(taskId)`                 | GET    | `/runtime/tasks/{taskId}/variables`                   |                                             |

## Form

| Wrapper                                | Method | Path                            | Notes                                            |
| -------------------------------------- | ------ | ------------------------------- | ------------------------------------------------ |
| `getTaskForm(taskId)`                  | GET    | `/form/form-data?taskId={id}`   | Returns Flowable form-data definition for rendering |
| `submitTaskForm(taskId, properties)`   | POST   | `/form/form-data`               | Body `{ taskId, properties: [...] }`             |

## Management

| Wrapper                          | Method | Path                                                  | Notes                                                          |
| -------------------------------- | ------ | ----------------------------------------------------- | -------------------------------------------------------------- |
| `listJobs(params)`               | GET    | `/management/jobs`                                    | `withException=true` is a common filter                        |
| `listTimerJobs(params)`          | GET    | `/management/timer-jobs`                              |                                                                |
| `listDeadLetterJobs(params)`     | GET    | `/management/deadletter-jobs`                         |                                                                |
| `executeJob(id)`                 | POST   | `/management/jobs/{id}`                               | Body `{ action: "execute" }`                                   |
| `moveDeadLetterJob(id)`          | POST   | `/management/deadletter-jobs/{id}`                    | Body `{ action: "move" }` (back to executable queue)           |
| `jobStacktrace(id)`              | GET    | `/management/jobs/{id}/exception-stacktrace`          | Returns **raw text** (`raw: true`)                             |
| `ping()`                         | GET    | `/management/engine`                                  | Returns `{ name, version, resourceUrl, exception }`            |

## History

| Wrapper                              | Method | Path                                              | Notes                                                            |
| ------------------------------------ | ------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| `listHistoricInstances(params)`      | GET    | `/history/historic-process-instances`             |                                                                  |
| `getHistoricProcessInstance(id)`     | GET    | `/history/historic-process-instances/{id}`        | Per-id GET for the historic detail panel (Story 13.1).            |
| `listHistoricActivities(params)`     | GET    | `/history/historic-activity-instances`            | Common filter: `processInstanceId={id}` for an instance's audit trail |
| `listHistoricVariables(params)`      | GET    | `/history/historic-variable-instances`            | Variable payload is nested under `entry.variable.{name,type,value,scope}` — NOT flattened like the runtime variables endpoint. See RC-12. |
| `listHistoricTasks(params)`          | GET    | `/history/historic-task-instances`                |                                                                  |

## Identity

| Wrapper                              | Method | Path                                       | Notes                                                                                 |
| ------------------------------------ | ------ | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `listUsers(params)`                  | GET    | `/identity/users`                          |                                                                                       |
| `listGroups(params)`                 | GET    | `/identity/groups`                         |                                                                                       |
| `getUserGroups(userId)`              | GET    | `/identity/users/{userId}/groups`          |                                                                                       |
| `addUserToGroup(userId, groupId)`    | POST   | `/identity/users/{userId}/groups`          | Body `{ groupId }`                                                                    |
| `listTenants()`                      | (n/a)  | _(synthesized — see note)_                 | flowable-rest 7.2 doesn't expose `/identity/tenants`. Implementation calls `listDeployments({ size: 1000 })` and reduces distinct `tenantId` values, then returns `{ data: [{ id, name }] }`. |

## DMN (under `/flowable-rest/dmn-api`)

All DMN wrappers pass `{ base: dmnBase() }`. The `dmnBase()` helper rewrites the configured base URL by replacing `/service` with `/dmn-api`.

| Wrapper                                       | Method | Path (relative to dmn-api root)                                       | Notes                                          |
| --------------------------------------------- | ------ | --------------------------------------------------------------------- | ---------------------------------------------- |
| `listDecisions(params)`                       | GET    | `/dmn-repository/decisions`                                           |                                                |
| `listDmnDeployments(params)`                  | GET    | `/dmn-repository/deployments`                                         |                                                |
| `executeDecision(body)`                       | POST   | `/dmn-rule/execute`                                                   | Body: see Flowable DMN docs (decision key + inputs) |
| `getDmnResource(deploymentId, resourceId)`    | GET    | `/dmn-repository/deployments/{deploymentId}/resourcedata/{resourceId}` | Returns **raw XML** (`raw: true`)              |

## Deployment uploads (multipart)

These two wrappers bypass the `request()` JSON funnel — they build a `FormData`, set `Authorization` manually, and `fetch()` directly. They still push their result into `API_LOG` and fire `api:log`, so the Inspector still shows them.

| Wrapper                          | Method | Path                                                    | Notes                                                                  |
| -------------------------------- | ------ | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `deployBpmn(name, xml)`          | POST   | `/repository/deployments`                               | Multipart fields: `file` (XML blob, named `<name>`), optional `tenantId`, `deploymentName` |
| `deployDmn(name, xml)`           | POST   | `/dmn-repository/deployments` (on `dmnBase()`)          | Same shape, against the DMN sub-app                                    |

> Flowable rejects the JSON-with-base64 deployment shape used by older mock-mode code paths. Multipart is the only supported route. See [src/api.js:186-228](../src/api.js#L186-L228).

## Diagnostics / helpers exported from `api`

| Export                       | Purpose                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `api.config()`               | Returns a **copy** of the current connection config.                                                     |
| `api.setConfig(partial)`     | Shallow-merges partial config into the live `cfg`, persists to `localStorage` (`flowatch.connection.v1`). |
| `api.log()`                  | Returns a copy of `API_LOG` (most recent first, max 60 entries).                                         |
| `API_LOG`                    | Live array, exported for direct read access by the Inspector.                                            |

## Error contract

Every wrapper throws on non-2xx HTTP status. Caught errors expose:

```js
err.status   // HTTP status number (0 if the request never completed)
err.message  // server response body, or `HTTP <status>`, or fetch's TypeError message
```

Screens render these messages **verbatim** in `ErrorBox` — no friendly rewrites, no silent fallbacks. This is intentional: the user (a Flowable operator) is the audience and benefits from the real engine message.

## Local fixtures and seed data

There are **no fixtures**. There is no `mocks/` folder. The repo policy is explicit: screens read live data or render empty/error states. The only embedded data in the codebase is the three starter XMLs in [modeler.jsx](../src/modeler.jsx) (`BLANK_BPMN_XML`, `LOAN_BPMN_XML`, `LOAN_DMN_XML`), and the per-screen endpoint metadata in [data.js](../src/data.js).
