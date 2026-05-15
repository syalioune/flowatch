import { Outlet, useNavigate } from "@tanstack/react-router";
import React from "react";
import { api } from "./api";
import { ApiInspector, SettingsModal, Sidebar, Toaster, Topbar } from "./components";
import { useRouteMeta } from "./lib/route-meta";
import "./lib/window-events";
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

const QUICK_JUMP: ReadonlyArray<{ label: string; path: string }> = [
  { label: "Dashboard", path: "/" },
  { label: "BPMN modeler", path: "/bpmn" },
  { label: "DMN modeler", path: "/dmn" },
  { label: "Deployments", path: "/deployments" },
  { label: "Process definitions", path: "/definitions" },
  { label: "Process instances", path: "/instances" },
  { label: "Jobs", path: "/jobs" },
  { label: "Tasks", path: "/tasks" },
  { label: "History", path: "/history" },
  { label: "Identity", path: "/identity" },
  { label: "Tenants", path: "/tenants" },
];

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
  const meta = useRouteMeta();
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [tenants, setTenants] = React.useState<Tenant[]>([DEFAULT_TENANT]);
  const [tenant, setTenant] = React.useState<Tenant>(DEFAULT_TENANT);
  const [conn, setConn] = React.useState<AppConnectionState>({
    state: "pending",
    host: "connecting…",
  });
  const [navCounts, setNavCounts] = React.useState<
    Partial<Record<"tasks" | "jobs", number | null>>
  >({});

  React.useEffect(() => {
    document.title = meta.title ? `${meta.title} · Flowatch` : "Flowatch";
  }, [meta.title]);

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
  }, [tenant.id]);

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

  React.useEffect(() => {
    const onOpen = () => setInspectorOpen(true);
    window.addEventListener("app:open-inspector", onOpen);
    return () => window.removeEventListener("app:open-inspector", onOpen);
  }, []);

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

  return (
    <div className="app">
      <Sidebar connection={conn} counts={navCounts} onConnClick={() => setSettingsOpen(true)} />
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
      </main>

      <ApiInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        screenEndpoints={meta.endpoints}
        screenTitle={meta.title}
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
          <QuickJumpRow />
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

function QuickJumpRow() {
  const navigate = useNavigate();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      {QUICK_JUMP.map((q) => (
        <button
          key={q.path}
          type="button"
          className="seg-btn"
          onClick={() => navigate({ to: q.path })}
          style={{ fontSize: 11, padding: "5px 8px" }}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}

export default App;
