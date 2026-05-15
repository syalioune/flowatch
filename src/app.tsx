import { Outlet } from "@tanstack/react-router";
import React from "react";
import { api } from "./api";
import { ApiInspector, SettingsModal, Sidebar, Toaster, Topbar } from "./components";
import DATA from "./data";
import { BpmnModeler, DmnModeler } from "./modeler";
import {
  Dashboard,
  Deployments,
  History,
  Identity,
  Jobs,
  ProcessDefinitions,
  ProcessInstances,
  Tasks,
  Tenants,
} from "./screens";
import {
  TweakButton,
  TweakRadio,
  TweakSection,
  TweakSelect,
  TweaksPanel,
  useTweaks,
} from "./tweaks-panel";

const TWEAK_DEFAULTS = {
  look: "editorial",
  theme: "light",
  density: "regular",
  accent: "default",
};

const ACCENT_PALETTES = {
  default: { name: "Default", hue: null },
  cobalt: { name: "Cobalt", light: "oklch(52% 0.18 250)", dark: "oklch(72% 0.18 250)" },
  emerald: { name: "Emerald", light: "oklch(54% 0.15 155)", dark: "oklch(72% 0.15 155)" },
  amber: { name: "Amber", light: "oklch(62% 0.16 60)", dark: "oklch(78% 0.16 60)" },
  magenta: { name: "Magenta", light: "oklch(54% 0.20 340)", dark: "oklch(72% 0.20 340)" },
};

const ENDPOINT_BY_VIEW = {
  dashboard: () => DATA.endpoints.dashboard,
  bpmn: () => DATA.endpoints.bpmnModeler,
  dmn: () => DATA.endpoints.dmnModeler,
  deployments: () => DATA.endpoints.deployments,
  definitions: () => DATA.endpoints.definitions,
  instances: () => DATA.endpoints.instances,
  jobs: () => DATA.endpoints.jobs,
  tasks: () => DATA.endpoints.tasks,
  history: () => DATA.endpoints.history,
  identity: () => DATA.endpoints.identity,
  tenants: () => DATA.endpoints.tenants,
};

const VIEW_TITLE = {
  dashboard: "Dashboard",
  bpmn: "BPMN modeler",
  dmn: "DMN modeler",
  deployments: "Deployments",
  definitions: "Process definitions",
  instances: "Process instances",
  jobs: "Jobs",
  tasks: "Tasks",
  history: "History",
  identity: "Identity",
  tenants: "Tenants",
};

type ViewKey =
  | "dashboard"
  | "bpmn"
  | "dmn"
  | "deployments"
  | "definitions"
  | "instances"
  | "jobs"
  | "tasks"
  | "history"
  | "identity"
  | "tenants";

interface Tenant {
  id: string;
  name: string;
}
interface AppConnectionState {
  state: "pending" | "ok" | "err";
  host: string;
}

const DEFAULT_TENANT: Tenant = { id: "", name: "All tenants" };

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = React.useState<ViewKey>("dashboard");
  const navTo = React.useCallback((v: string) => setView(v as ViewKey), []);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [tenants, setTenants] = React.useState<Tenant[]>([DEFAULT_TENANT]);
  const [tenant, setTenant] = React.useState<Tenant>(DEFAULT_TENANT);
  const [conn, setConn] = React.useState<AppConnectionState>({
    state: "pending",
    host: "connecting…",
  });
  const [navCounts, setNavCounts] = React.useState<Record<string, number | null>>({});

  React.useEffect(() => {
    document.documentElement.dataset.look = t.look as string;
    document.documentElement.dataset.theme = t.theme as string;
    document.documentElement.dataset.density = t.density as string;
    const a = (
      ACCENT_PALETTES as Record<
        string,
        { name: string; hue?: null } | { name: string; light: string; dark: string }
      >
    )[t.accent as string];
    if (a && "light" in a) {
      const c = t.theme === "dark" ? a.dark : a.light;
      document.documentElement.style.setProperty("--accent", c);
    } else {
      document.documentElement.style.removeProperty("--accent");
    }
  }, [t.look, t.theme, t.density, t.accent]);

  React.useEffect(() => {
    (async () => {
      const cfg = api.config();
      const host = cfg.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      try {
        const r = await api.ping();
        setConn({
          state: "ok",
          host: `${host} · ${r?.name || "engine"} ${r?.version || ""}`.trim(),
        });
      } catch (_e) {
        setConn({ state: "err", host: `${host} · unreachable` });
      }
      try {
        const tres = await api.listTenants();
        const list = [DEFAULT_TENANT, ...(tres.data || [])];
        setTenants(list);
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [tasks, jobs] = await Promise.all([
        api.listTasks({ size: 0 }).catch(() => null),
        api.listJobs({ size: 0 }).catch(() => null),
      ]);
      if (cancelled) return;
      setNavCounts({
        tasks: tasks?.total ?? null,
        jobs: jobs?.total ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [view, tenant.id]);

  // Ctrl+Shift+T keyboard shortcut for TweaksPanel
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        window.postMessage({ type: "__activate_edit_mode" }, window.origin);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const openInspector = () => {
    setInspectorOpen(true);
  };

  const handleTweaks = () => {
    window.postMessage({ type: "__activate_edit_mode" }, window.origin);
  };

  const cycleTenant = () => {
    if (tenants.length <= 1) return;
    const i = tenants.findIndex((x) => x.id === tenant.id);
    const next = tenants[(i + 1) % tenants.length];
    if (!next) return;
    setTenant(next);
    api.setConfig({ tenantId: next.id });
  };

  const endpointFn = (
    ENDPOINT_BY_VIEW as Record<
      string,
      (() => ReturnType<typeof DATA.endpoints.dashboard.slice>) | undefined
    >
  )[view];
  const endpoints = (endpointFn || (() => []))();
  const screenTitle = (VIEW_TITLE as Record<string, string>)[view] || view;

  let Screen = null;
  switch (view) {
    case "dashboard":
      Screen = <Dashboard onNav={navTo} onOpenInspector={openInspector} />;
      break;
    case "bpmn":
      Screen = <BpmnModeler onOpenInspector={openInspector} />;
      break;
    case "dmn":
      Screen = <DmnModeler onOpenInspector={openInspector} />;
      break;
    case "deployments":
      Screen = <Deployments onOpenInspector={openInspector} />;
      break;
    case "definitions":
      Screen = <ProcessDefinitions onOpenInspector={openInspector} onNav={navTo} />;
      break;
    case "instances":
      Screen = <ProcessInstances onOpenInspector={openInspector} />;
      break;
    case "jobs":
      Screen = <Jobs onOpenInspector={openInspector} />;
      break;
    case "tasks":
      Screen = <Tasks onOpenInspector={openInspector} />;
      break;
    case "history":
      Screen = <History onOpenInspector={openInspector} />;
      break;
    case "identity":
      Screen = <Identity onOpenInspector={openInspector} />;
      break;
    case "tenants":
      Screen = <Tenants onOpenInspector={openInspector} tenants={tenants.filter((x) => x.id)} />;
      break;
    default:
      Screen = <Dashboard onNav={navTo} onOpenInspector={openInspector} />;
  }

  return (
    <div className="app">
      <Sidebar
        active={view}
        onNav={navTo}
        connection={conn}
        counts={navCounts}
        onConnClick={() => setSettingsOpen(true)}
      />
      <Topbar
        tenant={tenant}
        tenants={tenants}
        onTenant={cycleTenant}
        theme={t.theme as "light" | "dark"}
        onTheme={(v) => setTweak("theme", v)}
        onInspector={() => setInspectorOpen(!inspectorOpen)}
        inspectorOpen={inspectorOpen}
        onSettings={() => setSettingsOpen(true)}
        onTweaks={handleTweaks}
      />
      <main className="main">
        <Outlet />
        {/* Legacy view-state switch. Stories 3.2-3.5 migrate screens to
            routes one by one, deleting cases from the switch as they go.
            Story 3.6 removes the switch entirely. */}
        {Screen}
      </main>

      <ApiInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        screenEndpoints={endpoints}
        screenTitle={screenTitle}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Toaster />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Aesthetic">
          <TweakRadio
            label="Look"
            value={t.look}
            options={[
              { value: "editorial", label: "Editorial" },
              { value: "terminal", label: "Terminal" },
              { value: "industrial", label: "Industrial" },
            ]}
            onChange={(v) => setTweak("look", v)}
          />
          <TweakRadio
            label="Theme"
            value={t.theme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            onChange={(v) => setTweak("theme", v)}
          />
          <TweakRadio
            label="Density"
            value={t.density}
            options={[
              { value: "compact", label: "Compact" },
              { value: "regular", label: "Regular" },
              { value: "comfy", label: "Comfy" },
            ]}
            onChange={(v) => setTweak("density", v)}
          />
        </TweakSection>
        <TweakSection label="Accent">
          <TweakSelect
            label="Color"
            value={t.accent}
            options={Object.entries(ACCENT_PALETTES).map(([k, v]) => ({ value: k, label: v.name }))}
            onChange={(v) => setTweak("accent", v)}
          />
        </TweakSection>
        <TweakSection label="Quick jump">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {Object.entries(VIEW_TITLE).map(([k, v]) => (
              <button
                key={k}
                className="seg-btn"
                data-on={view === k ? "1" : "0"}
                onClick={() => setView(k as ViewKey)}
                style={{ fontSize: 11, padding: "5px 8px" }}
              >
                {v}
              </button>
            ))}
          </div>
        </TweakSection>
        <TweakSection label="API">
          <TweakButton label="Open Inspector" onClick={() => setInspectorOpen(true)} />
          <TweakButton
            label="Configure connection…"
            onClick={() => setSettingsOpen(true)}
            secondary
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

export default App;
