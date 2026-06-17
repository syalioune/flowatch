# Source Tree Analysis

Annotated directory tree of the Flowatch repository, scanned 2026-05-11.

```
flowatch/                          # local dir currently still named `conduit/`
├── src/                          # ─── Application source ────────────────
│   ├── main.jsx                  # React root; imports bpmn-js / dmn-js CSS once
│   ├── app.jsx                   # Top-level <App/>: routing (view switch),
│   │                             # tenants, connection state, settings, tweaks
│   ├── api.js                    # Flowable REST client (single request() funnel,
│   │                             # API_LOG ring buffer, dispatches api:log events)
│   ├── data.js                   # Per-screen endpoint metadata (Inspector chips)
│   ├── components.jsx            # Reusable UI: Sidebar, Topbar, ApiInspector,
│   │                             # SettingsModal, PageHead, Toaster, EndpointChip,
│   │                             # Icon, fmtTime/fmtDue helpers
│   ├── screens.jsx               # All data screens: Dashboard, Deployments,
│   │                             # ProcessDefinitions, ProcessInstances, Jobs,
│   │                             # Tasks, History, Identity, Tenants
│   │                             # + the local `useApi()` hook
│   ├── modeler.jsx               # <BpmnModeler/> and <DmnModeler/> — wrap the
│   │                             # vanilla bpmn-js / dmn-js classes in refs
│   ├── tweaks-panel.jsx          # Floating dev-time control panel
│   │                             # (Ctrl+Shift+T): look/theme/density/accent
│   └── styles.css                # Single ~32 KB stylesheet — all theming via
│                                 # data attributes on <html>; no Tailwind/CSS-in-JS
│
├── docker/                       # ─── Local infrastructure ─────────────
│   └── nginx.conf                # CORS proxy: listens on :8080, forwards
│                                 # /flowable-rest/* to the flowable container
│
├── docs/                         # ─── This documentation (BMad output) ─
│
├── .claude/                      # ─── Claude Code config ───────────────
│   └── commands/
│       ├── flowable-status.md    # /flowable-status slash command
│       └── deploy-process.md     # /deploy-process <file> slash command
│
├── _bmad/                        # BMad Method install (skills, agents, configs)
├── _bmad-output/                 # BMad-generated planning/implementation artifacts
│
├── dist/                         # ─── Build output (gitignored) ────────
├── node_modules/                 # ─── Dependencies (gitignored) ────────
│
├── package.json                  # 4 deps (react, react-dom, bpmn-js, dmn-js)
│                                 # 2 dev deps (vite, @vitejs/plugin-react)
│                                 # Scripts: dev, build, preview — no test/lint
├── vite.config.js                # React plugin, Flowable proxy on :5173,
│                                 # manualChunks (bpmn, dmn, react)
├── docker-compose.yml            # postgres + flowable (native CORS)
├── index.html                    # Vite entry HTML — loads /src/main.jsx
├── CLAUDE.md                     # AI-agent contract (conventions, no-go's)
└── README.md                     # ⚠️ Stale handoff bundle notice — see note below
```

## Critical folders

### [src/](../src/) — application code

Flat structure, no subfolders. Nine source files; the largest are [styles.css](../src/styles.css) (~33 KB), [screens.jsx](../src/screens.jsx) (~47 KB), and [modeler.jsx](../src/modeler.jsx) (~36 KB). Everything else is < 20 KB.

**Entry points:**

- HTML entry: [index.html](../index.html) → `<script type="module" src="/src/main.jsx">`
- JS entry: [src/main.jsx](../src/main.jsx) — mounts `<App/>` on `#root`
- App shell: [src/app.jsx](../src/app.jsx) — owns routing state and global modals

**Component layers (no folders, all in flat files):**

- Shell + chrome: `Sidebar`, `Topbar`, `SettingsModal`, `ApiInspector`, `Toaster` (in [components.jsx](../src/components.jsx))
- Routed screens: `Dashboard`, `Deployments`, `ProcessDefinitions`, `ProcessInstances`, `Jobs`, `Tasks`, `History`, `Identity`, `Tenants` (in [screens.jsx](../src/screens.jsx))
- Diagram editors: `BpmnModeler`, `DmnModeler` (in [modeler.jsx](../src/modeler.jsx))
- Dev tools: `TweaksPanel` (in [tweaks-panel.jsx](../src/tweaks-panel.jsx))

### [docker/](../docker/)

Houses the nginx config used by the local Docker stack. nginx is a hard requirement when running through Docker because `flowable-rest` does not return CORS headers; nginx injects them. The Vite proxy plays the same role during `npm run dev`.

### [.claude/commands/](../.claude/commands/)

Custom slash commands for Claude Code: [flowable-status.md](../.claude/commands/flowable-status.md) and [deploy-process.md](../.claude/commands/deploy-process.md). Both shell out to `curl` against the Flowable engine.

## Notable file conventions

- **`.jsx` everywhere a JSX expression appears**, `.js` for pure JS modules (`api.js`, `data.js`). No TypeScript files (project convention; see [CLAUDE.md](../CLAUDE.md)).
- **No tests, no lint config, no formatter** in the tree. `npm run dev/build/preview` are the only scripts.
- **No `assets/` or `public/`** — bpmn-js and dmn-js CSS is imported directly from `node_modules` in [main.jsx](../src/main.jsx).

## Note on README.md

[README.md](../README.md) currently contains a generic "handoff bundle" notice from Claude Design that predates implementation. It references a non-existent `project/` folder and `chats/` transcripts. The repository's authoritative agent contract is [CLAUDE.md](../CLAUDE.md) — treat README.md as outdated until it is rewritten.
