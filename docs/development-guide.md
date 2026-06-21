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

## Tests, lint, and format

```bash
npm test              # Vitest unit tests (watch mode: npm run test:watch)
npm run test:browser  # Vitest browser-mode component tests
npm run e2e           # Playwright E2E tests (needs Docker Flowable running)
npm run check         # Biome lint + format check
npm run lint          # Biome lint only
npm run format        # Biome format (auto-fix)
npm run typecheck     # TypeScript type-check (no emit)
```

## Default connection

On first load the app reads its connection config from `localStorage` (key `flowatch.connection.v1`) or falls back to:

| Field      | Default                                          |
| ---------- | ------------------------------------------------ |
| `baseUrl`  | `http://localhost:8080/flowable-rest/service`    |
| `username` | `rest-admin`                                     |
| `password` | `test`                                           |
| `tenantId` | _(empty — "all tenants")_                        |

Override at runtime via the **gear icon** (top-right) → `SettingsModal`, or programmatically via `api.setConfig(...)` in [src/api.ts](../src/api.ts).

## Environment variables

**None.** There are no `.env*` files and no Vite `import.meta.env` usage in the source. All configuration is runtime via `localStorage`.

## Test approach

Three-level test pyramid:

1. **Unit / component tests** (Vitest) — `src/__tests__/`. Token-contract guard tests (Pattern P-008) assert WCAG contrast, empty-state registry completeness, `.sr-only` declarations, and keyboard shortcut invariants. API funnel tests are also here.
2. **E2E tests** (Playwright) — `e2e/`. Each spec runs against a live Docker Flowable engine. Golden-path coverage for every screen: deployments, instances, tasks, jobs, history, identity, modelers, and accessibility flows.
3. **Live smoke** — the in-app **API Inspector** (right-edge drawer) + `/flowable-status` slash command + manual screen exercise.

For component-level tests that use TanStack Router hooks, use the `renderWithRouter()` helper (see RC-10 in [runtime-caveats.md](./runtime-caveats.md)).

## Common development tasks

### Add a new screen

Create a route file under [src/routes/](../src/routes/) following the TanStack Router file-based convention. Use `createFileRoute` and a `loader` for initial data. Follow the four render-state contract: `pendingComponent` (loading) / `errorComponent` (error) / empty row (`No records.`) / data. No silent fallbacks.

The legacy `VIEW_TITLE` / `ENDPOINT_BY_VIEW` maps in [src/app.tsx](../src/app.tsx) do not need to be updated for new TanStack Router routes — those maps are only consulted by the legacy `switch`-based screens still in [src/screens.tsx](../src/screens.tsx).

### Add a new Flowable endpoint

Add a wrapper in [src/api.ts](../src/api.ts) (or the appropriate split file: `api-app.ts`, `api-history.ts`, `api-identity.ts`) that goes through the central `request(method, path, opts)` helper (so it logs to `API_LOG` and fires the `api:log` event). Export it from the `api` object at the bottom of `api.ts`.

For sub-app endpoints, pass `{ base: dmnBase() }` / `{ base: appBase() }` / `{ base: cmmnBase() }` — each helper derives the root from the configured `baseUrl` via `connectionRoot()`. See [src/api.ts](../src/api.ts) and [api-contracts.md](./api-contracts.md).

### Tweak the design system

[src/styles/tokens.css](../src/styles/tokens.css) defines three "looks" × two themes × three densities via `:root[data-look][data-theme][data-density]` selectors. [src/styles/components.css](../src/styles/components.css) holds all class hooks. Use the existing CSS variables (`--bg`, `--fg`, `--accent`, etc.) — **don't hard-code colors**.

The floating [TweaksPanel](../src/tweaks-panel.tsx) (`Ctrl+Shift+T` or the palette icon in the top bar) toggles these `data-*` attributes on `<html>` at runtime. Accent colors are OKLCH and can be overridden inline via `ACCENT_PALETTES` in [src/app.tsx](../src/app.tsx).

## Conventions (must read)

The repo's full agent contract is in [CLAUDE.md](../CLAUDE.md). Highlights:

- **TypeScript** — all source files under `src/` are `.ts` / `.tsx`. New files must be typed; avoid `any` except in documented shim zones (e.g. `bpmn-moddle.d.ts`).
- **No state library** — plain `useState` / `useEffect`. Cross-component state is either prop-drilled from `App` or signalled via `window` events.
- **No CSS-in-JS** — extend [src/styles/components.css](../src/styles/components.css) and [src/styles/tokens.css](../src/styles/tokens.css) using existing CSS variables.
- **Live API only** — never reintroduce mock fixtures into screens; render real error states instead.

## Hot-reload caveats

Vite HMR works for components and styles. The bpmn-js / dmn-js instances in [src/modeler/BpmnModeler.tsx](../src/modeler/BpmnModeler.tsx) and [src/modeler/DmnModeler.tsx](../src/modeler/DmnModeler.tsx) are constructed inside `useEffect` and **destroyed/recreated** on unmount, so HMR can occasionally leave a stale modeler in the DOM — a full reload (`Cmd/Ctrl+R`) fixes it.
