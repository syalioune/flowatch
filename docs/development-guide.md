# Development Guide

## Prerequisites

- **Node.js** ≥ 18 (Vite 5 requirement). No `.nvmrc` or `engines` pin is set in [package.json](../package.json).
- **npm** (or any compatible package manager — only `package-lock.json` is committed, so npm is the path of least friction).
- **Docker + Docker Compose** to run the Flowable engine and PostgreSQL locally.

## First-time setup

```bash
git clone <repo-url> flowatch
cd flowatch
npm install
docker compose up -d   # postgres + flowable (native CORS on :8080)
```

Wait until Flowable is reachable — usually 20-30 seconds after `up`:

```bash
curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .
```

You should see `{ "name": "default", "version": "7.2.0", ... }`.

> Tip: the [/flowable-status](../.claude/commands/flowable-status.md) slash command runs this check plus a few others.

## Running the app

```bash
npm run dev       # Vite dev server with HMR on http://localhost:5173
npm run build     # production bundle to dist/
npm run preview   # serve the production bundle locally
```

These are the **only** npm scripts in [package.json](../package.json). There is no `test`, `lint`, or `format` script.

## Default connection

On first load the app reads its connection config from `localStorage` (key `flowatch.connection.v1`) or falls back to:

| Field      | Default                                          |
| ---------- | ------------------------------------------------ |
| `baseUrl`  | `http://localhost:8080/flowable-rest/service`    |
| `username` | `rest-admin`                                     |
| `password` | `test`                                           |
| `tenantId` | _(empty — "all tenants")_                        |

Override at runtime via the **gear icon** (top-right) → `SettingsModal`, or programmatically via `api.setConfig(...)` in [src/api.js](../src/api.js).

## Environment variables

**None.** There are no `.env*` files and no Vite `import.meta.env` usage in the source. All configuration is runtime via `localStorage`.

## Test approach

No test runner is configured. The project relies on:

- Live API smoke testing through the **API Inspector** (right-edge drawer or `Ctrl+Shift+T` Tweaks panel → "Open Inspector").
- The two Claude Code slash commands ([/flowable-status](../.claude/commands/flowable-status.md), [/deploy-process](../.claude/commands/deploy-process.md)) for engine health and deployment smoke tests.
- Manual exercise of each screen — every screen renders explicit `{loading, error, empty}` states, so regressions surface quickly.

## Common development tasks

### Add a new screen

Three places in [src/app.jsx](../src/app.jsx) must be updated together:

1. The `switch` in `App()` — case for the new view that renders the component.
2. The `VIEW_TITLE` map — display label for sidebar/title bar.
3. The `ENDPOINT_BY_VIEW` map — REST endpoint hints for the Inspector chips.

The screen component itself goes in [src/screens.jsx](../src/screens.jsx) (or a new file if it's substantial). Follow the `useApi(fn, deps)` pattern — three render states (loading / error / empty / data) and no silent fallbacks.

### Add a new Flowable endpoint

Add a wrapper in [src/api.js](../src/api.js) that goes through the central `request(method, path, opts)` helper (so it logs to `API_LOG` and fires the `api:log` event). Export it from the `api` object at the bottom of the file.

For DMN endpoints, pass `{ base: dmnBase() }` because DMN lives under `/flowable-rest/dmn-api` instead of `/flowable-rest/service`.

### Tweak the design system

[src/styles.css](../src/styles.css) defines three "looks" × two themes × three densities via `:root[data-look][data-theme][data-density]` selectors. Use the existing CSS variables (`--bg`, `--fg`, `--accent`, etc.) — **don't hard-code colors**.

The floating [TweaksPanel](../src/tweaks-panel.jsx) (`Ctrl+Shift+T` or the palette icon in the top bar) toggles these `data-*` attributes on `<html>` at runtime. Accent colors are OKLCH and can be overridden inline via `ACCENT_PALETTES` in [app.jsx](../src/app.jsx).

## Conventions (must read)

The repo's full agent contract is in [CLAUDE.md](../CLAUDE.md). Highlights:

- **No TypeScript** — `.jsx` / `.js` only.
- **No state library** — plain `useState` / `useEffect`. Cross-component state is either prop-drilled from `App` or signalled via `window` events.
- **No CSS-in-JS** — extend [styles.css](../src/styles.css) using existing CSS variables.
- **Live API only** — never reintroduce mock fixtures into screens; render real error states instead.

## Hot-reload caveats

Vite HMR works for components and styles. The bpmn-js / dmn-js instances in [modeler.jsx](../src/modeler.jsx) are constructed inside `useEffect` and **destroyed/recreated** on unmount, so HMR can occasionally leave a stale modeler in the DOM — a full reload (`Cmd/Ctrl+R`) fixes it.
