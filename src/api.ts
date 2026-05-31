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

// ── Type vocabulary + DTOs ────────────────────────────────────────────────
//
// Extracted to src/api-types.ts at Story 21.x to satisfy the 50 KB NFR-21
// navigability limit. Every symbol is re-exported below so existing
// `import { FlowableTask } from "../api"` call sites resolve unchanged.

export type {
  AddAttachmentPayload,
  ApiLogEntry,
  ExecuteDecisionBody,
  FlowableAttachment,
  FlowableConfig,
  FlowableDecision,
  FlowableDecisionExecutionInputVariable,
  FlowableDecisionResult,
  FlowableDecisionResultVariable,
  FlowableDeployment,
  FlowableDmnExecutionAudit,
  FlowableDmnRuleConditionResult,
  FlowableDmnRuleExecution,
  FlowableEngineInfo,
  FlowableFormProperty,
  FlowableGroup,
  FlowableHistoricActivity,
  FlowableHistoricDecisionExecution,
  FlowableHistoricProcessInstance,
  FlowableHistoricTask,
  FlowableHistoricVariable,
  FlowableHistoricVariableValue,
  FlowableJob,
  FlowablePage,
  FlowableProcessDefinition,
  FlowableProcessInstance,
  FlowableResource,
  FlowableTask,
  FlowableTaskForm,
  FlowableTenant,
  FlowableUser,
  FlowableVariable,
  FlowableVariableInput,
  HTTPMethod,
  QueryParams,
  RequestOpts,
} from "./api-types";
export { FlowableError } from "./api-types";

import type {
  AddAttachmentPayload,
  ApiLogEntry,
  ExecuteDecisionBody,
  FlowableAttachment,
  FlowableConfig,
  FlowableDecision,
  FlowableDecisionResult,
  FlowableDeployment,
  FlowableDmnExecutionAudit,
  FlowableEngineInfo,
  FlowableHistoricActivity,
  FlowableHistoricDecisionExecution,
  FlowableHistoricProcessInstance,
  FlowableHistoricTask,
  FlowableHistoricVariable,
  FlowableJob,
  FlowablePage,
  FlowableProcessDefinition,
  FlowableProcessInstance,
  FlowableResource,
  FlowableTask,
  FlowableTaskForm,
  FlowableTenant,
  FlowableVariable,
  FlowableVariableInput,
  HTTPMethod,
  QueryParams,
  RequestOpts,
} from "./api-types";
import { FlowableError } from "./api-types";

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

// Shared multipart POST envelope used by `uploadDeployment` (Story 9.2) and
// `addTaskAttachment` file path (Story 21.2). Bypasses `request()` because the
// body is FormData (non-JSON) but logs via API_LOG identically. `buildFd` is a
// callback so FormData / Blob constructor throws land in the API_LOG entry
// with status=0 (Story 9.2 AC-7 + Story 8.1 deferred-work closure). Returns
// the raw Response — caller parses via `.json()`.
const multipartFetch = async (
  root: string,
  path: string,
  buildFd: () => FormData,
): Promise<Response> => {
  const url = root.replace(/\/$/, "") + path;
  const t0 = performance.now();
  const entry: ApiLogEntry = {
    id: Math.random().toString(36).slice(2, 9),
    method: "POST",
    path,
    url,
    status: 0,
    ms: 0,
    at: new Date().toISOString(),
  };
  try {
    const fd = buildFd();
    const headers: Record<string, string> = { Authorization: basicAuth() };
    entry.headers = redactAuthHeader(headers);
    const res = await fetch(url, { method: "POST", headers, body: fd });
    entry.status = res.status;
    entry.ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      entry.error = text || `HTTP ${res.status}`;
      logCall(entry);
      throw new FlowableError(entry.error, res.status);
    }
    logCall(entry);
    return res;
  } catch (err) {
    if (entry.status === 0) {
      entry.error = err instanceof Error ? err.message : String(err);
      entry.ms = Math.round(performance.now() - t0);
      logCall(entry);
    }
    throw err;
  }
};

// ── request() funnel ─────────────────────────────────────────────────────
//
// Generic over T (the JSON response shape). Wrappers that opt into raw text
// pin T = string at the call site (see getProcessDefinitionResource,
// getDmnDecisionResource, jobStacktrace). Per AC-3, the runtime guarantees
// the declared T matches when opts.raw is true.

export async function request<T = unknown>(
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
/**
 * Story 20.1 + RC-16 workaround: read a process definition via the LIST
 * endpoint so the response reflects the DB-persisted `category` (and any
 * other field the single-GET serves from its BPMN-model cache).
 *
 * Flowable 7.2.0 GET /repository/process-definitions/{id} returns
 * `category` from the BPMN model cache (populated at deploy from the BPMN
 * file's <targetNamespace>); the DB-persisted `act_re_procdef.category_`
 * column — updated by `updateProcessDefinition` — is ignored. The LIST
 * endpoint reads `category_` directly, so the post-edit value surfaces
 * here. Engine `id`/`processDefinitionId` filters are silently ignored on
 * the LIST endpoint; we filter by `key` (extracted from the engine's
 * `key:version:UUID` id format) and JS-filter by id. The wrapper falls
 * through to the single-GET if the list doesn't surface the id (defensive;
 * should never happen for a deployed definition).
 *
 * Used by the /definitions/$id route loader so the detail page reflects
 * the operator's edit. Other consumers of `getProcessDefinition` (single
 * call) are unchanged; the wire-level contract there is documented per RC-16.
 */
const getProcessDefinitionFresh = async (id: string): Promise<FlowableProcessDefinition> => {
  const [key] = id.split(":");
  const page = await request<FlowablePage<FlowableProcessDefinition>>(
    "GET",
    "/repository/process-definitions",
    { params: { key, size: 200 } },
  );
  const found = page.data.find((d) => d.id === id);
  if (found) return found;
  return request<FlowableProcessDefinition>("GET", `/repository/process-definitions/${id}`);
};
const suspendProcessDefinition = (id: string, suspend: boolean) =>
  request<FlowableProcessDefinition>("PUT", `/repository/process-definitions/${id}`, {
    body: { action: suspend ? "suspend" : "activate" },
  });
/**
 * Story 20.1: edit fields on a process definition (currently: `category`).
 *
 * Funnels `PUT /repository/process-definitions/{id}` through `request()` with
 * a partial-fields body (e.g. `{category: "finance"}`). The engine accepts
 * `{category: ""}` to clear the value (revert to default per docs/compat.md
 * line 149). Verified live on flowable-rest 7.2.0 per docs/compat.md FR-43.
 *
 * Endpoint-duality with `suspendProcessDefinition` (Story 9.4): both wrappers
 * PUT to the SAME wire URL but the engine discriminates by body shape:
 *   - `{action: "suspend" | "activate"}` → suspend / activate path
 *   - `{category: "…"}`                  → field-update path
 * Per CLAUDE.md "Operator-feel UI labels can diverge from wire-level action
 * verbs" (Story 12.2 codification), the two operator-feel actions get distinct
 * wrappers even though they share a URL. The `fields` parameter shape allows
 * future Epic 21 / 22 field extensions (name, description, …) to land as a
 * type-level addition rather than a wrapper-signature churn.
 *
 * Engine response: `200 OK` with the full FlowableProcessDefinition body
 * echoed back (confirmed in T-10 live probe per spec AC-13).
 */
const updateProcessDefinition = (id: string, fields: Partial<{ category: string }>) => {
  // Empty body collides with the suspend/activate body discriminator on the same URL.
  if (Object.keys(fields).length === 0)
    throw new Error("updateProcessDefinition requires at least one field");
  return request<FlowableProcessDefinition>("PUT", `/repository/process-definitions/${id}`, {
    body: fields,
  });
};
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
/**
 * Story 19.1: edit/add runtime variables on a running process instance.
 *
 * PUT body is ALWAYS an array — even single-variable edits pass
 * `[{name, value, type, scope}]`. The engine returns 201 Created with a
 * JSON-array body echoing each variable (see docs/runtime-caveats.md RC-15
 * — every entry carries `scope: "local"` regardless of input; the GET-side
 * read shows the actual persisted scope). The wrapper ignores the response
 * body via `request<void>`; callers read state via the GET endpoint.
 * 4xx errors come back as JSON `{"message":"Bad request","exception":"..."}`
 * and are surfaced verbatim through ErrorBox per Pattern P-003. Verified
 * live on flowable-rest 7.2.0 per docs/compat.md FR-19.
 *
 * The wrapper drops `scope: "global"` from the body — the engine treats an
 * absent scope as global; only an explicit `scope: "local"` targets the
 * current execution. Sending it both ways works (idempotent on global) but
 * the minimum-wire convention matches Flowable's documented contract.
 */
const updateInstanceVariables = (instanceId: string, vars: FlowableVariableInput[]) => {
  const body = vars.map((v) => {
    const out: FlowableVariableInput = { name: v.name, value: v.value };
    if (v.type !== undefined) out.type = v.type;
    if (v.scope === "local") out.scope = "local";
    return out;
  });
  return request<void>("PUT", `/runtime/process-instances/${instanceId}/variables`, { body });
};
/**
 * Story 19.2: delete a single runtime variable by name from a running
 * process instance.
 *
 * Funnels `DELETE /runtime/process-instances/{id}/variables/{name}` through
 * `request()`. The variable name is `encodeURIComponent`-wrapped — variable
 * names may contain periods, slashes, spaces, or unicode characters (e.g.
 * `my.nested.key`, `with spaces`); without encoding, `foo/bar` would route
 * to a different endpoint. Verified live on flowable-rest 7.2.0 per
 * docs/compat.md FR-19 (the raw probe at line 150 deleted a variable named
 * `probe` and reverted cleanly).
 *
 * Engine response on success: `204 No Content`. 4xx (e.g. variable doesn't
 * exist) propagates verbatim through `<ErrorBox>` per Pattern P-003.
 */
const deleteInstanceVariable = (instanceId: string, name: string) =>
  request<void>(
    "DELETE",
    `/runtime/process-instances/${instanceId}/variables/${encodeURIComponent(name)}`,
  );
const listTasks = (params?: QueryParams) =>
  request<FlowablePage<FlowableTask>>("GET", "/runtime/tasks", { params });
const getTask = (id: string) => request<FlowableTask>("GET", `/runtime/tasks/${id}`);
const taskAction = (taskId: string, action: string, body?: Record<string, unknown>) =>
  request<FlowableTask>("POST", `/runtime/tasks/${taskId}`, { body: { action, ...(body ?? {}) } });
/**
 * Story 21.1: edit fields on a runtime task (priority / dueDate / owner /
 * assignee).
 *
 * Funnels `PUT /runtime/tasks/{id}` through `request()` with a partial-fields
 * body (e.g. `{priority: 75, dueDate: null}`). Nullable string + datetime
 * fields use `null` to clear — verified live on flowable-rest 7.2.0 per
 * docs/compat.md FR-44 + the T-9 probe. Empty-string is silently coerced to
 * `null` by the engine; the wrapper sends `null` for clarity.
 *
 * Two-method endpoint duality with `taskAction` (Story 11.x): both wrappers
 * hit the SAME wire URL `/runtime/tasks/{id}`, but discriminated by HTTP
 * method:
 *   - POST {action: "claim" | "complete" | "delegate" | "resolve" | "unclaim"}
 *     → action-verb path (`taskAction`)
 *   - PUT  {<field>: <value>}
 *     → field-patch path (`updateTask`)
 * Per CLAUDE.md "Operator-feel UI labels can diverge from wire-level action
 * verbs" (Story 12.2 codification), the two operator-feel actions get
 * distinct wrappers. The `fields` parameter shape allows future scope
 * extensions (name, description, category, parentTaskId, tenantId per
 * compat.md line 61) to land as a type-level addition without churn.
 *
 * Priority is numeric (Flowable default = 50); the engine accepts 0-100 but
 * the wrapper does NOT pre-validate — operator typos surface as engine 4xx.
 * `dueDate` is ISO-8601 UTC; the caller is responsible for the local→UTC
 * round-trip (see `<EditTaskModal>` + Story 12.2 `<input type="datetime-local">`
 * convention).
 *
 * Engine response: `200 OK` with the echoed FlowableTask body.
 */
const updateTask = (
  id: string,
  fields: Partial<{
    priority: number;
    dueDate: string | null;
    owner: string | null;
    assignee: string | null;
  }>,
) => {
  if (Object.keys(fields).length === 0) throw new Error("updateTask requires at least one field");
  return request<FlowableTask>("PUT", `/runtime/tasks/${id}`, { body: fields });
};
const getTaskVariables = (taskId: string) =>
  request<FlowableVariable[]>("GET", `/runtime/tasks/${taskId}/variables`);

/**
 * Story 21.2: list a runtime task's attachments.
 *
 * Funnels `GET /runtime/tasks/{taskId}/attachments` through `request()`.
 * Response shape: a BARE ARRAY of FlowableAttachment (NOT a paged envelope).
 * Verified live on flowable-rest 7.2.0 per docs/compat.md FR-45.
 */
const listTaskAttachments = (taskId: string) =>
  request<FlowableAttachment[]>("GET", `/runtime/tasks/${taskId}/attachments`);

/**
 * Story 21.2: add an attachment to a runtime task.
 *
 * Discriminated-union payload. The wrapper branches:
 *   - `kind: "url"` → JSON POST through `request()` with body
 *     `{name, description?, type?, externalUrl}`.
 *   - `kind: "file"` → multipart POST that bypasses `request()` (FormData
 *     body) but logs via the same envelope as `uploadDeployment`. Pattern
 *     P-001 is preserved — the manual fetch() is intra-file.
 *
 * Multipart field names per Flowable's documented contract:
 *   `name` / `description` (optional) / `type` (optional MIME) / `content`
 *   (binary). The engine derives `id` / `time` / `userId` server-side.
 *
 * Engine response: `201 Created` (URL path) / `200 OK` (file path —
 * varies per engine version; the wrapper accepts both via res.ok) with
 * the echoed FlowableAttachment body. Verified live on flowable-rest 7.2.0
 * per docs/compat.md FR-45.
 */
/**
 * Story 21.3: fetch the binary content of a task attachment (file-mode only).
 *
 * Returns the raw `Response` so the caller picks the body method
 * (`.blob()` for binary, `.text()` for text). Mirrors `getDeploymentResource`
 * (Story 9.6) at the task-attachment level. URL-mode attachments are
 * opened via their `externalUrl` directly — they do NOT use this wrapper.
 *
 * Engine response: `200 OK` with binary body. Verified live on
 * flowable-rest 7.2.0 per docs/compat.md FR-45.
 */
const getTaskAttachmentContent = (taskId: string, attachmentId: string) =>
  request<Response>("GET", `/runtime/tasks/${taskId}/attachments/${attachmentId}/content`, {
    asResponse: true,
  });

/**
 * Story 21.3: remove a task attachment by id.
 *
 * Funnels `DELETE /runtime/tasks/{taskId}/attachments/{attachmentId}` through
 * `request()`. Symmetric pair with `addTaskAttachment` (Story 21.2).
 *
 * Engine response: `204 No Content`. Verified live on flowable-rest 7.2.0
 * per docs/compat.md FR-45.
 */
const deleteTaskAttachment = (taskId: string, attachmentId: string) =>
  request<void>("DELETE", `/runtime/tasks/${taskId}/attachments/${attachmentId}`);

const addTaskAttachment = async (
  taskId: string,
  payload: AddAttachmentPayload,
): Promise<FlowableAttachment> => {
  if (payload.kind === "url") {
    return request<FlowableAttachment>("POST", `/runtime/tasks/${taskId}/attachments`, {
      body: {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        externalUrl: payload.externalUrl,
      },
    });
  }
  const res = await multipartFetch(cfg.baseUrl, `/runtime/tasks/${taskId}/attachments`, () => {
    const fd = new FormData();
    fd.append("name", payload.name);
    if (payload.description) fd.append("description", payload.description);
    if (payload.type) fd.append("type", payload.type);
    fd.append("content", payload.file, payload.name);
    return fd;
  });
  return (await res.json()) as FlowableAttachment;
};

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
// Identity-surface wrappers extracted to src/api-identity.ts per NFR-21
// navigability (50 KB per-source-file limit). All wrappers funnel through
// the same `request<T>` exported above; Pattern P-001 preserved.
import {
  addUserToGroup,
  createGroup,
  createUser,
  deleteGroup,
  deleteUser,
  getGroup,
  getUser,
  getUserGroups,
  listGroupMembers,
  listGroups,
  listUsers,
  removeUserFromGroup,
  updateGroup,
  updateUser,
} from "./api-identity";

// Tenants are not exposed as a dedicated endpoint in flowable-rest 7.2.
// Derive distinct tenantIds from deployments (truthy values only).
//
// 60-second TTL cache on the derivation. The Topbar pill, route loaders,
// and badge probes all call api.listTenants(); without the cache, every
// chrome render hammers /repository/deployments. The TTL is short enough
// that newly-deployed tenantIds appear within a minute; long enough that
// the chrome doesn't re-derive on every cycleTenant() click.
//
// The /repository/deployments?size=200 page caps the derivation at 200
// deployments per page. Engines with >200 deployments (multiple tenants
// × many definitions) may produce truncated tenant lists. Future
// enhancement (post-MVP): page through /repository/deployments with
// multiple ?start= requests to enumerate all tenants.
let _tenantsCache: { value: { data: FlowableTenant[] }; at: number } | null = null;
const TENANTS_CACHE_TTL_MS = 60_000;
const TENANTS_PAGE_SIZE = 200;

const listTenants = async (): Promise<{ data: FlowableTenant[] }> => {
  const now = Date.now();
  if (_tenantsCache && now - _tenantsCache.at < TENANTS_CACHE_TTL_MS) {
    return _tenantsCache.value;
  }
  const res = await listDeployments({ size: TENANTS_PAGE_SIZE });
  if (res?.data && res.data.length === TENANTS_PAGE_SIZE) {
    // eslint-disable-next-line no-console
    console.warn(
      `[flowatch] api.listTenants: /repository/deployments returned ${TENANTS_PAGE_SIZE} rows (page cap reached); tenant list may be truncated for very large engines.`,
    );
  }
  const ids = new Set<string>();
  (res?.data || []).forEach((d) => {
    if (d.tenantId) ids.add(d.tenantId);
  });
  const value = { data: [...ids].map((id) => ({ id, name: id })) };
  _tenantsCache = { value, at: now };
  return value;
};

// Test-only export — call this in tests to reset the module-scoped cache
// between cases. Also used in production once: by api.setConfig() when the
// engine endpoint changes (per Story 14.4 AC-9).
export const __clearTenantsCache = (): void => {
  _tenantsCache = null;
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
// Story 15.3: tightened signature. The body shape matches Flowable 7.x's
// POST /dmn-rule/execute — `decisionKey` + an array of typed input variables.
// Pass `parentDeploymentId` to lock execution to a specific deployment;
// without it, the engine picks the latest version of the decision key.
const executeDecision = (body: ExecuteDecisionBody) =>
  request<FlowableDecisionResult>("POST", "/dmn-rule/execute", { body, base: dmnBase() });
// Direct DMN XML fetch by decision-table id. Mirrors the BPMN side's
// /repository/process-definitions/{id}/resourcedata shape — one endpoint,
// no deployment-resources discovery hop. The `decisionTableId` matches a
// `FlowableDecision.id`. The DMN sub-app does NOT expose a
// `/deployments/{id}/resources` listing endpoint (returns 500 "No
// endpoint" on flowable-rest 7.2 OSS), which is why we fetch by decision
// id rather than by deployment+filename.
const getDmnDecisionResource = (decisionId: string): Promise<string> =>
  request<string>("GET", `/dmn-repository/decision-tables/${decisionId}/resourcedata`, {
    raw: true,
    base: dmnBase(),
  });
// Story 15.4: list historic DMN decision executions.
//
// Supported params (per Flowable 7.x DMN-history REST surface):
//   size, start, sort, order              — pagination + sort
//   decisionKey, decisionKeyLike          — filter by decision key
//   processInstanceId                     — filter by parent process instance
//   executionId                           — filter by Flowable execution context
//   activityId                            — filter by triggering activity
//   startedBefore, startedAfter           — ISO 8601 timestamp bounds
//   tenantId                              — tenant scoping
const listDmnHistoryExecutions = (params?: QueryParams) =>
  request<FlowablePage<FlowableHistoricDecisionExecution>>(
    "GET",
    "/dmn-history/historic-decision-executions",
    { params, base: dmnBase() },
  );
// Fetch the rich audit data for a single historic decision execution —
// surfaces hit policy, typed input/result maps, and the per-rule
// condition+conclusion trace. Used by the executions row-expand panel.
const getDmnHistoryAuditdata = (executionId: string) =>
  request<FlowableDmnExecutionAudit>(
    "GET",
    `/dmn-history/historic-decision-executions/${executionId}/auditdata`,
    { base: dmnBase() },
  );
// Single-deployment GET — mirror of the BPMN side's `api.getDeployment`,
// powers the kind-aware `/deployments/$id` route loader.
const getDmnDeployment = (id: string) =>
  request<FlowableDeployment>("GET", `/dmn-repository/deployments/${id}`, { base: dmnBase() });
// Binary download for an individual DMN deployment resource — mirror of
// BPMN's `getDeploymentResource`. Returns the raw Response so the caller
// picks .blob() / .text(); used by the kind-aware DeploymentDetail.
const getDmnDeploymentResource = (deploymentId: string, resourceName: string) =>
  request<Response>(
    "GET",
    `/dmn-repository/deployments/${deploymentId}/resourcedata/${encodeURIComponent(resourceName)}`,
    { asResponse: true, base: dmnBase() },
  );
// Story 15.2: DELETE a DMN deployment. Pass `{cascade: true}` to delete
// decisions still referenced by historic executions (mirrors BPMN's
// removeDeployment cascade flag at /repository/deployments/{id}). Without
// cascade, the engine returns 409 Conflict if any historic execution
// references a decision from this deployment.
const removeDmnDeployment = (id: string, params?: { cascade?: boolean }) =>
  request<void>(
    "DELETE",
    `/dmn-repository/deployments/${id}`,
    params?.cascade ? { params: { cascade: true }, base: dmnBase() } : { base: dmnBase() },
  );

// ── Deployment helpers (multipart upload) ────────────────────────────────
// Flowable expects multipart/form-data, not the JSON-with-base64 shape we used
// in mock mode. We build a FormData and send via raw fetch (bypassing request()
// because the body is non-JSON), but still log the call.
interface UploadOpts {
  base?: string;
  deploymentName?: string;
  /**
   * Path under `base` to POST the multipart deployment to. Defaults to
   * `/repository/deployments` (BPMN sub-app). The DMN sub-app uses
   * `/dmn-repository/deployments` — `deployDmn` passes that explicitly.
   * Without this override, DMN deploys hit `/dmn-api/repository/deployments`
   * which returns "No endpoint POST …" from flowable-rest 7.2.
   */
  path?: string;
}
const uploadDeployment = async (
  filename: string,
  content: string,
  type: string,
  opts: UploadOpts = {},
): Promise<FlowableDeployment> => {
  const root = opts.base || cfg.baseUrl;
  const path = opts.path || "/repository/deployments";
  // FormData build happens inside multipartFetch's try (Story 9.2 AC-7) so a
  // Blob constructor throw lands in API_LOG with status=0.
  const res = await multipartFetch(root, path, () => {
    const fd = new FormData();
    fd.append("file", new Blob([content], { type }), filename);
    if (cfg.tenantId) fd.append("tenantId", cfg.tenantId);
    if (opts.deploymentName) fd.append("deploymentName", opts.deploymentName);
    return fd;
  });
  return (await res.json()) as FlowableDeployment;
};

const deployBpmn = (name: string, xml: string) =>
  uploadDeployment(name, xml, "application/xml", { deploymentName: name });
const deployDmn = (name: string, xml: string) =>
  uploadDeployment(name, xml, "application/xml", {
    deploymentName: name,
    base: dmnBase(),
    path: "/dmn-repository/deployments",
  });

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
      // Story 14.4 AC-9: an engine switch invalidates the cached tenants —
      // the new engine's /repository/deployments has its own tenantIds.
      __clearTenantsCache();
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
  getProcessDefinitionFresh,
  suspendProcessDefinition,
  updateProcessDefinition,
  getProcessDefinitionResource,
  // Runtime
  listProcessInstances,
  getProcessInstance,
  startProcessInstance,
  deleteProcessInstance,
  getProcessInstanceVariables,
  updateInstanceVariables,
  deleteInstanceVariable,
  listTasks,
  getTask,
  taskAction,
  updateTask,
  getTaskVariables,
  listTaskAttachments,
  addTaskAttachment,
  getTaskAttachmentContent,
  deleteTaskAttachment,
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
  listGroupMembers,
  addUserToGroup,
  removeUserFromGroup,
  createUser,
  updateUser,
  deleteUser,
  createGroup,
  updateGroup,
  deleteGroup,
  listTenants,
  // DMN
  listDecisions,
  listDmnDeployments,
  executeDecision,
  getDmnDecisionResource,
  getDmnDeployment,
  getDmnDeploymentResource,
  removeDmnDeployment,
  listDmnHistoryExecutions,
  getDmnHistoryAuditdata,
  deployBpmn,
  deployDmn,
  ping,
  runRaw,
};
