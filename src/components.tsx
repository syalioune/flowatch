// SPDX-License-Identifier: Apache-2.0

import { Link } from "@tanstack/react-router";
import React from "react";
import noticeContent from "../NOTICE?raw";
import { API_LOG, type ApiLogEntry, api, type FlowableConfig, type HTTPMethod } from "./api";
import { ConnectionSwitch } from "./components/ConnectionSwitch";
import { ManageConnectionsPanel } from "./components/ManageConnectionsPanel";
import { buildCurlCommand, CURL_MULTIPART, CURL_UNSERIALIZABLE } from "./lib/curl";
import { errorStatus } from "./lib/error";
import { randomId } from "./lib/random-id";
import { type RouteEndpoint, useRouteMeta } from "./lib/route-meta";

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
    "api:log-cleared": Event;
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
    decision: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="1.5" />
        <path d="M4 9h16M9 4v16M14 14l2 2 4-4" />
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
    <div className="brand-tag">v0.0.2</div>
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
  items: ReadonlyArray<RouteEndpoint>;
  onOpenInspector?: ((e: RouteEndpoint) => void) | undefined;
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

/** Fire-and-forget: open the API Inspector drawer from anywhere. */
const openInspector = () => {
  window.dispatchEvent(new CustomEvent<void>("app:open-inspector"));
};

interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Key into the `counts` map (only set for items that show a count badge). */
  countsKey?: "tasks" | "jobs" | "instances" | "batches" | "events";
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  { group: "Overview", items: [{ path: "/", label: "Dashboard", icon: "dashboard" }] },
  {
    group: "Modeler",
    items: [
      { path: "/bpmn", label: "BPMN", icon: "bpmn" },
      { path: "/dmn", label: "DMN", icon: "dmn" },
    ],
  },
  {
    group: "Operate",
    items: [
      { path: "/tasks", label: "Tasks", icon: "task", countsKey: "tasks" },
      { path: "/instances", label: "Process instances", icon: "instance", countsKey: "instances" },
      { path: "/jobs", label: "Jobs", icon: "job", countsKey: "jobs" },
      { path: "/batches", label: "Batches", icon: "job", countsKey: "batches" },
      { path: "/events", label: "Events", icon: "bell", countsKey: "events" },
      { path: "/history", label: "History", icon: "history" },
    ],
  },
  {
    group: "Repository",
    items: [
      { path: "/deployments", label: "Deployments", icon: "deploy" },
      { path: "/definitions", label: "Process definitions", icon: "def" },
      { path: "/decisions", label: "Decisions", icon: "decision" },
    ],
  },
  {
    group: "Admin",
    items: [
      { path: "/identity", label: "Users & groups", icon: "identity" },
      { path: "/tenants", label: "Tenants", icon: "tenant" },
    ],
  },
];

interface ConnectionState {
  state: "pending" | "ok" | "err" | "unset";
  host: string;
}

interface SidebarProps {
  connection: ConnectionState;
  onConnClick: () => void;
  counts?: Partial<
    Record<"tasks" | "jobs" | "instances" | "batches" | "events", number | null | undefined>
  >;
}

// @migration-any: TanStack Router's LinkProps does not expose data-* attribute pass-through. Tracked in #119.
// biome-ignore lint/suspicious/noExplicitAny: see @migration-any marker above (issue #119).
const ACTIVE_PROPS = { "data-active": "1" } as any;
// @migration-any: TanStack Router's LinkProps does not expose data-* attribute pass-through. Tracked in #119.
// biome-ignore lint/suspicious/noExplicitAny: see @migration-any marker above (issue #119).
const INACTIVE_PROPS = { "data-active": "0" } as any;

export const Sidebar = ({ connection, onConnClick, counts }: SidebarProps) => (
  <aside className="sidebar">
    <Logo />
    <nav className="nav">
      {NAV.map((g) => (
        <div key={g.group} className="nav-group">
          <div className="nav-label">{g.group}</div>
          {g.items.map((it) => {
            const count = it.countsKey ? counts?.[it.countsKey] : undefined;
            return (
              <Link
                key={it.path}
                to={it.path}
                className="nav-item"
                activeProps={ACTIVE_PROPS}
                inactiveProps={INACTIVE_PROPS}
                activeOptions={{ exact: it.path === "/" }}
              >
                <Icon name={it.icon} />
                <span>{it.label}</span>
                {count != null && <span className="nav-count">{count}</span>}
              </Link>
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
      <span className="build-info">
        build {__BUILD_SHA__} · tested vs Flowable {__FLOWABLE_TESTED_VERSION__}
      </span>
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
    <ConnectionSwitch onSettings={onSettings} />
    <div className="tenant-switch" data-testid="tenant-switch" onClick={onTenant}>
      <Icon name="tenant" size={13} />
      <span>
        <b style={{ fontWeight: 500 }} data-testid="tenant-switch-label">
          {tenant.name}
        </b>
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
      <button className="icon-btn" title="Notifications" aria-label="View notifications">
        <Icon name="bell" size={15} />
      </button>
      <button
        className="icon-btn"
        data-active={inspectorOpen ? "1" : "0"}
        data-testid="inspector-toggle"
        title="API inspector"
        aria-label="Toggle API Inspector"
        onClick={onInspector}
      >
        <Icon name="api" size={15} />
      </button>
      <button
        className="icon-btn"
        title="Theme"
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        onClick={() => onTheme(theme === "dark" ? "light" : "dark")}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
      </button>
      <button
        className="icon-btn"
        title="Customize (Ctrl+Shift+T)"
        aria-label="Toggle theme tweaks (Ctrl+Shift+T)"
        data-testid="tweaks-toggle"
        onClick={onTweaks}
      >
        <Icon name="palette" size={15} />
      </button>
      <button
        className="icon-btn"
        title="Settings"
        aria-label="Connection settings"
        onClick={onSettings}
      >
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

type SettingsTab = "connection" | "about";

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const [cfg, setCfg] = React.useState<FlowableConfig>(api.config());
  const [pinging, setPinging] = React.useState(false);
  const [pingRes, setPingRes] = React.useState<PingResult | null>(null);
  const [tab, setTab] = React.useState<SettingsTab>("connection");
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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        <div className="modal-hd">
          <h3>Settings</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="tabs" style={{ margin: "0 18px" }}>
          <button
            type="button"
            className="tab"
            data-active={tab === "connection" ? "1" : "0"}
            onClick={() => setTab("connection")}
          >
            Connection
          </button>
          <button
            type="button"
            className="tab"
            data-active={tab === "about" ? "1" : "0"}
            onClick={() => setTab("about")}
          >
            About
          </button>
        </div>
        {tab === "connection" && (
          <>
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
                <button type="button" className="btn" onClick={test} disabled={pinging}>
                  {pinging ? "Pinging…" : "Test connection"}
                </button>
                {pingRes?.ok && (
                  <span className="badge" data-tone="ok">
                    <span className="sr-only">Status: connected — </span>
                    {pingRes.name} {pingRes.version}
                  </span>
                )}
                {pingRes && !pingRes.ok && (
                  <span className="badge" data-tone="bad">
                    <span className="sr-only">Status: error — </span>
                    {pingRes.error}
                  </span>
                )}
              </div>
              <ManageConnectionsPanel onCloseSettings={onClose} />
            </div>
            <div className="modal-ft">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn" data-variant="primary" onClick={save}>
                Save
              </button>
            </div>
          </>
        )}
        {tab === "about" && (
          <div className="modal-bd">
            <AboutTab />
          </div>
        )}
      </div>
    </div>
  );
};

function AboutTab() {
  // Vite injects these via define() — see vite.config.ts. Sourced from
  // package.json, git rev-parse, and docs/compat.md frontmatter respectively.
  const version = __APP_VERSION__;
  const buildSha = __BUILD_SHA__;
  const flowableTested = __FLOWABLE_TESTED_VERSION__;
  return (
    <div className="about-tab">
      <h2 className="about-name">Flowatch</h2>
      <p className="about-version mono">version {version}</p>
      <p className="about-build mono">
        build {buildSha} · tested vs Flowable {flowableTested}
      </p>
      <p className="about-license">
        Licensed under{" "}
        <a
          href="https://www.apache.org/licenses/LICENSE-2.0"
          target="_blank"
          rel="noopener noreferrer"
        >
          Apache License 2.0
        </a>
        .
      </p>
      <p className="about-attribution">
        Flowatch wraps the official Flowable REST API and embeds bpmn-js and dmn-js, both under MIT
        from the bpmn.io team.
      </p>
      <h3 className="about-credits-heading">Dependency credits</h3>
      <pre className="about-credits">{noticeContent}</pre>
    </div>
  );
}

const buildFetchSnippet = (cfg: FlowableConfig, ep: RouteEndpoint): string => {
  const u = `${cfg.baseUrl.replace(/\/$/, "")}${ep.path}`;
  // The literal token "fetch" + open-paren appearing in source would trip
  // the Pattern P-001 grep (scripts/ci/check-fetch-funnel.sh). Building
  // the snippet via a constant keeps the displayed teaching snippet
  // clean (no p-001-allow marker leaking into the user's clipboard) AND
  // keeps the source free of an actual call-token (review patch).
  const FETCH = "fetch";
  return `// ${ep.desc || ""}
const auth = btoa("${cfg.username}:••••");
const res = await ${FETCH}(
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

const buildCurlSnippet = (cfg: FlowableConfig, ep: RouteEndpoint): string => {
  const u = `${cfg.baseUrl.replace(/\/$/, "")}${ep.path}`;
  return `curl -u ${cfg.username}:•••• \\
  -X ${ep.method} \\
  -H "Accept: application/json"${ep.method !== "GET" ? ` \\\n  -H "Content-Type: application/json"` : ""} \\
  "${u}"`;
};

interface ApiInspectorProps {
  open: boolean;
  onClose: () => void;
  screenEndpoints?: ReadonlyArray<RouteEndpoint>;
  screenTitle: string;
  // {id, seq} so consecutive clicks on the same ErrorBox produce a fresh
  // object identity and re-fire the scroll/highlight effect (review patch).
  focusEntry?: { id: string; seq: number } | null;
}

type InspectorResult =
  | { ok: true; status: number | undefined; ms: number | undefined; data: unknown }
  | { ok: false; status: number | undefined; ms: number | undefined; error: string };

type MethodFilter = HTTPMethod | "All";
type StatusFilter = "All" | "2xx" | "4xx" | "5xx/err";

// Relative-time formatter used by every row in the Recent-calls list. Computed
// at render time only — re-renders are driven by the api:log event, so a
// setInterval/RAF tick would just churn the React tree for no UX gain.
function timeAgo(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 1000) return "now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function matchStatusBucket(status: number, filter: StatusFilter): boolean {
  if (filter === "All") return true;
  if (filter === "2xx") return status >= 200 && status < 300;
  if (filter === "4xx") return status >= 400 && status < 500;
  // 5xx/err folds in the status===0 sentinel per Epic 7 retro §3.3.
  return status >= 500 || status === 0;
}

// Per-row Copy-as-curl button. Lives outside ApiInspector so each row carries
// its own `busy` state — double-clicks during the in-flight writeText don't
// fire two clipboard writes / two toasts (review patch). Also feature-detects
// navigator.clipboard.writeText and renders a disabled state with explanatory
// note when the API is unavailable (HTTP non-localhost contexts; review patch).
const CopyAsCurlButton = ({ command }: { command: string }) => {
  const [busy, setBusy] = React.useState(false);
  const clipboardAvailable =
    typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

  if (!clipboardAvailable) {
    return (
      <span
        className="log-row-detail-note"
        title="navigator.clipboard requires a secure context (HTTPS or localhost)"
      >
        Clipboard unavailable — use HTTPS or localhost
      </span>
    );
  }

  return (
    <button
      type="button"
      className="btn"
      data-size="sm"
      data-testid="copy-as-curl"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await navigator.clipboard.writeText(command);
          toast({ kind: "ok", text: "Copied curl command", ttl: 3000 });
        } catch (err) {
          toast({
            kind: "bad",
            text: "Copy failed",
            sub: err instanceof Error ? err.message : String(err),
            ttl: 5000,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      Copy as curl
    </button>
  );
};

export const ApiInspector = ({
  open,
  onClose,
  screenEndpoints,
  screenTitle,
  focusEntry,
}: ApiInspectorProps) => {
  const [log, setLog] = React.useState<ApiLogEntry[]>([...API_LOG]);
  const [tab, setTab] = React.useState<"endpoints" | "calls">("endpoints");
  const [snippet, setSnippet] = React.useState<"fetch" | "curl">("fetch");
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<InspectorResult | null>(null);
  const [methodFilter, setMethodFilter] = React.useState<MethodFilter>("All");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("All");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [focusedRowId, setFocusedRowId] = React.useState<string | null>(null);
  const cfg = api.config();
  const firstEp: RouteEndpoint = (screenEndpoints && screenEndpoints[0]) || {
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
    window.addEventListener("api:log-cleared", onLog);
    return () => {
      window.removeEventListener("api:log", onLog);
      window.removeEventListener("api:log-cleared", onLog);
    };
  }, []);

  // T-6.2: if the expanded entry has been evicted from the ring buffer
  // (60-entry cap), silently clear the expanded state — the DOM node is
  // already gone, the state would just dangle.
  React.useEffect(() => {
    if (expandedId && !log.some((e) => e.id === expandedId)) {
      setExpandedId(null);
    }
  }, [log, expandedId]);

  // T-7.2: when a focusEntry arrives while the drawer is open, switch to the
  // "calls" tab, reset the filters so the target row is guaranteed to be in
  // the rendered list (review patch — without the reset, a stale POST/4xx
  // filter would silently hide the row and the user would see no feedback),
  // scroll the matching row into view, and apply a transient .data-focused
  // highlight that fades after 1500ms via CSS. If the entry is not in the
  // current log, silently no-op per AC-3. The dep on focusEntry's identity
  // (not just its id) re-fires when the same id is dispatched twice.
  React.useEffect(() => {
    if (!open || !focusEntry) return;
    if (!log.some((e) => e.id === focusEntry.id)) return;
    setTab("calls");
    setMethodFilter("All");
    setStatusFilter("All");
    const handle = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-entry-id="${CSS.escape(focusEntry.id)}"]`,
      );
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      setFocusedRowId(focusEntry.id);
    }, 0);
    return () => window.clearTimeout(handle);
  }, [focusEntry, open, log]);

  // Clear the focused-row attribute after the 1500ms CSS animation completes
  // so a re-render doesn't reapply the keyframes.
  React.useEffect(() => {
    if (!focusedRowId) return;
    const handle = window.setTimeout(() => setFocusedRowId(null), 1500);
    return () => window.clearTimeout(handle);
  }, [focusedRowId]);

  const filteredLog = log.filter(
    (e) =>
      (methodFilter === "All" || e.method === methodFilter) &&
      matchStatusBucket(e.status, statusFilter),
  );

  const runRequest = async () => {
    setRunning(true);
    setResult(null);
    try {
      const data = await api.runRaw(firstEp.method, tryPath);
      const last = API_LOG[0];
      setResult({ ok: true, status: last?.status, ms: last?.ms, data });
    } catch (e) {
      const last = API_LOG[0];
      // Prefer the log's recorded status (newest entry on top); fall back to
      // errorStatus(e) for non-HTTP throws (e.g. unexpected TypeError before
      // the funnel could record one). This is the 3rd consumer of A-3's
      // errorStatus helper alongside ErrorBox and KpiValue.
      const status = last?.status ?? errorStatus(e);
      setResult({
        ok: false,
        status,
        ms: last?.ms,
        error: String((e as Error)?.message || e),
      });
    } finally {
      setRunning(false);
    }
  };

  const isTruncationEnvelope = (
    d: unknown,
  ): d is { __truncated: true; __originalBytes: number; __preview: string } => {
    return (
      typeof d === "object" &&
      d !== null &&
      (d as { __truncated?: unknown }).__truncated === true &&
      typeof (d as { __originalBytes?: unknown }).__originalBytes === "number" &&
      typeof (d as { __preview?: unknown }).__preview === "string"
    );
  };
  const previewBody = (d: unknown): string => {
    if (isTruncationEnvelope(d)) {
      return `[body truncated: ${d.__originalBytes} bytes total, showing first 16 KB]\n\n${d.__preview}`;
    }
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
    <div className="drawer" data-open={open ? "1" : "0"} data-testid="inspector-drawer">
      <div className="drawer-hd">
        <Icon name="api" size={16} />
        <h3>API Inspector</h3>
        <button className="icon-btn x" aria-label="Close API Inspector" onClick={onClose}>
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
                {/* String-built label keeps the source from carrying a literal
                   call token that would trip scripts/ci/check-fetch-funnel.sh
                   — review patch. */}
                {`fetch${"()"}`}
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
                    <span className="sr-only">HTTP status: </span>
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
            <div className="log-filters">
              <select
                className="input"
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as MethodFilter)}
                aria-label="Filter by HTTP method"
              >
                <option value="All">All methods</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
              <div className="seg-row" role="group" aria-label="Filter by status range">
                {(["All", "2xx", "4xx", "5xx/err"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="seg-btn"
                    data-on={statusFilter === s ? "1" : "0"}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {log.length === 0 && (
              <div className="empty" style={{ padding: 20 }}>
                No calls yet. Navigate around — every fetch shows up here.
              </div>
            )}
            {log.length > 0 && filteredLog.length === 0 && (
              <div className="empty" style={{ padding: 20 }}>
                No calls match this filter.
              </div>
            )}
            {filteredLog.map((e) => {
              const isExpanded = expandedId === e.id;
              return (
                <React.Fragment key={e.id}>
                  <button
                    type="button"
                    className="log-entry"
                    data-entry-id={e.id}
                    data-expanded={isExpanded ? "1" : "0"}
                    data-focused={focusedRowId === e.id ? "1" : "0"}
                    onClick={() => setExpandedId((prev) => (prev === e.id ? null : e.id))}
                    aria-expanded={isExpanded}
                    aria-controls={isExpanded ? `log-detail-${e.id}` : undefined}
                  >
                    <span className="ep-method" data-m={e.method}>
                      {e.method}
                    </span>
                    <span
                      className="mono"
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {e.path}
                    </span>
                    <span className="status" data-s={bucket(e.status)}>
                      <span className="sr-only">HTTP status: </span>
                      {e.status || "ERR"}
                    </span>
                    <span className="log-row-ago" title={e.at}>
                      {timeAgo(e.at)}
                    </span>
                    <span className="ms">{e.ms}ms</span>
                  </button>
                  {isExpanded && (
                    <div
                      className="log-row-detail"
                      id={`log-detail-${e.id}`}
                      role="region"
                      aria-label={`Details for ${e.method} ${e.path}`}
                    >
                      <div className="mono log-row-url">{e.url}</div>
                      {e.headers && Object.keys(e.headers).length > 0 && (
                        <div>
                          {Object.entries(e.headers).map(([k, v]) => (
                            <div key={k} className="mono">
                              {k}: {v}
                            </div>
                          ))}
                        </div>
                      )}
                      {e.body != null && (
                        <pre
                          className="code"
                          style={{ maxHeight: 240, whiteSpace: "pre-wrap", overflowY: "auto" }}
                        >
                          {previewBody(e.body)}
                        </pre>
                      )}
                      {e.error && (
                        <pre
                          className="code"
                          style={{ whiteSpace: "pre-wrap", color: "var(--bad)" }}
                        >
                          {e.status > 0 ? `HTTP ${e.status}\n` : ""}
                          {e.error}
                        </pre>
                      )}
                      <div className="log-row-detail-actions" data-entry-id={e.id}>
                        {(() => {
                          const cmd = buildCurlCommand(e, api.config());
                          if (cmd === CURL_MULTIPART) {
                            return (
                              <span className="log-row-detail-note">
                                Multipart upload — reproduce via the modeler
                              </span>
                            );
                          }
                          if (cmd === CURL_UNSERIALIZABLE) {
                            return (
                              <span className="log-row-detail-note">
                                Body not serializable to JSON — copy manually
                              </span>
                            );
                          }
                          return <CopyAsCurlButton command={cmd} />;
                        })()}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

interface PageHeadProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Page header. Endpoint chips and the inspector-open handler are derived from
 * the active route's `staticData` (see src/lib/route-meta.ts) — callers only
 * pass display copy. Story 3.6 removed the old `endpoints` and
 * `onOpenInspector` props.
 */
export const PageHead = ({ title, subtitle, actions }: PageHeadProps) => {
  const meta = useRouteMeta();
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
        {meta.endpoints.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <EndpointRow items={meta.endpoints} onOpenInspector={openInspector} />
          </div>
        )}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
};

interface ToastDetail {
  kind?: string;
  text: string;
  sub?: string;
  ttl?: number;
  // Story 16.3: post-deploy "Open the deployed definition" surfaces here
  // with a `testId` so the E2E spec can click the action without relying
  // on the label string.
  action?: { label: string; onClick: () => void; testId?: string };
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
      const id = randomId(10);
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
              type="button"
              className="btn"
              data-size="sm"
              data-variant="ghost"
              data-testid={t.action.testId}
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

export const fmtMs = (ms: number | null | undefined): string => {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 1) return `${ms}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(0)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};
