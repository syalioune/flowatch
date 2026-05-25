// SPDX-License-Identifier: Apache-2.0

/**
 * Flowable REST API client — single request() funnel.
 *
 * Per ADR-001: TypeScript strict (noUncheckedIndexedAccess, exactOptionalPropertyTypes).
 * Per Pattern P-001: every Flowable REST call MUST go through request() in this file.
 *   Components and screens never call fetch() directly — bypassing this funnel makes
 *   the ApiInspector go blind (Pattern P-001 enforcement).
 * Per Pattern P-003: errors propagate verbatim — request() throws FlowableError with
 *   the engine response body as .message and the HTTP status as .status. Callers
 *   render err.message directly in <ErrorBox/> with no friendly rewrites.
 * Per Pattern P-004: DMN endpoints live under /flowable-rest/dmn-api (not /service)
 *   — every DMN wrapper passes { base: dmnBase() }.
 *
 * The single exception to P-001 is uploadDeployment() (multipart FormData) which
 * builds the request manually but still pushes to API_LOG and dispatches api:log.
 * See ADR-001 / P-001 / P-003 / P-004 in _bmad-output/planning-artifacts/architecture.md.
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

export interface FlowableDecisionResult {
  resultVariables?: Record<string, unknown>;
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

export interface FlowableHistoricVariable {
  id: string;
  variableName: string;
  variableType?: string;
  value: unknown;
  processInstanceId?: string;
  taskId?: string;
}

export interface FlowableHistoricTask extends FlowableTask {
  endTime?: string;
  durationInMillis?: number;
}

// ── Config + storage ──────────────────────────────────────────────────────

const STORAGE_KEY = "flowatch.connection.v1";
const defaultCfg: FlowableConfig = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
};
export const loadCfg = (): FlowableConfig => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultCfg, ...JSON.parse(raw) } : { ...defaultCfg };
  } catch {
    return { ...defaultCfg };
  }
};
const saveCfg = (cfg: FlowableConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* localStorage may be unavailable (private mode, quota) */
  }
};

let cfg: FlowableConfig = loadCfg();

// Flowable splits its REST API across sub-apps. The BPMN/runtime/identity endpoints
// live under `/flowable-rest/service`, but DMN is mounted at `/flowable-rest/dmn-api`.
// We derive the DMN root from the configured base URL.
const dmnBase = (): string => cfg.baseUrl.replace(/\/service\/?$/, "/dmn-api");

export const API_LOG: ApiLogEntry[] = [];
const MAX_LOG = 60;
const logCall = (entry: ApiLogEntry): void => {
  API_LOG.unshift(entry);
  if (API_LOG.length > MAX_LOG) API_LOG.length = MAX_LOG;
  window.dispatchEvent(new CustomEvent<ApiLogEntry>("api:log", { detail: entry }));
};

// NFR-8: scheme-preserving redaction of the Authorization header before the
// entry lands in API_LOG. Splits on the first space so "Basic <base64>" becomes
// "Basic ***" and a future "Bearer <jwt>" becomes "Bearer ***". The clone via
// spread is what makes this safe — the headers object passed to fetch() is
// never mutated; only the captured copy is.
function redactAuthHeader(headers: Record<string, string>): Record<string, string> {
  const out = { ...headers };
  if (out.Authorization) {
    const space = out.Authorization.indexOf(" ");
    out.Authorization = space > 0 ? `${out.Authorization.slice(0, space)} ***` : "***";
  }
  return out;
}

// Epic 9 retro A-3 (Story 10.2): body byte-budget guard. The Inspector's
// previewBody synchronously JSON.stringifies entry.body on click; a 100 KB
// variables blob from startProcessInstance would lock the main thread. We
// truncate at capture time so the ring buffer's memory footprint is bounded
// and the drawer's preview stays interactive. Bodies whose stringified form
// throws (circular refs, BigInt, throwing toJSON) pass through unchanged —
// the render-time fallback in previewBody handles those.
export const BODY_BYTE_BUDGET = 16 * 1024;

export interface TruncatedBody {
  __truncated: true;
  __originalBytes: number;
  __preview: string;
}

export const captureBody = (body: unknown): unknown => {
  try {
    const json = JSON.stringify(body);
    if (json === undefined) return body;
    if (json.length <= BODY_BYTE_BUDGET) return body;
    const envelope: TruncatedBody = {
      __truncated: true,
      __originalBytes: json.length,
      __preview: json.slice(0, BODY_BYTE_BUDGET),
    };
    return envelope;
  } catch {
    return body;
  }
};

// Dev-only seed hook: lets Playwright visual tests inject deterministic API_LOG
// entries without going through the real request() funnel. Guarded by Vite's
// DEV flag so production bundles never expose it. (Story 2.4 / Path B.)
if (import.meta.env.DEV && typeof window !== "undefined") {
  const w = window as unknown as {
    __flowatchSeedApiLog?: (entries: ApiLogEntry[]) => void;
    __flowatchClearApiLog?: () => void;
  };
  w.__flowatchSeedApiLog = (entries) => {
    for (const entry of entries) {
      API_LOG.unshift(entry);
      if (API_LOG.length > MAX_LOG) API_LOG.length = MAX_LOG;
      window.dispatchEvent(new CustomEvent<ApiLogEntry>("api:log", { detail: entry }));
    }
  };
  w.__flowatchClearApiLog = () => {
    API_LOG.length = 0;
    // Use a distinct event so listeners can react to the clear without
    // mistaking a synthetic blank entry for a real API call. ApiInspector
    // subscribes to both events and re-reads API_LOG on either signal.
    window.dispatchEvent(new Event("api:log-cleared"));
  };
}

const qs = (params?: QueryParams): string => {
  if (!params) return "";
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.append(k, String(v));
  });
  const s = usp.toString();
  return s ? "?" + s : "";
};

const basicAuth = (): string => "Basic " + btoa(`${cfg.username}:${cfg.password}`);

// ── request() funnel ─────────────────────────────────────────────────────
//
// Generic over T (the JSON response shape). Wrappers that opt into raw text
// pin T = string at the call site (see getProcessDefinitionResource,
// getDmnResource, jobStacktrace). Per AC-3, the runtime guarantees the
// declared T matches when opts.raw is true.

async function request<T = unknown>(
  method: HTTPMethod,
  path: string,
  opts: RequestOpts = {},
): Promise<T> {
  const { params, body, base, raw, asResponse } = opts;
  const root = (base || cfg.baseUrl).replace(/\/$/, "");
  const url = root + path + qs(params);
  const t0 = performance.now();
  const entry: ApiLogEntry = {
    id: Math.random().toString(36).slice(2, 9),
    method,
    path: path + qs(params),
    url,
    status: 0,
    ms: 0,
    at: new Date().toISOString(),
  };

  try {
    const headers: Record<string, string> = {
      Authorization: basicAuth(),
      Accept: raw ? "*/*" : "application/json",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }
    const init: RequestInit = { method, headers };
    // Per AC-2/AC-6/AC-7: redact the Authorization header on the captured
    // copy before any further work so success, 4xx, 5xx, network-error, AND
    // body-serialization-error (circular ref, BigInt, throwing toJSON) paths
    // all surface the redacted form in API_LOG. The `headers` object handed
    // to fetch() is untouched — redactAuthHeader clones via spread.
    entry.headers = redactAuthHeader(headers);
    if (body) {
      init.body = JSON.stringify(body);
      // Per Story 8.1 AC-3 + Story 10.2 A-3: capture the original JS value
      // (not the stringified form) so the Inspector can pretty-print, but
      // truncate at capture time when the stringified form exceeds the
      // byte budget. Note: entry.body and init.body diverge above the
      // budget — init.body always carries the real bytes sent on the
      // wire; entry.body may carry the truncated envelope. The Inspector's
      // "Copy as curl" surfaces entry.body and therefore the envelope on
      // oversized requests — accepted (a 100 KB clipboard isn't useful).
      entry.body = captureBody(body);
    }
    const res = await fetch(url, init);
    entry.status = res.status;
    entry.ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      entry.error = text || `HTTP ${res.status}`;
      logCall(entry);
      throw new FlowableError(entry.error, res.status);
    }
    // Story 9.6: when asResponse is set, log the entry and hand the caller the
    // raw Response so they pick the body method (.blob() for binary, .text()
    // for XML, etc.). NFR-8 is preserved — entry.body stays undefined; the
    // response bytes never enter API_LOG.
    if (asResponse) {
      logCall(entry);
      return res as unknown as T;
    }
    const data: T = raw
      ? ((await res.text()) as unknown as T)
      : res.headers.get("content-type")?.includes("application/json")
        ? ((await res.json()) as T)
        : ((await res.text()) as unknown as T);
    logCall(entry);
    return data;
  } catch (err) {
    if (entry.status === 0) {
      entry.error = err instanceof Error ? err.message : String(err);
      entry.ms = Math.round(performance.now() - t0);
      logCall(entry);
    }
    throw err;
  }
}

// ── Repository (BPMN) ─────────────────────────────────────────────────────
const listDeployments = (params?: QueryParams) =>
  request<FlowablePage<FlowableDeployment>>("GET", "/repository/deployments", { params });
const getDeployment = (id: string) =>
  request<FlowableDeployment>("GET", `/repository/deployments/${id}`);
const createDeployment = (form: unknown) =>
  request<FlowableDeployment>("POST", "/repository/deployments", { body: form });
const deleteDeployment = (id: string, cascade?: boolean) =>
  request<void>(
    "DELETE",
    `/repository/deployments/${id}`,
    cascade ? { params: { cascade: true } } : {},
  );
const listDeploymentResources = (id: string) =>
  request<FlowableResource[]>("GET", `/repository/deployments/${id}/resources`);
// Story 9.6: binary download path. Returns the raw Response so callers pick
// the body method (.blob() for octet-stream, .text() for XML). Mirrors
// getProcessDefinitionResource but at the deployment-resource level.
const getDeploymentResource = (deploymentId: string, resourceName: string) =>
  request<Response>(
    "GET",
    `/repository/deployments/${deploymentId}/resourcedata/${encodeURIComponent(resourceName)}`,
    { asResponse: true },
  );
const listProcessDefinitions = (params?: QueryParams) =>
  request<FlowablePage<FlowableProcessDefinition>>("GET", "/repository/process-definitions", {
    params,
  });
const getProcessDefinition = (id: string) =>
  request<FlowableProcessDefinition>("GET", `/repository/process-definitions/${id}`);
const suspendProcessDefinition = (id: string, suspend: boolean) =>
  request<FlowableProcessDefinition>("PUT", `/repository/process-definitions/${id}`, {
    body: { action: suspend ? "suspend" : "activate" },
  });
const getProcessDefinitionResource = (id: string): Promise<string> =>
  request<string>("GET", `/repository/process-definitions/${id}/resourcedata`, { raw: true });

// ── Runtime ───────────────────────────────────────────────────────────────
const listProcessInstances = (params?: QueryParams) =>
  request<FlowablePage<FlowableProcessInstance>>("GET", "/runtime/process-instances", { params });
const getProcessInstance = (id: string) =>
  request<FlowableProcessInstance>("GET", `/runtime/process-instances/${id}`);
const startProcessInstance = (body: Record<string, unknown>) =>
  request<FlowableProcessInstance>("POST", "/runtime/process-instances", { body });
const deleteProcessInstance = (id: string, reason?: string) =>
  request<void>(
    "DELETE",
    `/runtime/process-instances/${id}`,
    reason ? { params: { deleteReason: reason } } : {},
  );
const getProcessInstanceVariables = (id: string) =>
  request<FlowableVariable[]>("GET", `/runtime/process-instances/${id}/variables`);
const listTasks = (params?: QueryParams) =>
  request<FlowablePage<FlowableTask>>("GET", "/runtime/tasks", { params });
const getTask = (id: string) => request<FlowableTask>("GET", `/runtime/tasks/${id}`);
const taskAction = (taskId: string, action: string, body?: Record<string, unknown>) =>
  request<FlowableTask>("POST", `/runtime/tasks/${taskId}`, { body: { action, ...(body ?? {}) } });
const getTaskVariables = (taskId: string) =>
  request<FlowableVariable[]>("GET", `/runtime/tasks/${taskId}/variables`);

// ── Form ──────────────────────────────────────────────────────────────────
const getTaskForm = (taskId: string) =>
  request<FlowableTaskForm>("GET", "/form/form-data", { params: { taskId } });
// Story 11.3: body shape is `{ taskId, properties }` per the Flowable contract;
// `properties` is an array of `{ id, value }` envelopes (value is always a
// string at the wire — booleans become "true" / "false"; numbers serialise
// via their JS string form).
const submitTaskForm = (
  taskId: string,
  body: { properties: Array<{ id: string; value: string }> },
) => request<FlowableTaskForm>("POST", "/form/form-data", { body: { taskId, ...body } });

// ── Management ───────────────────────────────────────────────────────────
const listJobs = (params?: QueryParams) =>
  request<FlowablePage<FlowableJob>>("GET", "/management/jobs", { params });
const getJob = (id: string) => request<FlowableJob>("GET", `/management/jobs/${id}`);
const listTimerJobs = (params?: QueryParams) =>
  request<FlowablePage<FlowableJob>>("GET", "/management/timer-jobs", { params });
const listDeadLetterJobs = (params?: QueryParams) =>
  request<FlowablePage<FlowableJob>>("GET", "/management/deadletter-jobs", { params });
const executeJob = (id: string) =>
  request<void>("POST", `/management/jobs/${id}`, { body: { action: "execute" } });
// Timer-job IDs live in a different namespace than executable-job IDs in
// Flowable 7.x — a POST to /management/jobs/{timerId} returns 404, and the
// timer-jobs endpoint only accepts `move` or `reschedule` (NOT `execute`).
// The supported "fire timer now" recipe is `move` (queues to executable;
// the async executor picks it up on its next poll). The handler-side label
// "Execute now" reflects the operator-feel; the wire-level verb is `move`.
const executeTimerJob = (id: string) =>
  request<void>("POST", `/management/timer-jobs/${id}`, { body: { action: "move" } });
// Reschedule a timer job to a new dueDate (Flowable 7.x action verb). The
// payload key is `dueDate` per the engine contract; format is ISO-8601.
const rescheduleTimerJob = (id: string, dueDate: string) =>
  request<FlowableJob>("POST", `/management/timer-jobs/${id}`, {
    body: { action: "reschedule", dueDate },
  });
const moveDeadLetterJob = (id: string) =>
  request<FlowableJob>("POST", `/management/deadletter-jobs/${id}`, { body: { action: "move" } });
const jobStacktrace = (id: string): Promise<string> =>
  request<string>("GET", `/management/jobs/${id}/exception-stacktrace`, { raw: true });
// Timer / dead-letter jobs live in separate namespaces — their stacktrace
// endpoints are NOT under /management/jobs/{id}. Mirrors the executeJob /
// executeTimerJob / moveDeadLetterJob namespace separation.
const timerJobStacktrace = (id: string): Promise<string> =>
  request<string>("GET", `/management/timer-jobs/${id}/exception-stacktrace`, { raw: true });
const deadLetterJobStacktrace = (id: string): Promise<string> =>
  request<string>("GET", `/management/deadletter-jobs/${id}/exception-stacktrace`, { raw: true });

// ── History ──────────────────────────────────────────────────────────────
const listHistoricInstances = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricProcessInstance>>(
    "GET",
    "/history/historic-process-instances",
    { params },
  );
// Story 13.1: per-id GET for the historic detail panel — the runtime sibling
// is api.getProcessInstance. Returns the same DTO as items in the list
// response (Flowable's historic surface re-uses the shape).
const getHistoricProcessInstance = (id: string) =>
  request<FlowableHistoricProcessInstance>("GET", `/history/historic-process-instances/${id}`);
const listHistoricActivities = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricActivity>>("GET", "/history/historic-activity-instances", {
    params,
  });
const listHistoricVariables = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricVariable>>("GET", "/history/historic-variable-instances", {
    params,
  });
const listHistoricTasks = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricTask>>("GET", "/history/historic-task-instances", {
    params,
  });

// ── Identity ─────────────────────────────────────────────────────────────
const listUsers = (params?: QueryParams) =>
  request<FlowablePage<FlowableUser>>("GET", "/identity/users", { params });
const getUser = (id: string) => request<FlowableUser>("GET", `/identity/users/${id}`);
const listGroups = (params?: QueryParams) =>
  request<FlowablePage<FlowableGroup>>("GET", "/identity/groups", { params });
const getGroup = (id: string) => request<FlowableGroup>("GET", `/identity/groups/${id}`);
const getUserGroups = (userId: string) =>
  request<FlowablePage<FlowableGroup>>("GET", `/identity/users/${userId}/groups`);
const addUserToGroup = (userId: string, groupId: string) =>
  request<void>("POST", `/identity/users/${userId}/groups`, { body: { groupId } });

// Tenants are not exposed as a dedicated endpoint in flowable-rest 7.2.
// Derive distinct tenantIds from deployments (truthy values only).
const listTenants = async (): Promise<{ data: FlowableTenant[] }> => {
  const res = await listDeployments({ size: 1000 });
  const ids = new Set<string>();
  (res?.data || []).forEach((d) => {
    if (d.tenantId) ids.add(d.tenantId);
  });
  return { data: [...ids].map((id) => ({ id, name: id })) };
};

// ── DMN (mounted under /flowable-rest/dmn-api, not /service) ─────────────
const listDecisions = (params?: QueryParams) =>
  request<FlowablePage<FlowableDecision>>("GET", "/dmn-repository/decisions", {
    params,
    base: dmnBase(),
  });
const listDmnDeployments = (params?: QueryParams) =>
  request<FlowablePage<FlowableDeployment>>("GET", "/dmn-repository/deployments", {
    params,
    base: dmnBase(),
  });
const executeDecision = (body: Record<string, unknown>) =>
  request<FlowableDecisionResult>("POST", "/dmn-rule/execute", { body, base: dmnBase() });
const getDmnResource = (deploymentId: string, resourceId: string): Promise<string> =>
  request<string>("GET", `/dmn-repository/deployments/${deploymentId}/resourcedata/${resourceId}`, {
    raw: true,
    base: dmnBase(),
  });

// ── Deployment helpers (multipart upload) ────────────────────────────────
// Flowable expects multipart/form-data, not the JSON-with-base64 shape we used
// in mock mode. We build a FormData and send via raw fetch (bypassing request()
// because the body is non-JSON), but still log the call.
interface UploadOpts {
  base?: string;
  deploymentName?: string;
}
const uploadDeployment = async (
  filename: string,
  content: string,
  type: string,
  opts: UploadOpts = {},
): Promise<FlowableDeployment> => {
  const root = (opts.base || cfg.baseUrl).replace(/\/$/, "");
  const url = root + "/repository/deployments";
  const t0 = performance.now();
  const entry: ApiLogEntry = {
    id: Math.random().toString(36).slice(2, 9),
    method: "POST",
    path: "/repository/deployments",
    url,
    status: 0,
    ms: 0,
    at: new Date().toISOString(),
  };
  try {
    // Multipart setup lives inside the try (Story 9.2, AC-7). FormData /
    // Blob constructors and redactAuthHeader CAN throw — moving them inside
    // the try ensures the entry lands in API_LOG with status=0 + the
    // engine-visible error message even on these "throw before fetch" paths.
    // Closes the Story 8.1 deferred-work item.
    const fd = new FormData();
    fd.append("file", new Blob([content], { type }), filename);
    if (cfg.tenantId) fd.append("tenantId", cfg.tenantId);
    if (opts.deploymentName) fd.append("deploymentName", opts.deploymentName);

    // Multipart uploads don't set Content-Type — fetch derives it from FormData.
    // We mirror that in the captured headers (Authorization only), per AC-3.
    const uploadHeaders: Record<string, string> = { Authorization: basicAuth() };
    entry.headers = redactAuthHeader(uploadHeaders);
    const res = await fetch(url, {
      method: "POST",
      headers: uploadHeaders,
      body: fd,
    });
    entry.status = res.status;
    entry.ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      entry.error = text || `HTTP ${res.status}`;
      logCall(entry);
      throw new FlowableError(entry.error, res.status);
    }
    logCall(entry);
    return (await res.json()) as FlowableDeployment;
  } catch (err) {
    if (entry.status === 0) {
      entry.error = err instanceof Error ? err.message : String(err);
      entry.ms = Math.round(performance.now() - t0);
      logCall(entry);
    }
    throw err;
  }
};

const deployBpmn = (name: string, xml: string) =>
  uploadDeployment(name, xml, "application/xml", { deploymentName: name });
const deployDmn = (name: string, xml: string) =>
  uploadDeployment(name, xml, "application/xml", { deploymentName: name, base: dmnBase() });

const ping = () => request<FlowableEngineInfo>("GET", "/management/engine");

// Send an ad-hoc request from the API Inspector "Try it" panel.
// Path may include a query string; DMN sub-app paths (/dmn-*) are auto-rerouted.
const runRaw = (method: HTTPMethod, path: string, body?: unknown) => {
  const base = path.startsWith("/dmn-") ? dmnBase() : undefined;
  const opts: RequestOpts = {};
  if (base !== undefined) opts.base = base;
  if (body !== undefined) opts.body = body;
  return request<unknown>(method, path, opts);
};

export const api = {
  config: (): FlowableConfig => ({ ...cfg }),
  setConfig: (next: Partial<FlowableConfig>): void => {
    // Per AC-5 the re-probe fires when the *connection* changes — baseUrl,
    // username, or password. Tenant-only updates (e.g. Topbar's cycleTenant
    // or SettingsModal's Test button before Save) must not flash the conn
    // pill or trigger a redundant /management/engine round-trip.
    const connectionChanged =
      (next.baseUrl !== undefined && next.baseUrl !== cfg.baseUrl) ||
      (next.username !== undefined && next.username !== cfg.username) ||
      (next.password !== undefined && next.password !== cfg.password);
    cfg = { ...cfg, ...next };
    saveCfg(cfg);
    if (connectionChanged) {
      window.dispatchEvent(new CustomEvent("conn:config-changed"));
    }
  },
  log: (): ApiLogEntry[] => [...API_LOG],
  // BPMN repository
  listDeployments,
  getDeployment,
  createDeployment,
  deleteDeployment,
  listDeploymentResources,
  getDeploymentResource,
  listProcessDefinitions,
  getProcessDefinition,
  suspendProcessDefinition,
  getProcessDefinitionResource,
  // Runtime
  listProcessInstances,
  getProcessInstance,
  startProcessInstance,
  deleteProcessInstance,
  getProcessInstanceVariables,
  listTasks,
  getTask,
  taskAction,
  getTaskVariables,
  // Form
  getTaskForm,
  submitTaskForm,
  // Management
  listJobs,
  getJob,
  listTimerJobs,
  listDeadLetterJobs,
  executeJob,
  executeTimerJob,
  rescheduleTimerJob,
  moveDeadLetterJob,
  jobStacktrace,
  timerJobStacktrace,
  deadLetterJobStacktrace,
  // History
  listHistoricInstances,
  getHistoricProcessInstance,
  listHistoricActivities,
  listHistoricVariables,
  listHistoricTasks,
  // Identity
  listUsers,
  getUser,
  listGroups,
  getGroup,
  getUserGroups,
  addUserToGroup,
  listTenants,
  // DMN
  listDecisions,
  listDmnDeployments,
  executeDecision,
  getDmnResource,
  deployBpmn,
  deployDmn,
  ping,
  runRaw,
};
