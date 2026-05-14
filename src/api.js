// API service layer — wraps Flowable 7 REST endpoints with Basic auth.
// Every call routes through request(), which logs to API_LOG and fires an api:log event
// so the Inspector drawer can react in real time.

const STORAGE_KEY = "flowatch.connection.v1";
const defaultCfg = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
};
const loadCfg = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultCfg, ...JSON.parse(raw) } : { ...defaultCfg };
  } catch { return { ...defaultCfg }; }
};
const saveCfg = (cfg) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
};

let cfg = loadCfg();

// Flowable splits its REST API across sub-apps. The BPMN/runtime/identity endpoints
// live under `/flowable-rest/service`, but DMN is mounted at `/flowable-rest/dmn-api`.
// We derive the DMN root from the configured base URL.
const dmnBase = () => cfg.baseUrl.replace(/\/service\/?$/, "/dmn-api");

export const API_LOG = [];
const MAX_LOG = 60;
const logCall = (entry) => {
  API_LOG.unshift(entry);
  if (API_LOG.length > MAX_LOG) API_LOG.length = MAX_LOG;
  window.dispatchEvent(new CustomEvent("api:log", { detail: entry }));
};

const qs = (params) => {
  if (!params) return "";
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    usp.append(k, String(v));
  });
  const s = usp.toString();
  return s ? "?" + s : "";
};

const basicAuth = () => "Basic " + btoa(`${cfg.username}:${cfg.password}`);

const request = async (method, path, { params, body, base, raw } = {}) => {
  const root = (base || cfg.baseUrl).replace(/\/$/, "");
  const url = root + path + qs(params);
  const t0 = performance.now();
  const entry = {
    id: Math.random().toString(36).slice(2, 9),
    method, path: path + qs(params), url,
    status: 0, ms: 0, at: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": basicAuth(),
        "Accept": raw ? "*/*" : "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    entry.status = res.status;
    entry.ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      entry.error = text || `HTTP ${res.status}`;
      logCall(entry);
      const err = new Error(entry.error);
      err.status = res.status;
      throw err;
    }
    const data = raw
      ? await res.text()
      : (res.headers.get("content-type")?.includes("application/json")
          ? await res.json() : await res.text());
    logCall(entry);
    return data;
  } catch (err) {
    if (entry.status === 0) {
      entry.error = String(err.message || err);
      entry.ms = Math.round(performance.now() - t0);
      logCall(entry);
    }
    throw err;
  }
};

// ── Repository (BPMN) ─────────────────────────────────────────────────────
const listDeployments = (params) => request("GET", "/repository/deployments", { params });
const createDeployment = (form) => request("POST", "/repository/deployments", { body: form });
const deleteDeployment = (id, cascade) =>
  request("DELETE", `/repository/deployments/${id}`,
    { params: cascade ? { cascade: true } : null });
const listDeploymentResources = (id) =>
  request("GET", `/repository/deployments/${id}/resources`);
const listProcessDefinitions = (params) =>
  request("GET", "/repository/process-definitions", { params });
const suspendProcessDefinition = (id, suspend) =>
  request("PUT", `/repository/process-definitions/${id}`,
    { body: { action: suspend ? "suspend" : "activate" } });
const getProcessDefinitionResource = (id) =>
  request("GET", `/repository/process-definitions/${id}/resourcedata`, { raw: true });

// ── Runtime ───────────────────────────────────────────────────────────────
const listProcessInstances = (params) =>
  request("GET", "/runtime/process-instances", { params });
const startProcessInstance = (body) =>
  request("POST", "/runtime/process-instances", { body });
const deleteProcessInstance = (id, reason) =>
  request("DELETE", `/runtime/process-instances/${id}`,
    { params: reason ? { deleteReason: reason } : null });
const getProcessInstanceVariables = (id) =>
  request("GET", `/runtime/process-instances/${id}/variables`);
const listTasks = (params) => request("GET", "/runtime/tasks", { params });
const taskAction = (taskId, action, body) =>
  request("POST", `/runtime/tasks/${taskId}`, { body: { action, ...(body || {}) } });
const getTaskVariables = (taskId) =>
  request("GET", `/runtime/tasks/${taskId}/variables`);

// ── Form ──────────────────────────────────────────────────────────────────
const getTaskForm = (taskId) =>
  request("GET", "/form/form-data", { params: { taskId } });
const submitTaskForm = (taskId, properties) =>
  request("POST", "/form/form-data", { body: { taskId, properties } });

// ── Management ───────────────────────────────────────────────────────────
const listJobs = (params) => request("GET", "/management/jobs", { params });
const listTimerJobs = (params) => request("GET", "/management/timer-jobs", { params });
const listDeadLetterJobs = (params) =>
  request("GET", "/management/deadletter-jobs", { params });
const executeJob = (id) =>
  request("POST", `/management/jobs/${id}`, { body: { action: "execute" } });
const moveDeadLetterJob = (id) =>
  request("POST", `/management/deadletter-jobs/${id}`,
    { body: { action: "move" } });
const jobStacktrace = (id) =>
  request("GET", `/management/jobs/${id}/exception-stacktrace`, { raw: true });

// ── History ──────────────────────────────────────────────────────────────
const listHistoricInstances = (params) =>
  request("GET", "/history/historic-process-instances", { params });
const listHistoricActivities = (params) =>
  request("GET", "/history/historic-activity-instances", { params });
const listHistoricVariables = (params) =>
  request("GET", "/history/historic-variable-instances", { params });
const listHistoricTasks = (params) =>
  request("GET", "/history/historic-task-instances", { params });

// ── Identity ─────────────────────────────────────────────────────────────
const listUsers = (params) => request("GET", "/identity/users", { params });
const listGroups = (params) => request("GET", "/identity/groups", { params });
const getUserGroups = (userId) =>
  request("GET", `/identity/users/${userId}/groups`);
const addUserToGroup = (userId, groupId) =>
  request("POST", `/identity/users/${userId}/groups`, { body: { groupId } });

// Tenants are not exposed as a dedicated endpoint in flowable-rest 7.2.
// Derive distinct tenantIds from deployments (truthy values only).
const listTenants = async () => {
  const res = await listDeployments({ size: 1000 });
  const ids = new Set();
  (res?.data || []).forEach((d) => { if (d.tenantId) ids.add(d.tenantId); });
  return { data: [...ids].map((id) => ({ id, name: id })) };
};

// ── DMN (mounted under /flowable-rest/dmn-api, not /service) ─────────────
const listDecisions = (params) =>
  request("GET", "/dmn-repository/decisions", { params, base: dmnBase() });
const listDmnDeployments = (params) =>
  request("GET", "/dmn-repository/deployments", { params, base: dmnBase() });
const executeDecision = (body) =>
  request("POST", "/dmn-rule/execute", { body, base: dmnBase() });
const getDmnResource = (deploymentId, resourceId) =>
  request("GET",
    `/dmn-repository/deployments/${deploymentId}/resourcedata/${resourceId}`,
    { raw: true, base: dmnBase() });

// ── Deployment helpers (multipart upload) ────────────────────────────────
// Flowable expects multipart/form-data, not the JSON-with-base64 shape we used
// in mock mode. We build a FormData and send via raw fetch (bypassing request()
// because the body is non-JSON), but still log the call.
const uploadDeployment = async (filename, content, type, opts = {}) => {
  const root = (opts.base || cfg.baseUrl).replace(/\/$/, "");
  const url = root + "/repository/deployments";
  const t0 = performance.now();
  const entry = {
    id: Math.random().toString(36).slice(2, 9),
    method: "POST", path: "/repository/deployments", url,
    status: 0, ms: 0, at: new Date().toISOString(),
  };
  const fd = new FormData();
  fd.append("file", new Blob([content], { type }), filename);
  if (cfg.tenantId) fd.append("tenantId", cfg.tenantId);
  if (opts.deploymentName) fd.append("deploymentName", opts.deploymentName);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": basicAuth() },
      body: fd,
    });
    entry.status = res.status;
    entry.ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      entry.error = text || `HTTP ${res.status}`;
      logCall(entry);
      throw new Error(entry.error);
    }
    logCall(entry);
    return await res.json();
  } catch (err) {
    if (entry.status === 0) {
      entry.error = String(err.message || err);
      entry.ms = Math.round(performance.now() - t0);
      logCall(entry);
    }
    throw err;
  }
};

const deployBpmn = (name, xml) =>
  uploadDeployment(name, xml, "application/xml", { deploymentName: name });
const deployDmn = (name, xml) =>
  uploadDeployment(name, xml, "application/xml",
    { deploymentName: name, base: dmnBase() });

const ping = () => request("GET", "/management/engine");

// Send an ad-hoc request from the API Inspector "Try it" panel.
// Path may include a query string; DMN sub-app paths (/dmn-*) are auto-rerouted.
const runRaw = (method, path, body) => {
  const base = path.startsWith("/dmn-") ? dmnBase() : undefined;
  return request(method, path, { base, body });
};

export const api = {
  config: () => ({ ...cfg }),
  setConfig: (next) => { cfg = { ...cfg, ...next }; saveCfg(cfg); },
  log: () => [...API_LOG],
  // BPMN repository
  listDeployments, createDeployment, deleteDeployment, listDeploymentResources,
  listProcessDefinitions, suspendProcessDefinition, getProcessDefinitionResource,
  // Runtime
  listProcessInstances, startProcessInstance, deleteProcessInstance,
  getProcessInstanceVariables, listTasks, taskAction, getTaskVariables,
  // Form
  getTaskForm, submitTaskForm,
  // Management
  listJobs, listTimerJobs, listDeadLetterJobs, executeJob, moveDeadLetterJob,
  jobStacktrace,
  // History
  listHistoricInstances, listHistoricActivities, listHistoricVariables,
  listHistoricTasks,
  // Identity
  listUsers, listGroups, getUserGroups, addUserToGroup, listTenants,
  // DMN
  listDecisions, listDmnDeployments, executeDecision, getDmnResource,
  deployBpmn, deployDmn,
  ping, runRaw,
};
