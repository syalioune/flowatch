// SPDX-License-Identifier: Apache-2.0

/**
 * Flowable REST type vocabulary + DTOs.
 *
 * Extracted from src/api.ts at Story 21.x to satisfy the 50 KB
 * NFR-21 navigability limit. Pure types — no runtime imports — so
 * downstream callers can `import type` without pulling the wrapper
 * module's side effects. The `api.ts` module re-exports every symbol
 * declared here, so existing `import { FlowableTask } from "../api"`
 * call sites continue to resolve.
 */

// ── Type vocabulary ───────────────────────────────────────────────────────

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface FlowableConfig {
  baseUrl: string;
  username: string;
  password: string;
  tenantId: string;
}

export interface FlowablePage<T> {
  data: T[];
  total: number;
  start: number;
  size: number;
  sort: string;
  order: string;
}

export interface FlowableEngineInfo {
  name: string;
  version: string;
  resourceUrl?: string;
  exception?: string | null;
}

export interface ApiLogEntry {
  id: string;
  method: HTTPMethod;
  path: string;
  url: string;
  status: number;
  ms: number;
  at: string;
  headers?: Record<string, string>;
  body?: unknown;
  error?: string;
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOpts {
  params?: QueryParams | undefined;
  body?: unknown;
  base?: string | undefined;
  raw?: boolean | undefined;
  // Story 9.6: when set, request() returns the raw `Response` object instead
  // of a parsed body. Used by binary downloads where the caller picks the body
  // method (`.blob()` / `.arrayBuffer()`). Mutually exclusive with `raw` — if
  // both are set, `asResponse` wins.
  asResponse?: boolean | undefined;
}

export class FlowableError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "FlowableError";
    this.status = status;
  }
}

// ── Minimal Flowable DTOs (fields the UI consumes today) ──────────────────

export interface FlowableDeployment {
  id: string;
  name: string;
  deploymentTime: string;
  tenantId: string;
  category?: string;
  // Story 25.1: Flowable sets this to `id` for standalone deploys and to
  // the parent App-sub-app deployment id when a .bar upload spawned a
  // child BPMN/DMN deployment via AppDeployer.
  parentDeploymentId?: string;
}

export interface FlowableProcessDefinition {
  id: string;
  key: string;
  name: string;
  version: number;
  deploymentId: string;
  category?: string;
  suspended?: boolean;
  tenantId?: string;
}

export interface FlowableProcessInstance {
  id: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  businessKey?: string;
  startTime: string;
  ended?: boolean;
  tenantId?: string;
  suspended?: boolean;
}

export interface FlowableTask {
  id: string;
  name: string;
  assignee?: string;
  owner?: string;
  priority: number;
  dueDate?: string;
  createTime: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  tenantId?: string;
}

// Story 21.2: task attachment DTO. Optional fields per the Flowable REST
// task-attachments spec — the engine derives `id` / `time` / `userId` and
// echoes the operator-supplied `name` / `description` / `type` / `externalUrl`.
// Story 25.1: Flowable App definition DTO (FR-55 scope-reduced). Returned by
// /app-api/app-repository/app-definitions. Permissive optional fields — the
// engine omits fields on single-tenant deployments / archives without a
// description. Field names match the Flowable REST 7.x response keys
// verbatim.
export interface FlowableAppDefinition {
  id: string;
  key?: string;
  name?: string;
  description?: string;
  version?: number;
  deploymentId?: string;
  deploymentTime?: string;
  tenantId?: string;
  resourceName?: string;
  category?: string;
  url?: string;
}

// `url` is the engine-side content URL for file attachments (e.g.
// /runtime/tasks/{id}/attachments/{aid}/content).
export interface FlowableAttachment {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  taskId?: string;
  processInstanceId?: string;
  externalUrl?: string;
  url?: string;
  time?: string;
  userId?: string;
}

// Story 21.2: discriminated-union payload for api.addTaskAttachment. The
// wrapper branches at runtime: kind="url" → JSON body; kind="file" →
// multipart FormData body (mirrors the uploadDeployment envelope shape
// inside src/api.ts; Pattern P-001 preserved).
export type AddAttachmentPayload =
  | { kind: "url"; name: string; type?: string; description?: string; externalUrl: string }
  | { kind: "file"; name: string; type?: string; description?: string; file: File };

// Story 11.3 (closes the Story 1.1 deferred-work entry for FlowableTaskForm).
// Per the Flowable FormProperty contract, `type` is a curated union; the
// trailing `string` keeps unknown engine-extension types type-checking so
// the form panel can fall through to a text-input render.
export interface FlowableFormProperty {
  id: string;
  name?: string;
  type: "string" | "long" | "double" | "enum" | "date" | "boolean" | string;
  value?: string;
  required?: boolean;
  readable?: boolean;
  writable?: boolean;
  enumValues?: Array<string | { id?: string; name?: string }>;
}

export interface FlowableTaskForm {
  formKey?: string;
  formProperties?: FlowableFormProperty[];
}

// Story 24.1: Flowable batch operations DTO (FR-53). Permissive optional
// fields — engine may omit fields on empty / interim batch shapes; downstream
// callers cast via `Loose<T>` when consuming non-typed fields. Field names
// match the Flowable REST 7.x response keys verbatim.
export interface FlowableBatch {
  id: string;
  type?: string;
  status?: string;
  searchKey?: string;
  searchKey2?: string;
  createTime?: string;
  completeTime?: string;
  batchDocumentJson?: string;
  totalBatchParts?: number;
  succeededBatchParts?: number;
  failedBatchParts?: number;
  completedBatchParts?: number;
  tenantId?: string;
  url?: string;
}

export interface FlowableBatchPart {
  id: string;
  batchId?: string;
  type?: string;
  status?: string;
  scopeId?: string;
  scopeType?: string;
  subScopeId?: string;
  searchKey?: string;
  searchKey2?: string;
  createTime?: string;
  completeTime?: string;
  resultDocumentJson?: string;
  tenantId?: string;
  url?: string;
}

// Story 24.2: Flowable event subscription DTO (FR-54). Surfaces messages,
// signals, and timers a running instance is waiting on. Read-only — Story
// 24.2 ships the list + per-instance panel; no action verbs.
export interface FlowableEventSubscription {
  id: string;
  /** "message" | "signal" | "timer" | "compensate" | "error" | future-shape */
  eventType?: string;
  /** Business-meaningful name (e.g., "payment-confirmed"). Empty for typeless subs. */
  eventName?: string;
  executionId?: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  activityId?: string;
  created?: string;
  tenantId?: string;
  configuration?: string;
  url?: string;
}

export interface FlowableJob {
  id: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  executionId?: string;
  retries: number;
  exceptionMessage?: string;
  dueDate?: string;
  tenantId?: string;
}

export interface FlowableUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tenantId?: string;
}

export interface FlowableGroup {
  id: string;
  name?: string;
  type?: string;
}

export interface FlowableVariable {
  name: string;
  value: unknown;
  type?: string;
  scope?: string;
}

// Story 19.1: PUT-side input DTO for /runtime/process-instances/{id}/variables.
// Distinct from the GET-side FlowableVariable to avoid round-tripping computed
// engine-side fields (e.g. valueUrl on binary types) back through PUT.
export interface FlowableVariableInput {
  name: string;
  value: unknown;
  type?: string;
  scope?: "global" | "local";
}

export interface FlowableResource {
  // Per the live flowable-rest 7.2 response: `id` is the filename
  // (e.g. "Helpdesk.bpmn20.xml") and there is NO `name` field. Earlier DTO
  // versions declared `name: string` — that field never existed on the wire.
  id: string;
  mediaType: string;
  type?: string;
  url?: string;
  contentUrl?: string;
}

// Story 15.3: typed input variable shape for POST /dmn-rule/execute.
export interface FlowableDecisionExecutionInputVariable {
  name: string;
  type?: "string" | "number" | "long" | "double" | "boolean" | "date" | "json" | string;
  value: unknown;
}

export interface ExecuteDecisionBody {
  decisionKey: string;
  inputVariables: FlowableDecisionExecutionInputVariable[];
  parentDeploymentId?: string;
}

// Per the live Flowable 7.2 DMN-rule/execute response, `resultVariables` is
// an Array<Array<{name, type, value}>> — the OUTER array is one entry per
// result row (for COLLECT / RULE_ORDER hit policies; length 1 for
// UNIQUE / FIRST), the INNER array carries the typed output variables.
// The engine does NOT surface matchedRules over the REST API — Story 15.3's
// defensive widening assumed it might; live probing showed it never does.
export interface FlowableDecisionResultVariable {
  name: string;
  // Flowable emits the engine-side type label directly: "string" / "double"
  // / "long" / "boolean" / "date" / "json". Kept open as `string` so future
  // type additions don't break the DTO.
  type: string;
  value: unknown;
}

export interface FlowableDecisionResult {
  resultVariables?: FlowableDecisionResultVariable[][];
  url?: string;
}

export interface FlowableTenant {
  id: string;
  name: string;
}

export interface FlowableDecision {
  id: string;
  key: string;
  name?: string;
  version: number;
  deploymentId: string;
  category?: string;
  tenantId?: string;
}

// Story 15.4: historic decision-execution DTO. All fields defensive
// (every new field optional) per the Epic 15 DTO-widening discipline.
// The actual response shape may vary across Flowable versions; the
// renderer treats missing fields as "—".
export interface FlowableHistoricDecisionExecution {
  id: string;
  decisionDefinitionId?: string;
  decisionKey?: string;
  decisionName?: string;
  // Per flowable-rest 7.2 historic-decision-executions response, the process
  // instance id is named `instanceId` (NOT `processInstanceId`) and `failed`
  // (NOT `executionFailed`). The list endpoint does not surface hitPolicy,
  // durationInMillis, inputVariables, or outputVariables — those live on
  // the auditdata endpoint per-execution.
  instanceId?: string | null;
  executionId?: string | null;
  activityId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  deploymentId?: string;
  decisionVersion?: string;
  startTime?: string;
  endTime?: string;
  failed?: boolean;
  tenantId?: string;
}

// Per-execution audit response from
// `/dmn-history/historic-decision-executions/{id}/auditdata`. Far richer
// than the list row — surfaces the hit policy, typed input/result maps,
// and the per-rule execution trace (which rule fired, condition+conclusion
// results). Every field defensive (optional) because Flowable versions
// vary on which fields are present.
export interface FlowableDmnRuleConditionResult {
  id?: string;
  result?: unknown;
}
export interface FlowableDmnRuleExecution {
  ruleNumber?: number;
  startTime?: string;
  endTime?: string;
  valid?: boolean;
  conditionResults?: FlowableDmnRuleConditionResult[];
  conclusionResults?: FlowableDmnRuleConditionResult[];
}
export interface FlowableDmnExecutionAudit {
  decisionKey?: string;
  decisionName?: string;
  decisionVersion?: number;
  hitPolicy?: string;
  startTime?: string;
  endTime?: string;
  inputVariables?: Record<string, unknown>;
  inputVariableTypes?: Record<string, string>;
  // decisionResult is an array of result rows (one per matched rule for
  // COLLECT / RULE_ORDER / OUTPUT_ORDER; length 1 for UNIQUE / FIRST).
  decisionResult?: Array<Record<string, unknown>>;
  decisionResultTypes?: Record<string, string>;
  multipleResults?: boolean;
  // Keyed by rule number as a string ("1", "2", …).
  ruleExecutions?: Record<string, FlowableDmnRuleExecution>;
  failed?: boolean;
  strictMode?: boolean;
}

// Historic equivalents — UI shape is close to the runtime DTOs.
export interface FlowableHistoricProcessInstance extends FlowableProcessInstance {
  endTime?: string;
  durationInMillis?: number;
}

export interface FlowableHistoricActivity {
  id: string;
  activityId: string;
  activityName?: string;
  activityType: string;
  processInstanceId?: string;
  startTime: string;
  endTime?: string;
  durationInMillis?: number;
}

// Flowable 7.x returns historic variables with the variable payload nested
// under a `variable` object — `{id, processInstanceId, taskId, executionId,
// variable: {name, type, value, scope}}` — NOT flattened with top-level
// `variableName` / `variableType` like the runtime variable endpoint
// (`/runtime/process-instances/{id}/variables`). Operator-side render code
// must read `entry.variable.name` / `entry.variable.type` / `entry.variable.value`.
// See RC-12 in docs/runtime-caveats.md.
export interface FlowableHistoricVariableValue {
  name: string;
  type?: string;
  value: unknown;
  scope?: string;
}

export interface FlowableHistoricVariable {
  id: string;
  variable: FlowableHistoricVariableValue;
  processInstanceId?: string;
  taskId?: string;
  executionId?: string;
}

export interface FlowableHistoricTask extends FlowableTask {
  endTime?: string;
  durationInMillis?: number;
}
