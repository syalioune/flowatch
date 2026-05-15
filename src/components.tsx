import { Link } from "@tanstack/react-router";
import React from "react";
import { API_LOG, type ApiLogEntry, api, type FlowableConfig } from "./api";
import type { EndpointHint } from "./data";
import { ROUTED_VIEWS, VIEW_TO_PATH } from "./lib/nav";

interface ApiLogEvent extends CustomEvent<ApiLogEntry> {}
interface AppToastEvent
  extends CustomEvent<{
    kind?: string;
    text: string;
    sub?: string;
    ttl?: number;
    action?: { label: string; onClick: () => void };
  }> {}
declare global {
  interface WindowEventMap {
    "api:log": ApiLogEvent;
    "app:toast": AppToastEvent;
  }
}

interface IconProps {
  name: string;
  size?: number;
}

export const Icon = ({ name, size = 14 }: IconProps) => {
  const paths: Record<string, React.ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="10" width="7" height="11" rx="1.5" />
      </>
    ),
    bpmn: (
      <>
        <circle cx="5" cy="12" r="2.5" />
        <rect x="9" y="9" width="7" height="6" rx="1" />
        <circle cx="19" cy="12" r="2.5" />
        <path d="M7.5 12h1.5M16 12h1.5" />
      </>
    ),
    dmn: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1.5" />
        <path d="M3 9h18M9 4v16" />
      </>
    ),
    deploy: (
      <>
        <path d="M12 3l8 5v8l-8 5-8-5V8z" />
        <path d="M4 8l8 5 8-5M12 13v10" />
      </>
    ),
    def: (
      <>
        <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
        <path d="M16 4v3h3M7 12h10M7 16h7" />
      </>
    ),
    instance: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>
    ),
    job: (
      <>
        <path d="M3 7h18M3 12h18M3 17h12" />
        <circle cx="19" cy="17" r="2" />
      </>
    ),
    task: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9l2 2 5-5M7 15l2 2 5-5" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5M12 7v5l3 2" />
      </>
    ),
    identity: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 4 4" />
      </>
    ),
    bell: (
      <>
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5z" />
        <path d="M10 21h4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    api: (
      <>
        <path d="M5 7h2l1 10h8l1-10h2M9 7V5a3 3 0 0 1 6 0v2" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.5 5.5 4 4M20 20l-1.5-1.5M5.5 18.5 4 20M20 4l-1.5 1.5" />
      </>
    ),
    moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    play: <path d="M7 4l13 8-13 8z" />,
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </>
    ),
    save: (
      <>
        <path d="M19 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11l4 4v13a1 1 0 0 1-1 1z" />
        <path d="M7 3v6h9V3M7 21v-7h10v7" />
      </>
    ),
    chevron: <path d="M6 9l6 6 6-6" />,
    x: <path d="M6 6l12 12M6 18 18 6" />,
    drag: (
      <>
        <circle cx="9" cy="6" r="1" />
        <circle cx="15" cy="6" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="9" cy="18" r="1" />
        <circle cx="15" cy="18" r="1" />
      </>
    ),
    refresh: <path d="M21 12a9 9 0 1 1-3-6.7M21 3v5h-5" />,
    download: (
      <>
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />
      </>
    ),
    filter: <path d="M3 5h18l-7 9v6l-4-2v-4z" />,
    tenant: (
      <>
        <path d="M3 21V8l9-5 9 5v13" />
        <path d="M9 21v-7h6v7" />
      </>
    ),
    palette: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="8.5" cy="10" r="1.5" />
        <circle cx="15.5" cy="10" r="1.5" />
        <circle cx="12" cy="15.5" r="1.5" />
      </>
    ),
  };
  return (
    <svg
      className="nav-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || null}
    </svg>
  );
};

const Mark = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
    <line
      x1="3"
      y1="16"
      x2="29"
      y2="16"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="16" cy="16" r="6" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2" />
    <circle cx="16" cy="16" r="2" fill="var(--accent)" />
  </svg>
);

const Logo = () => (
  <div className="brand">
    <div className="brand-mark">
      <Mark />
    </div>
    <div className="brand-name">Flowatch</div>
    <div className="brand-tag">v0.7</div>
  </div>
);

interface EndpointChipProps {
  method: string;
  path: string;
  onClick?: () => void;
}

export const EndpointChip = ({ method, path, onClick }: EndpointChipProps) => (
  <button className="ep-chip" onClick={onClick} title={`${method} ${path}`}>
    <span className="ep-method" data-m={method}>
      {method}
    </span>
    <span>{path}</span>
  </button>
);

interface EndpointRowProps {
  items: EndpointHint[];
  onOpenInspector?: ((e: EndpointHint) => void) | undefined;
}

export const EndpointRow = ({ items, onOpenInspector }: EndpointRowProps) => (
  <div className="ep-chip-row">
    {items.map((e, i) => (
      <EndpointChip
        key={i}
        method={e.method}
        path={e.path}
        onClick={() => onOpenInspector && onOpenInspector(e)}
      />
    ))}
  </div>
);

const NAV = [
  { group: "Overview", items: [{ id: "dashboard", label: "Dashboard", icon: "dashboard" }] },
  {
    group: "Modeler",
    items: [
      { id: "bpmn", label: "BPMN", icon: "bpmn" },
      { id: "dmn", label: "DMN", icon: "dmn" },
    ],
  },
  {
    group: "Operate",
    items: [
      { id: "tasks", label: "Tasks", icon: "task" },
      { id: "instances", label: "Process instances", icon: "instance" },
      { id: "jobs", label: "Jobs", icon: "job" },
      { id: "history", label: "History", icon: "history" },
    ],
  },
  {
    group: "Repository",
    items: [
      { id: "deployments", label: "Deployments", icon: "deploy" },
      { id: "definitions", label: "Process definitions", icon: "def" },
    ],
  },
  {
    group: "Admin",
    items: [
      { id: "identity", label: "Users & groups", icon: "identity" },
      { id: "tenants", label: "Tenants", icon: "tenant" },
    ],
  },
];

interface ConnectionState {
  state: "pending" | "ok" | "err";
  host: string;
}

interface SidebarProps {
  active: string;
  onNav: (id: string) => void;
  connection: ConnectionState;
  onConnClick: () => void;
  counts?: Record<string, number | null | undefined>;
}

export const Sidebar = ({ active, onNav, connection, onConnClick, counts }: SidebarProps) => (
  <aside className="sidebar">
    <Logo />
    <nav className="nav">
      {NAV.map((g) => (
        <div key={g.group} className="nav-group">
          <div className="nav-label">{g.group}</div>
          {g.items.map((it) => {
            const count = counts?.[it.id];
            const inner = (
              <>
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {count != null && <span className="nav-count">{count}</span>}
              </>
            );
            if (ROUTED_VIEWS.has(it.id) && VIEW_TO_PATH[it.id]) {
              const to = VIEW_TO_PATH[it.id] as string;
              // biome-ignore lint/suspicious/noExplicitAny: TanStack Router's LinkProps doesn't expose data-* pass-through; Story 3.6 cleanup.
              const activeProps = { "data-active": "1" } as any;
              // biome-ignore lint/suspicious/noExplicitAny: TanStack Router's LinkProps doesn't expose data-* pass-through; Story 3.6 cleanup.
              const inactiveProps = { "data-active": "0" } as any;
              return (
                <Link
                  key={it.id}
                  to={to}
                  className="nav-item"
                  activeProps={activeProps}
                  inactiveProps={inactiveProps}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div
                key={it.id}
                className="nav-item"
                data-active={active === it.id ? "1" : "0"}
                onClick={() => onNav(it.id)}
              >
                {inner}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
    <div className="side-foot">
      <button className="conn-pill" onClick={onConnClick}>
        <span className="conn-dot" data-state={connection.state} />
        <span className="conn-host">{connection.host}</span>
        <Icon name="settings" size={12} />
      </button>
    </div>
  </aside>
);

interface Tenant {
  id: string;
  name: string;
}

interface TopbarProps {
  tenant: Tenant;
  tenants?: Tenant[];
  onTenant: () => void;
  theme: "light" | "dark";
  onTheme: (v: "light" | "dark") => void;
  onInspector: () => void;
  inspectorOpen: boolean;
  onSettings: () => void;
  onTweaks: () => void;
}

export const Topbar = ({
  tenant,
  onTenant,
  theme,
  onTheme,
  onInspector,
  inspectorOpen,
  onSettings,
  onTweaks,
}: TopbarProps) => (
  <div className="topbar">
    <div className="tenant-switch" onClick={onTenant}>
      <Icon name="tenant" size={13} />
      <span>
        <b style={{ fontWeight: 500 }}>{tenant.name}</b>
      </span>
      <span className="caret">
        <Icon name="chevron" size={12} />
      </span>
    </div>
    <div className="search">
      <Icon name="search" size={13} />
      <input placeholder="Search processes, instances, tasks…" />
      <kbd>⌘K</kbd>
    </div>
    <div className="top-actions">
      <button className="icon-btn" title="Notifications">
        <Icon name="bell" size={15} />
      </button>
      <button
        className="icon-btn"
        data-active={inspectorOpen ? "1" : "0"}
        title="API inspector"
        onClick={onInspector}
      >
        <Icon name="api" size={15} />
      </button>
      <button
        className="icon-btn"
        title="Theme"
        onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
      </button>
      <button className="icon-btn" title="Customize (Ctrl+Shift+T)" onClick={onTweaks}>
        <Icon name="palette" size={15} />
      </button>
      <button className="icon-btn" title="Settings" onClick={onSettings}>
        <Icon name="settings" size={15} />
      </button>
      <div className="avatar">YOU</div>
    </div>
  </div>
);

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type PingResult = { ok: true; name?: string; version?: string } | { ok: false; error: string };

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const [cfg, setCfg] = React.useState<FlowableConfig>(api.config());
  const [pinging, setPinging] = React.useState(false);
  const [pingRes, setPingRes] = React.useState<PingResult | null>(null);
  if (!open) return null;
  const save = () => {
    api.setConfig(cfg);
    onClose();
  };
  const test = async () => {
    api.setConfig(cfg);
    setPinging(true);
    setPingRes(null);
    try {
      const r = await api.ping();
      setPingRes({ ok: true, name: r?.name, version: r?.version });
    } catch (e) {
      setPingRes({ ok: false, error: String((e as Error)?.message || e) });
    } finally {
      setPinging(false);
    }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 580 }}>
        <div className="modal-hd">
          <h3>Engine connection</h3>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <div className="form-row">
            <label>
              Base URL <span className="mono">REST service root</span>
            </label>
            <input
              className="input"
              value={cfg.baseUrl}
              onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
            />
            <div className="mute text-xs">
              Default OSS path:{" "}
              <span className="mono">http://localhost:8080/flowable-rest/service</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-row">
              <label>Username</label>
              <input
                className="input"
                value={cfg.username}
                onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input
                className="input"
                type="password"
                value={cfg.password}
                onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
              />
            </div>
          </div>
          <div className="form-row">
            <label>
              Tenant ID <span className="mono">optional</span>
            </label>
            <input
              className="input"
              value={cfg.tenantId}
              placeholder="leave blank for default"
              onChange={(e) => setCfg({ ...cfg, tenantId: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <button className="btn" onClick={test} disabled={pinging}>
              {pinging ? "Pinging…" : "Test connection"}
            </button>
            {pingRes && pingRes.ok && (
              <span className="badge" data-tone="ok">
                {pingRes.name} {pingRes.version}
              </span>
            )}
            {pingRes && !pingRes.ok && (
              <span className="badge" data-tone="bad">
                {pingRes.error}
              </span>
            )}
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" data-variant="primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const buildFetchSnippet = (cfg: FlowableConfig, ep: EndpointHint): string => {
  const u = `${cfg.baseUrl.replace(/\/$/, "")}${ep.path}`;
  return `// ${ep.desc || ""}
const auth = btoa("${cfg.username}:••••");
const res = await fetch(
  "${u}",
  {
    method: "${ep.method}",
    headers: {
      "Authorization": "Basic " + auth,
      "Accept":        "application/json"${
        ep.method !== "GET"
          ? `,
      "Content-Type":  "application/json"`
          : ""
      }
    }${
      ep.method !== "GET"
        ? `,
    body: JSON.stringify({ /* payload */ })`
        : ""
    }
  }
);
const data = await res.json();`;
};

const buildCurlSnippet = (cfg: FlowableConfig, ep: EndpointHint): string => {
  const u = `${cfg.baseUrl.replace(/\/$/, "")}${ep.path}`;
  return `curl -u ${cfg.username}:•••• \\
  -X ${ep.method} \\
  -H "Accept: application/json"${ep.method !== "GET" ? ` \\\n  -H "Content-Type: application/json"` : ""} \\
  "${u}"`;
};

interface ApiInspectorProps {
  open: boolean;
  onClose: () => void;
  screenEndpoints?: EndpointHint[];
  screenTitle: string;
}

type InspectorResult =
  | { ok: true; status: number | undefined; ms: number | undefined; data: unknown }
  | { ok: false; status: number | undefined; ms: number | undefined; error: string };

export const ApiInspector = ({
  open,
  onClose,
  screenEndpoints,
  screenTitle,
}: ApiInspectorProps) => {
  const [log, setLog] = React.useState<ApiLogEntry[]>([...API_LOG]);
  const [tab, setTab] = React.useState<"endpoints" | "calls">("endpoints");
  const [snippet, setSnippet] = React.useState<"fetch" | "curl">("fetch");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<InspectorResult | null>(null);
  const cfg = api.config();
  const firstEp: EndpointHint = (screenEndpoints && screenEndpoints[0]) || {
    method: "GET",
    path: "/",
    desc: "",
  };
  const [tryPath, setTryPath] = React.useState<string>(firstEp.path);

  React.useEffect(() => {
    setTryPath(firstEp.path);
    setResult(null);
  }, [firstEp.path]);

  React.useEffect(() => {
    const onLog = () => setLog([...API_LOG]);
    window.addEventListener("api:log", onLog);
    return () => window.removeEventListener("api:log", onLog);
  }, []);

  const runRequest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const data = await api.runRaw(firstEp.method, tryPath);
      const last = API_LOG[0];
      setResult({ ok: true, status: last?.status, ms: last?.ms, data });
    } catch (e) {
      const last = API_LOG[0];
      setResult({
        ok: false,
        status: last?.status,
        ms: last?.ms,
        error: String((e as Error)?.message || e),
      });
    } finally {
      setRunning(false);
    }
  };

  const previewBody = (d: unknown): string => {
    if (d == null) return "";
    if (typeof d === "string") return d.slice(0, 4000);
    try {
      return JSON.stringify(d, null, 2).slice(0, 4000);
    } catch {
      return String(d);
    }
  };

  const bucket = (s: number | undefined): string => {
    if (!s) return "err";
    if (s >= 200 && s < 300) return "2xx";
    if (s >= 400 && s < 500) return "4xx";
    if (s >= 500) return "5xx";
    return "err";
  };

  return (
    <div className="drawer" data-open={open ? "1" : "0"}>
      <div className="drawer-hd">
        <Icon name="api" size={16} />
        <h3>API Inspector</h3>
        <button className="icon-btn x" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="tabs" style={{ margin: "0 18px" }}>
        <div
          className="tab"
          data-active={tab === "endpoints" ? "1" : "0"}
          onClick={() => setTab("endpoints")}
        >
          {screenTitle} endpoints
        </div>
        <div
          className="tab"
          data-active={tab === "calls" ? "1" : "0"}
          onClick={() => setTab("calls")}
        >
          Recent calls
          <span className="nav-count" style={{ marginLeft: 6 }}>
            {log.length}
          </span>
        </div>
      </div>
      <div className="drawer-body">
        {tab === "endpoints" && (
          <>
            <div className="drawer-sect">Mapped to this view</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(screenEndpoints || []).map((e, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    background: "var(--bg-sunken)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="ep-method" data-m={e.method}>
                      {e.method}
                    </span>
                    <span className="mono" style={{ fontSize: 12 }}>
                      {e.path}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-soft)", marginTop: 4 }}>
                    {e.desc}
                  </div>
                </div>
              ))}
            </div>
            <div className="drawer-sect">Try it</div>
            <div className="seg-row" style={{ marginBottom: 8 }}>
              <button
                className="seg-btn"
                data-on={snippet === "fetch" ? "1" : "0"}
                onClick={() => setSnippet("fetch")}
              >
                fetch()
              </button>
              <button
                className="seg-btn"
                data-on={snippet === "curl" ? "1" : "0"}
                onClick={() => setSnippet("curl")}
              >
                cURL
              </button>
              <button
                className="btn"
                data-size="sm"
                data-variant="primary"
                disabled={running || tryPath.includes("{")}
                onClick={runRequest}
                style={{ marginLeft: "auto" }}
                title={
                  tryPath.includes("{") ? "Replace {placeholders} first" : "Send a real request"
                }
              >
                <Icon name="play" size={11} />
                {running ? "Running…" : "Run"}
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="ep-method" data-m={firstEp.method}>
                {firstEp.method}
              </span>
              <input
                className="input mono"
                style={{ flex: 1, fontSize: 12 }}
                value={tryPath}
                onChange={(e) => setTryPath(e.target.value)}
              />
            </div>
            <div className="code">
              {snippet === "fetch"
                ? buildFetchSnippet(cfg, { ...firstEp, path: tryPath })
                : buildCurlSnippet(cfg, { ...firstEp, path: tryPath })}
            </div>
            {result && (
              <div className="try-result" data-ok={result.ok ? "1" : "0"}>
                <div className="try-result-hd">
                  <span
                    className="status"
                    data-s={
                      result.ok
                        ? "2xx"
                        : (result.status ?? 0) >= 500
                          ? "5xx"
                          : (result.status ?? 0) >= 400
                            ? "4xx"
                            : "err"
                    }
                  >
                    {result.status || "ERR"}
                  </span>
                  <span className="ms">{result.ms ?? 0}ms</span>
                  <button
                    className="icon-btn x"
                    style={{ marginLeft: "auto" }}
                    onClick={() => setResult(null)}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
                <pre
                  className="code"
                  style={{ marginTop: 8, maxHeight: 240, whiteSpace: "pre-wrap" }}
                >
                  {result.ok ? previewBody(result.data) : result.error}
                </pre>
              </div>
            )}
          </>
        )}
        {tab === "calls" && (
          <>
            <div className="drawer-sect">Live request log</div>
            {log.length === 0 && (
              <div className="empty" style={{ padding: 20 }}>
                No calls yet. Navigate around — every fetch shows up here.
              </div>
            )}
            {log.map((e) => (
              <div key={e.id} className="log-entry">
                <span className="ep-method" data-m={e.method}>
                  {e.method}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {e.path}
                </span>
                <span className="status" data-s={bucket(e.status)}>
                  {e.status || "ERR"}
                </span>
                <span className="ms">{e.ms}ms</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

interface PageHeadProps {
  title: string;
  subtitle?: React.ReactNode;
  endpoints?: EndpointHint[];
  actions?: React.ReactNode;
  onOpenInspector?: ((e: EndpointHint) => void) | undefined;
}

export const PageHead = ({
  title,
  subtitle,
  endpoints,
  actions,
  onOpenInspector,
}: PageHeadProps) => (
  <div className="page-head">
    <div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <div className="page-sub">{subtitle}</div>}
      {endpoints && (
        <div style={{ marginTop: 10 }}>
          <EndpointRow items={endpoints} onOpenInspector={onOpenInspector} />
        </div>
      )}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </div>
);

interface ToastDetail {
  kind?: string;
  text: string;
  sub?: string;
  ttl?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastDetail {
  id: string;
}

export const toast = (detail: ToastDetail) => {
  window.dispatchEvent(new CustomEvent("app:toast", { detail }));
};

export const Toaster = () => {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => {
    const onToast = (e: AppToastEvent) => {
      const id = Math.random().toString(36).slice(2);
      const t: ToastItem = { id, kind: "info", ttl: 4000, ...e.detail };
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.ttl);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);
  const dismiss = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));
  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          <div className="toast-body">
            <div className="toast-text">{t.text}</div>
            {t.sub && <div className="toast-sub mono">{t.sub}</div>}
          </div>
          {t.action && (
            <button
              className="btn"
              data-size="sm"
              data-variant="ghost"
              onClick={() => {
                t.action?.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="icon-btn x" onClick={() => dismiss(t.id)}>
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

export const fmtTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
};

export const fmtDue = (iso: string | null | undefined): string => {
  if (iso == null) return "—";
  const d = new Date(iso);
  const diff = (d.getTime() - Date.now()) / 1000;
  if (diff < 0) {
    const a = Math.abs(diff);
    if (a < 3600) return `${Math.round(a / 60)}m overdue`;
    if (a < 86400) return `${Math.round(a / 3600)}h overdue`;
    return `${Math.round(a / 86400)}d overdue`;
  }
  if (diff < 3600) return `in ${Math.round(diff / 60)}m`;
  if (diff < 86400) return `in ${Math.round(diff / 3600)}h`;
  return `in ${Math.round(diff / 86400)}d`;
};
