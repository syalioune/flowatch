// SPDX-License-Identifier: Apache-2.0

import { Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { api } from "./api";
import { ApiInspector, SettingsModal, Sidebar, Toaster, Topbar } from "./components";
import { KeyboardCheatsheetModal } from "./lib/keyboard-cheatsheet-modal";
import { NAV_INVALIDATE_COUNTS } from "./lib/nav-events";
import { useRouteMeta } from "./lib/route-meta";
import { listShortcutsByCategory } from "./lib/shortcuts";
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
  { label: "Decisions", path: "/decisions" },
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
  state: "pending" | "ok" | "err" | "unset";
  host: string;
}

const DEFAULT_TENANT: Tenant = { id: "", name: "All tenants" };

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const meta = useRouteMeta();
  const router = useRouter();
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  // A fresh object identity per click so consecutive ErrorBox clicks on the
  // same id re-trigger the scroll/highlight effect (review patch — naked
  // string state was a no-op when React saw an identical value).
  const [focusEntry, setFocusEntry] = React.useState<{ id: string; seq: number } | null>(null);
  const focusSeqRef = React.useRef(0);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = React.useState(false);
  const navigate = useNavigate();
  const [tenants, setTenants] = React.useState<Tenant[]>([DEFAULT_TENANT]);
  const [tenant, setTenant] = React.useState<Tenant>(DEFAULT_TENANT);
  const [conn, setConn] = React.useState<AppConnectionState>({
    state: "pending",
    host: "connecting…",
  });
  const [navCounts, setNavCounts] = React.useState<
    Partial<Record<"tasks" | "jobs" | "instances", number | null>>
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

  // Sequence guard: each probe() bumps the counter; commits to `setConn`
  // only when the in-flight call's sequence still matches `latest`. Prevents
  // (a) stale resolution from clobbering a fresher probe and (b) state
  // updates after unmount.
  const probeSeq = React.useRef(0);
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const probe = React.useCallback(async (): Promise<void> => {
    const cfg = api.config();
    const host = cfg.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const seq = ++probeSeq.current;
    const commit = (next: AppConnectionState): void => {
      if (!mountedRef.current || seq !== probeSeq.current) return;
      setConn(next);
    };
    commit({ state: "pending", host: "connecting…" });
    try {
      const r = await api.ping();
      commit({ state: "ok", host: `${r.name} ${r.version} @ ${host}` });
    } catch (_e) {
      commit({ state: "err", host: `unreachable: ${host}` });
    }
  }, []);

  const refetchTenants = React.useCallback(async (): Promise<void> => {
    try {
      const tres = await api.listTenants();
      const list = [DEFAULT_TENANT, ...(tres.data || [])];
      setTenants(list);
    } catch {}
  }, []);

  React.useEffect(() => {
    void probe();
    void refetchTenants();
  }, [probe, refetchTenants]);

  // Story 23.1: a connection switch (Topbar `.connection-switch` chip OR the
  // SettingsModal Manage section dropdown) funnels through `api.setConfig` →
  // dispatches `conn:config-changed`. We re-probe, reset local tenant state
  // to `All tenants` (cross-engine tenant lists differ — the previous engine's
  // tenant id may not exist on the new one), re-fetch the tenant list, and
  // invalidate the active route's loader (mirrors `cycleTenant`).
  //
  // Review patch: we do NOT call `api.setConfig({tenantId: ""})` here — that
  // would (a) clobber the tenantId the just-selected `SavedConnection` wrote
  // through `setActiveConnection`, and (b) re-dispatch `conn:config-changed`
  // re-entering this same handler. The React `tenant` state reset is enough
  // — the engine cfg's tenantId now reflects the new connection's choice.
  React.useEffect(() => {
    const handler = (): void => {
      void probe();
      setTenant(DEFAULT_TENANT);
      void refetchTenants();
      void router.invalidate();
    };
    window.addEventListener("conn:config-changed", handler);
    return () => window.removeEventListener("conn:config-changed", handler);
  }, [probe, refetchTenants, router]);

  // Sidebar count fetch — wrapped in a stable callback so the tenant-change
  // effect AND the `nav:invalidate-counts` window listener both call it.
  //
  // Sequence-counter race guard (replaces the earlier in-flight ref): every
  // call bumps the counter; only the latest call's result commits to state.
  // The in-flight ref was over-conservative — when a rapid sequence of
  // mutations (e.g. claim → complete) dispatched `nav:invalidate-counts`
  // multiple times in quick succession, the second listener call no-op'd
  // because the first fetch was still in flight, leaving the badge stale
  // until the next manual refresh.
  const refreshNavCountsSeq = React.useRef(0);
  const refreshNavCounts = React.useCallback(async () => {
    const seq = ++refreshNavCountsSeq.current;
    // Story 12.2 review patch: the Jobs sidebar pill now cumulates all three
    // /jobs tabs (executable + timer + dead-letter) so the operator's
    // mental model matches the /jobs screen surface. Pre-Epic-12 this was
    // just listJobs.total (executable only).
    const [tasks, jobs, timerJobs, deadJobs, instances] = await Promise.all([
      api.listTasks({ size: 0 }).catch(() => null),
      api.listJobs({ size: 0 }).catch(() => null),
      api.listTimerJobs({ size: 0 }).catch(() => null),
      api.listDeadLetterJobs({ size: 0 }).catch(() => null),
      api.listProcessInstances({ size: 0 }).catch(() => null),
    ]);
    if (seq !== refreshNavCountsSeq.current) return; // stale fetch — newer call in flight
    const totalJobs =
      jobs == null && timerJobs == null && deadJobs == null
        ? null
        : (jobs?.total ?? 0) + (timerJobs?.total ?? 0) + (deadJobs?.total ?? 0);
    setNavCounts({
      tasks: tasks?.total ?? null,
      jobs: totalJobs,
      instances: instances?.total ?? null,
    });
    // tenant.id is read indirectly via api.config() inside the API calls;
    // include it so the callback identity changes on tenant switch.
  }, [tenant.id]);

  React.useEffect(() => {
    void refreshNavCounts();
  }, [refreshNavCounts]);

  React.useEffect(() => {
    const handler = (): void => {
      void refreshNavCounts();
    };
    window.addEventListener(NAV_INVALIDATE_COUNTS, handler);
    return () => window.removeEventListener(NAV_INVALIDATE_COUNTS, handler);
  }, [refreshNavCounts]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey)) return;
      // Case-insensitive: Shift normally produces uppercase T but layout /
      // lock-state quirks can yield lowercase. Accept both.
      if (e.key !== "T" && e.key !== "t") return;
      // Story 17.2: suppress when typing inside an editable element so the
      // global search (and any future <input>/<textarea>/<select>/
      // [contenteditable]) doesn't lose its Shift+T keystroke + accidentally
      // toggle the panel. Browser-default Ctrl+Shift+T (re-open closed tab)
      // is intentionally overridden in the app's focus context — operator
      // convention; matches the VSCode-style precedent.
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      window.postMessage({ type: "__activate_edit_mode" }, window.origin);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  React.useEffect(() => {
    const onOpen = (e: WindowEventMap["app:open-inspector"]) => {
      const id = e.detail?.focusEntryId;
      if (id) {
        // Bump the seq counter so a click on the same ErrorBox twice creates
        // a fresh object identity and re-fires the drawer's scroll effect.
        focusSeqRef.current += 1;
        setFocusEntry({ id, seq: focusSeqRef.current });
      }
      setInspectorOpen(true);
    };
    window.addEventListener("app:open-inspector", onOpen);
    return () => window.removeEventListener("app:open-inspector", onOpen);
  }, []);

  // Clear focusEntry when the drawer closes so the next open (without a
  // fresh ErrorBox click) doesn't re-trigger scroll-to-row from a stale id.
  React.useEffect(() => {
    if (!inspectorOpen) setFocusEntry(null);
  }, [inspectorOpen]);

  // Story 18.4 — `?` (Shift+/) opens the cheatsheet from anywhere outside
  // an editable element. Mirrors the Ctrl+Shift+T short-circuit shape.
  // Browsers report `e.key === "?"` for Shift+/ on US layouts; for layout
  // / IME quirks we fall back to `e.shiftKey && e.key === "/"`.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isQuestionMark = e.key === "?" || (e.shiftKey && e.key === "/");
      if (!isQuestionMark) return;
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setCheatsheetOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Story 18.4 — `g`-prefix chord listener. The first `g` sets a 1500ms
  // TTL; the next key (within TTL) checks the registry's nav-* targets;
  // if a target matches, navigate and clear. Esc / blur / editable-focus
  // cancels the chord.
  React.useEffect(() => {
    const navTargets: Record<string, string> = {};
    const groups = listShortcutsByCategory();
    for (const entry of groups.navigation) {
      if (entry.keys.length === 2 && entry.keys[0] === "g" && entry.target) {
        const second = entry.keys[1];
        if (second) navTargets[second] = entry.target;
      }
    }

    let awaiting: ReturnType<typeof setTimeout> | null = null;
    const clearAwait = () => {
      if (awaiting !== null) {
        clearTimeout(awaiting);
        awaiting = null;
      }
    };

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;
      if (editable) {
        clearAwait();
        return;
      }
      if (e.key === "Escape") {
        clearAwait();
        return;
      }
      if (awaiting === null) {
        if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.altKey) {
          awaiting = setTimeout(() => {
            awaiting = null;
          }, 1500);
        }
        return;
      }
      // Awaiting second key.
      const dest = navTargets[e.key];
      clearAwait();
      if (dest) {
        e.preventDefault();
        void navigate({ to: dest });
      }
    };

    const onBlur = () => clearAwait();
    window.addEventListener("keydown", handler);
    window.addEventListener("blur", onBlur);
    return () => {
      clearAwait();
      window.removeEventListener("keydown", handler);
      window.removeEventListener("blur", onBlur);
    };
  }, [navigate]);

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
    // Story 14.4 AC-7: re-run the active route's loader against the new
    // tenant. The badge-count refetch is handled separately by the
    // refreshNavCounts effect on tenant.id change.
    void router.invalidate();
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
        focusEntry={focusEntry}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <KeyboardCheatsheetModal open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />

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
