# API Contracts

This document catalogs every Flowable REST endpoint that Flowatch consumes, grouped by the band it appears in within [src/api.ts](../src/api.ts) (and the split files `api-app.ts`, `api-history.ts`, `api-identity.ts`). Flowatch owns no API of its own — it is purely a client.

## Connection model

- **Base URL** (configurable, defaults to `http://localhost:8080/flowable-rest/service`) — used for BPMN/runtime/identity/management/history/form endpoints.
- **Sub-app bases** — derived at call time by helper functions that strip the configured `servicePath` suffix via `connectionRoot()` and append the sub-app segment. All four path segments are **per-connection overrides** (`SavedConnection` `schemaVersion: 2`); the values below are the defaults when no override is set:
  - `dmnBase()` → `connectionRoot() + (cfg.dmnPath || "/dmn-api")`
  - `appBase()` → `connectionRoot() + (cfg.appPath || "/app-api")`
  - `cmmnBase()` → `connectionRoot() + (cfg.cmmnPath || "/cmmn-api")` (forward-reserved, no consumer yet)
  - service base → `connectionRoot() + (cfg.servicePath || "/service")` (the main `baseUrl`)
- **Auth** — pluggable `AuthStrategy`: `BasicAuthStrategy` (default), `BearerAuthStrategy` (paste-a-token), `OidcAuthStrategy` (PKCE OIDC). Installed at module load by `installStrategyForActiveConnection()`. The funnel awaits `authStrategy.authorizationHeader()` — never hard-codes Basic.
- **Content negotiation** — `Accept: application/json` by default; `Accept: */*` when the wrapper opts into `{ raw: true }` (used for XML downloads and exception stacktraces); `{ asResponse: true }` returns the raw `Response` for binary callers.
- **Multipart** — deployment uploads bypass the JSON funnel and POST `FormData`.

Every JSON wrapper passes through `request(method, path, { params, body, base, raw, asResponse })` in [src/api.ts](../src/api.ts). On success it returns parsed JSON (or text if `raw:true`). On failure it throws an `Error` with `.status` set to the HTTP code and `.message` set to the server's response body (or `HTTP NNN` if the body is empty).

Every call — success or failure — pushes an entry into `API_LOG` and fires a `window` `CustomEvent('api:log', { detail: entry })`. The `ApiInspector` component listens for this event.

## Repository (BPMN)

| Wrapper                                | Method | Path                                                              | Notes                                                                |
| -------------------------------------- | ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `listDeployments(params)`              | GET    | `/repository/deployments`                                         | Standard Flowable pagination params (`size`, `start`, `sort`, `order`, `tenantId`) |
| `createDeployment(form)`               | POST   | `/repository/deployments`                                         | JSON body. Most code uses `deployBpmn` / `deployDmn` instead (multipart, see below) |
| `deleteDeployment(id, cascade)`        | DELETE | `/repository/deployments/{id}?cascade=true`                       | `cascade=true` only when explicitly requested                        |
| `listDeploymentResources(id)`          | GET    | `/repository/deployments/{id}/resources`                          |                                                                      |
| `listProcessDefinitions(params)`       | GET    | `/repository/process-definitions`                                 |                                                                      |
| `getProcessDefinitionFresh(id)`        | GET    | `/repository/process-definitions?key=…&size=200`                  | RC-16 workaround: the single-GET serves `category` from the BPMN model cache and ignores DB updates from `updateProcessDefinition`. This wrapper hits the LIST endpoint (which reads `act_re_procdef.category_` directly), filters by `key` extracted from the engine's `key:version:UUID` id, then JS-filters by exact id. Falls through to the single-GET if no match. Used by the `/definitions/$id` route loader. |
| `suspendProcessDefinition(id, suspend)`| PUT    | `/repository/process-definitions/{id}`                            | Body `{ action: "suspend" \| "activate" }`                           |
| `updateProcessDefinition(id, fields)`  | PUT    | `/repository/process-definitions/{id}`                            | Body `{ category }` (FR-43). Same URL as `suspendProcessDefinition` — the engine discriminates by body shape (`{action}` vs `{category}`). `{category: ""}` clears the value. Throws if `fields` is empty (would collide with the suspend/activate body discriminator). Returns the echoed `FlowableProcessDefinition`. |
| `getProcessDefinitionResource(id)`     | GET    | `/repository/process-definitions/{id}/resourcedata`               | Returns **raw XML** (`raw: true`)                                    |

## Runtime

| Wrapper                                    | Method | Path                                                  | Notes                                       |
| ------------------------------------------ | ------ | ----------------------------------------------------- | ------------------------------------------- |
| `listProcessInstances(params)`             | GET    | `/runtime/process-instances`                          |                                             |
| `startProcessInstance(body)`               | POST   | `/runtime/process-instances`                          | Body shape: `{ processDefinitionKey \| processDefinitionId, businessKey?, tenantId?, variables? }` |
| `deleteProcessInstance(id, reason)`        | DELETE | `/runtime/process-instances/{id}?deleteReason=…`      |                                             |
| `getProcessInstanceVariables(id)`          | GET    | `/runtime/process-instances/{id}/variables`           |                                             |
| `setProcessInstanceVariables(id, vars)`    | PUT    | `/runtime/process-instances/{id}/variables`           | Body: array of `{name, value, type, scope?}`. Returns `201 Created` for both insert and upsert (RC-15). Response echoes `scope:"local"` regardless of input — ignore the echo. (FR-19) |
| `deleteProcessInstanceVariable(id, name)`  | DELETE | `/runtime/process-instances/{id}/variables/{name}`    | `encodeURIComponent(name)` non-negotiable. `204 No Content`; `404` if missing. NOT idempotent (RC-15). (FR-19) |
| `listEventSubscriptions(params)`           | GET    | `/runtime/event-subscriptions`                        | Supports `processInstanceId`, `eventType`, `eventName`, `tenantId` filters. (FR-54). |
| `listTasks(params)`                        | GET    | `/runtime/tasks`                                      | Used both for screens and for `navCounts`   |
| `taskAction(taskId, action, body)`         | POST   | `/runtime/tasks/{taskId}`                             | Body: `{ action, ...extra }`. Actions: `claim`, `complete`, `delegate`, `resolve`, `unclaim` |
| `updateTask(id, fields)`                   | PUT    | `/runtime/tasks/{id}`                                 | Body `Partial<{priority, dueDate, owner, assignee}>` (FR-44). Same URL as `taskAction` — engine discriminates by HTTP method (POST action-verbs vs PUT field-patches). Returns the echoed FlowableTask. Throws if `fields` is empty. |
| `getTaskVariables(taskId)`                 | GET    | `/runtime/tasks/{taskId}/variables`                   |                                             |
| `listTaskAttachments(taskId)`              | GET    | `/runtime/tasks/{taskId}/attachments`                 | Bare array response (NOT envelope). (FR-45). |
| `addTaskAttachment(taskId, payload)`       | POST   | `/runtime/tasks/{taskId}/attachments`                 | Body discriminated: `kind="url"` → JSON `{name, description?, type?, externalUrl}`; `kind="file"` → multipart FormData with `name` / `description?` / `type?` / `content`. Mirrors `uploadDeployment`'s multipart envelope inside src/api.ts (Pattern P-001 preserved). Returns FlowableAttachment. (FR-45). |
| `getTaskAttachmentContent(taskId, attachmentId)` | GET | `/runtime/tasks/{taskId}/attachments/{attachmentId}/content` | Binary `asResponse:true` (caller picks `.blob()`/`.text()`). (FR-45). |
| `deleteTaskAttachment(taskId, attachmentId)` | DELETE | `/runtime/tasks/{taskId}/attachments/{attachmentId}` | `204 No Content`. Symmetric with `addTaskAttachment`. (FR-45). |

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
| `executeJob(id)`                 | POST   | `/management/jobs/{id}`                               | Body `{ action: "execute" }`. Executable-jobs namespace only (RC-11). |
| `executeTimerJob(id)`            | POST   | `/management/timer-jobs/{id}`                         | Body `{ action: "move" }` — moves timer to executable queue for immediate pickup. Operator label: "Execute now". Wire verb: `move` (RC-11). |
| `rescheduleTimerJob(id, dueDate)`| POST   | `/management/timer-jobs/{id}`                         | Body `{ action: "reschedule", dueDate: <iso-utc> }`. See `datetime-local` round-trip in CLAUDE.md. |
| `moveDeadLetterJob(id)`          | POST   | `/management/deadletter-jobs/{id}`                    | Body `{ action: "move" }` (back to executable queue). (RC-11). |
| `jobStacktrace(id)`              | GET    | `/management/jobs/{id}/exception-stacktrace`          | Returns **raw text** (`raw: true`). Executable-jobs namespace. |
| `timerJobStacktrace(id)`         | GET    | `/management/timer-jobs/{id}/exception-stacktrace`    | Returns **raw text** (`raw: true`). Timer-jobs namespace (RC-11). |
| `deadLetterJobStacktrace(id)`    | GET    | `/management/deadletter-jobs/{id}/exception-stacktrace` | Returns **raw text** (`raw: true`). Dead-letter namespace (RC-11). |
| `listBatches(params)`            | GET    | `/management/batches`                                 | Supports `searchKey`, `status`, `tenantId` filters. (FR-53). |
| `getBatch(id)`                   | GET    | `/management/batches/{id}`                            | Single batch detail. (FR-53). |
| `listBatchParts(batchId, params)`| GET    | `/management/batches/{batchId}/batch-parts`           | Returns batch-part rows for `<BatchPartsPanel>` row-expand. (FR-53). |
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
| `getUserGroups(userId)`              | GET    | `/identity/groups?member={userId}`         | flowable-rest 7.2 OSS does NOT serve `/identity/users/{userId}/groups`; the `?member=` filter is the working recipe. |
| `addUserToGroup(userId, groupId)`    | POST   | `/identity/groups/{groupId}/members`       | Body `{ userId }`. Flowable 7.2 OSS does NOT honour the inverse `POST /identity/users/{userId}/groups` path; the group-centric route is the working endpoint. |
| `removeUserFromGroup(userId, groupId)`| DELETE | `/identity/groups/{groupId}/members/{userId}`| 204 No Content on success; 404 if the membership doesn't exist. Flowable 7.2 OSS does NOT honour the inverse `DELETE /identity/users/{userId}/groups/{groupId}` path (returns 500 "No endpoint DELETE ..."). |
| `createUser(body)`                   | POST   | `/identity/users`                          | Body `{ id (required), firstName?, lastName?, email?, password? }` (FR-46). Engine validates `id` non-null; duplicate-id returns 4xx with verbatim message. `tenantId` is NOT in the create body (read-only on FlowableUser). Returns echoed FlowableUser with password omitted from the echo. |
| `updateUser(id, fields)`             | PUT    | `/identity/users/{id}`                     | Body `Partial<{firstName, lastName, email, password}>` (FR-46). Same URL as `getUser`. Throws if `fields` is empty. Password sent as plain field; engine omits it from the echo. `encodeURIComponent` round-trip on `id`. Returns echoed FlowableUser. |
| `deleteUser(id)`                     | DELETE | `/identity/users/{id}`                     | Hard delete (FR-46). `encodeURIComponent(id)` non-negotiable. `204 No Content` on success; `404` with verbatim message if missing. Engine orphans (does NOT cascade) any task/instance references to the deleted user. |
| `createGroup(body)`                  | POST   | `/identity/groups`                         | Body `{ id (required), name?, type? }` (FR-47). Engine validates `id` non-null; duplicate-id returns 4xx verbatim. `type` is a free string (no enum). Returns echoed FlowableGroup. |
| `updateGroup(id, fields)`            | PUT    | `/identity/groups/{id}`                    | Body `Partial<{name, type}>` (FR-47). PUT-with-partial-fields family N=4 (codification fires; see CLAUDE.md). `encodeURIComponent(id)` non-negotiable. Throws if `fields` is empty. Returns echoed FlowableGroup. |
| `deleteGroup(id)`                    | DELETE | `/identity/groups/{id}`                    | Hard delete (FR-47). `encodeURIComponent(id)` non-negotiable. `204 No Content`; `404` if missing. Engine CASCADES group-membership join rows server-side. |
| `listTenants()`                      | (n/a)  | _(synthesized — see note)_                 | flowable-rest 7.2 doesn't expose `/identity/tenants`. Implementation calls `listDeployments({ size: 1000 })` and reduces distinct `tenantId` values, then returns `{ data: [{ id, name }] }`. |

## DMN (under `/flowable-rest/dmn-api`)

All DMN wrappers pass `{ base: dmnBase() }`. The `dmnBase()` helper rewrites the configured base URL by replacing `/service` with `/dmn-api`.

| Wrapper                                       | Method | Path (relative to dmn-api root)                                       | Notes                                          |
| --------------------------------------------- | ------ | --------------------------------------------------------------------- | ---------------------------------------------- |
| `listDecisions(params)`                       | GET    | `/dmn-repository/decisions`                                           |                                                |
| `listDmnDeployments(params)`                  | GET    | `/dmn-repository/deployments`                                         |                                                |
| `executeDecision(body)`                       | POST   | `/dmn-rule/execute`                                                   | Body: `{decisionKey, inputVariables: [{name, type, value}], parentDeploymentId?}` — Story 15.3 tightened the signature. Response: `FlowableDecisionResult` with `matchedRules` + `resultVariableMap` (legacy `resultVariables` also supported). |
| `getDmnResource(deploymentId, resourceId)`    | GET    | `/dmn-repository/deployments/{deploymentId}/resourcedata/{resourceId}` | Returns **raw XML** (`raw: true`)              |
| `removeDmnDeployment(id, params?)`            | DELETE | `/dmn-repository/deployments/{id}`                                    | Pass `{cascade: true}` to delete decisions referenced by historic executions. Without cascade, the engine returns 409 if any historic execution references a decision. |
| `listDmnHistoryExecutions(params?)`           | GET    | `/dmn-history/historic-decision-executions`                           | Supports `decisionKey`, `processInstanceId`, `startedBefore/After`, `sort/order` filters. Response items: `FlowableHistoricDecisionExecution`. |

## App (under `/flowable-rest/app-api`)

All App wrappers pass `{ base: appBase() }`. `deployBar` is in the multipart section below.

| Wrapper                              | Method | Path (relative to app-api root)              | Notes                                                                                 |
| ------------------------------------ | ------ | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `listAppDefinitions(params)`         | GET    | `/app-repository/app-definitions`            | Read-only browse of deployed `.bar` app definitions. (FR-55). |

> **Note:** `app-runtime/app-instances` is NOT exposed in `flowable-rest:7.2.0` — only the browse side is feasible (see [compat.md](./compat.md) FR-55).

## Deployment uploads (multipart)

These two wrappers bypass the `request()` JSON funnel — they build a `FormData`, set `Authorization` manually, and `fetch()` directly. They still push their result into `API_LOG` and fire `api:log`, so the Inspector still shows them.

| Wrapper                          | Method | Path                                                    | Notes                                                                  |
| -------------------------------- | ------ | ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `deployBpmn(name, xml)`          | POST   | `/repository/deployments`                               | Multipart fields: `file` (XML blob, named `<name>`), optional `tenantId`, `deploymentName` |
| `deployDmn(name, xml)`           | POST   | `/dmn-repository/deployments` (on `dmnBase()`)          | Same shape, against the DMN sub-app                                    |
| `deployBar(name, file)`          | POST   | `/app-repository/deployments` (on `appBase()`)          | Must use the App sub-app — BPMN sub-app silently skips `.app` manifest; DMN rejects `.bar`. Full cascade: AppDeployer → BpmnDeployer + DmnDeployer. See RC-17 in [runtime-caveats.md](./runtime-caveats.md). (FR-55) |

> Flowable rejects the JSON-with-base64 deployment shape. Multipart is the only supported route for all three deployers. See [src/api.ts](../src/api.ts).

## Diagnostics / helpers exported from `api`

| Export                       | Purpose                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `api.config()`               | Returns a **copy** of the current connection config.                                                     |
| `api.setConfig(partial)`     | Shallow-merges partial config into the live `cfg`, persists to `localStorage` (`flowatch.connection.v1`). |
| `api.log()`                  | Returns a copy of `API_LOG` (most recent first, max 60 entries).                                         |
| `api.getAuthStrategy()`      | Returns the currently installed `AuthStrategy` instance.                                                 |
| `api.setAuthStrategy(s)`     | Installs a new `AuthStrategy`. Called by `installStrategyForActiveConnection()`.                         |
| `API_LOG`                    | Live array, exported for direct read access by the Inspector.                                            |

## Error contract

Every wrapper throws on non-2xx HTTP status. Caught errors expose:

```js
err.status   // HTTP status number (0 if the request never completed)
err.message  // server response body, or `HTTP <status>`, or fetch's TypeError message
```

Screens render these messages **verbatim** in `ErrorBox` — no friendly rewrites, no silent fallbacks. This is intentional: the user (a Flowable operator) is the audience and benefits from the real engine message.

## Local fixtures and seed data

There are **no fixtures**. There is no `mocks/` folder. The repo policy is explicit: screens read live data or render empty/error states. The only embedded data in the codebase is the three starter XMLs in [src/modeler/starters.ts](../src/modeler/starters.ts) (`BLANK_BPMN_XML`, `LOAN_BPMN_XML`, `LOAN_DMN_XML`), and the per-screen endpoint metadata in [src/data.js](../src/data.js).
