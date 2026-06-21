# Architecture — Flowatch

## Executive summary

Flowatch is a **client-only** React SPA. It owns no backend, no database, and no persistent server state. Its job is to wrap Flowable 7's REST API in a clean, multi-screen, themable GUI and embed the official bpmn-js / dmn-js modelers for in-browser editing of BPMN/DMN artifacts.

Three architectural choices shape the entire codebase:

1. **Single REST funnel.** Every Flowable call passes through `request()` in [src/api.ts](../src/api.ts). That funnel logs the call, fires a `window` event, and surfaces errors verbatim — there is no offline path. Bypassing it (`fetch()` directly) is forbidden because the API Inspector goes blind.
2. **TanStack Router + no state library.** Routes live under [src/routes/](../src/routes/) (file-based, auto-generated `routeTree.gen.ts`). Cross-component coordination uses either prop-drilling from `App` or `window` events / `window.postMessage`. The legacy `view` string + `switch` in [src/app.tsx](../src/app.tsx) is retained for a handful of non-route panels.
3. **CSS-variable design system on `<html>` data attributes.** Three "looks" × two themes × three densities, with OKLCH accent palettes — all swap atomically by mutating `data-look`, `data-theme`, `data-density` on the `<html>` element.

## Architecture pattern

Layered SPA with a thin API client and event-driven UI feedback.

```
┌─────────────────────────────────────────────────────────────────────┐
│                              <App/>  (src/app.tsx)                  │
│  TanStack Router (RouterProvider) — routes in src/routes/**         │
│  + legacy view switch for non-routed panels (TweaksPanel, etc.)     │
└──────────────┬──────────────────────────────────────────────────────┘
               │ route loaders / useApi(fn, deps)
               ▼
   ┌───────────────────────────┐     ┌───────────────────────────────┐
   │ Routes (src/routes/**)    │     │ Modelers (src/modeler/)       │
   │ + screens.tsx (legacy)    │     │ BpmnModeler.tsx, DmnModeler.tsx│
   └────────────┬──────────────┘     └──────────────┬────────────────┘
                │ useApi / loader                    │ bpmn-js / dmn-js
                ▼                                    ▼   (vanilla class refs)
        ┌──────────────────────────────────────────────────┐
        │              api.ts — `request()`                │
        │  AuthStrategy (Basic/Bearer/OIDC), JSON or raw   │
        │  connectionRoot() / dmnBase() / appBase()        │
        │  ├─► API_LOG (60-entry ring buffer)              │
        │  └─► window.dispatchEvent("api:log", entry)      │
        └──────────────────────┬───────────────────────────┘
                               │ fetch()
                               ▼
              http://localhost:8080/flowable-rest/
                     (via Vite proxy in dev,
                      via native Flowable CORS in Docker)
                               │
                               ▼
                    ┌──────────────────┐
                    │  flowable-rest   │  ← embedded BPMN/DMN engine
                    │     7.2.0        │
                    └────────┬─────────┘
                             ▼
                       PostgreSQL 16

        ┌─────────────────────────────────────────────┐
        │ ApiInspector — listens for "api:log" events │
        │   shows real-time call history & errors     │
        └─────────────────────────────────────────────┘
```

## Source code organization

The source has grown from a flat-file layout into a multi-directory structure. The current structure is described in [CLAUDE.md](../CLAUDE.md). Key files and directories:

| Path                         | Responsibility                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `src/main.tsx`               | React root mount; one-time CSS imports (bpmn-js, dmn-js, form-js); OIDC provider load |
| `src/app.tsx`                | RouterProvider, connection bootstrap, tenants, global modals, tweaks             |
| `src/api.ts`                 | Core Flowable REST wrappers; `request()` funnel, `API_LOG`, `AuthStrategy` seam  |
| `src/api-app.ts`             | App sub-app wrappers (`deployBar`, `listAppDefinitions`, …)                      |
| `src/api-history.ts`         | History sub-app wrappers                                                         |
| `src/api-identity.ts`        | Identity sub-app wrappers                                                        |
| `src/api-types.ts`           | Shared Flowable DTO type definitions                                             |
| `src/screens.tsx`            | The `useApi` hook + legacy screens not yet migrated to routes                    |
| `src/components.tsx`         | Reusable UI shell (Sidebar, Topbar, ApiInspector, SettingsModal, …)              |
| `src/components/`            | Sibling-panel components (InstanceVariablesPanel, JobStacktracePanel, …)         |
| `src/routes/`                | TanStack Router file-based routes (deployments, instances, tasks, jobs, …)       |
| `src/modeler/`               | BpmnModeler.tsx, DmnModeler.tsx, starters.ts, flowable-moddle.json, …            |
| `src/lib/`                   | Modal components, auth strategy, OIDC provider, nav events, empty states, …     |
| `src/tweaks-panel.tsx`       | Dev-time design control surface; toggled via Ctrl+Shift+T                        |
| `src/styles/`                | Three-file CSS split: `tokens.css` (variables), `components.css` (class hooks), `index.css` (entry) |

## Data architecture

**Flowatch owns no data models.** All persistent state lives in the Flowable engine and its Postgres database. The frontend's only durable state is the connection config in `localStorage` (`flowatch.connection.v1`):

```ts
{
  baseUrl: string,      // e.g. "http://localhost:8080/flowable-rest/service"
  username: string,     // default "rest-admin"
  password: string,     // default "test"
  tenantId: string      // empty = "all tenants"
}
```

Read via `api.config()`, mutated via `api.setConfig({...})`. See [src/api.js:5-22](../src/api.js#L5-L22).

In-memory state worth knowing about:

- **`API_LOG`** ([src/api.ts](../src/api.ts)) — exported array, capped at 60 entries, newest first. Used by the Inspector. Cleared only when the page reloads.
- **Tweaks** ([src/tweaks-panel.tsx](../src/tweaks-panel.tsx) `useTweaks`) — UI look/theme/density/accent, persisted to `localStorage` separately by the tweaks panel.

## API design

The `api` object exported from [src/api.ts](../src/api.ts) is the single dependency every screen and modeler imports. It groups Flowable endpoints into bands:

| Band         | Examples                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Repository   | `listDeployments`, `createDeployment`, `deleteDeployment`, `listProcessDefinitions`, `getProcessDefinitionResource`, `suspendProcessDefinition` |
| Runtime      | `listProcessInstances`, `startProcessInstance`, `deleteProcessInstance`, `getProcessInstanceVariables`, `listTasks`, `taskAction`, `getTaskVariables` |
| Form         | `getTaskForm`, `submitTaskForm`                                                                              |
| Management   | `listJobs`, `listTimerJobs`, `listDeadLetterJobs`, `executeJob`, `executeTimerJob`, `rescheduleTimerJob`, `moveDeadLetterJob`, `jobStacktrace`, `timerJobStacktrace`, `deadLetterJobStacktrace`, `listBatches` |
| History      | `listHistoricInstances`, `listHistoricActivities`, `listHistoricVariables`, `listHistoricTasks`              |
| Identity     | `listUsers`, `listGroups`, `getUserGroups`, `addUserToGroup`, `listTenants` (synthesized — see below)        |
| DMN          | `listDecisions`, `listDmnDeployments`, `executeDecision`, `getDmnResource`, `deployDmn`, `listDmnHistoryExecutions` |
| App          | `listAppDefinitions`, `deployBar` (multipart; routes to `/app-api/app-repository/deployments`)               |
| BPMN deploy  | `deployBpmn` (multipart upload)                                                                              |
| Diagnostics  | `ping` (engine health), `config`, `setConfig`, `log`, `getAuthStrategy`, `setAuthStrategy`                  |

Full surface — request shapes, response shapes, special cases — is in [api-contracts.md](./api-contracts.md).

### Special cases

- **Sub-app prefixes.** Flowable mounts its sub-apps at separate URL roots. `connectionRoot()` strips the configured `servicePath` suffix (default `/service`) from `baseUrl` to recover the deployment root; each `*Base()` helper appends its configurable segment: `dmnBase()` → `/dmn-api`, `appBase()` → `/app-api`, `cmmnBase()` → `/cmmn-api` (forward-reserved). Every DMN wrapper passes `{ base: dmnBase() }`; App wrappers pass `{ base: appBase() }`. See [src/api.ts](../src/api.ts).
- **`listTenants` is synthesized.** flowable-rest 7.2 doesn't expose `/identity/tenants`. The wrapper calls `/repository/deployments?size=1000` and reduces distinct truthy `tenantId` values.
- **Multipart uploads** (`deployBpmn`, `deployDmn`, `deployBar`) bypass `request()` for the body but still log to `API_LOG` manually so the Inspector stays consistent.
- **`raw: true` / `asResponse: true` options** on `request()`: `raw:true` reads body as text (XML downloads, stacktraces); `asResponse:true` returns the raw `Response` object for binary callers (e.g. `getDeploymentResource` → `.blob()`).
- **AuthStrategy seam.** `request()` awaits `authStrategy.authorizationHeader()` — never hard-codes Basic. Concrete strategies: `BasicAuthStrategy`, `BearerAuthStrategy`, `OidcAuthStrategy`. Installed at module load by `installStrategyForActiveConnection()` in [src/lib/install-auth-strategy.ts](../src/lib/install-auth-strategy.ts).

### `useApi` pattern

[src/screens.tsx](../src/screens.tsx) defines:

```js
function useApi(fn, deps = []) {
  // returns { loading, data, error, reload }
}
```

Every screen renders three states explicitly: loading skeleton → error box (with the actual error message) → empty row (`No records.`) → data. No silent fallbacks. This is part of the project contract — see [CLAUDE.md](../CLAUDE.md).

## Component architecture

See [component-inventory.md](./component-inventory.md) for the original catalog. Three layers:

1. **App shell** — `Sidebar`, `Topbar`, `SettingsModal`, `Toaster` (all from [src/components.tsx](../src/components.tsx)).
2. **Routed screens** — TanStack Router routes in [src/routes/](../src/routes/) plus legacy screens in [src/screens.tsx](../src/screens.tsx); two modelers in [src/modeler/](../src/modeler/).
3. **Side panels** — `ApiInspector` (right-edge drawer, slides over content) and `TweaksPanel` (floating dev-time control, Ctrl+Shift+T).
4. **Sibling-panel components** — `InstanceVariablesPanel`, `JobStacktracePanel`, `InstanceHistoricPanel`, etc. in [src/components/](../src/components/) (Pattern: panel-as-sibling).

## State management

Plain React hooks, intentionally. Strategy by scope:

- **Component-local:** `useState`, `useEffect`, `useRef`. The dominant pattern.
- **Cross-screen (e.g. tenant, theme):** held in `<App/>` and prop-drilled.
- **Cross-cutting events (API log):** `window.dispatchEvent(new CustomEvent("api:log", { detail }))` and `window.addEventListener("api:log", ...)`. The Inspector subscribes; the rest of the app doesn't care.
- **Edit-mode toggling for TweaksPanel:** `window.postMessage({ type: "__activate_edit_mode" }, window.origin)`.
- **Keyboard shortcuts:** registered via `window.addEventListener("keydown", ...)` in `useEffect`; e.g. Ctrl+Shift+T in [app.jsx:105-114](../src/app.jsx#L105-L114).

The "no state library" rule is explicit project policy.

## Modeler integration

[src/modeler/BpmnModeler.tsx](../src/modeler/BpmnModeler.tsx) and [src/modeler/DmnModeler.tsx](../src/modeler/DmnModeler.tsx) wrap the **vanilla** `bpmn-js/lib/Modeler` and `dmn-js/lib/Modeler` classes — _not_ their React bindings (Pattern P-006). The pattern (shared by both):

1. `<div ref={containerRef}/>` — the mount point.
2. `useEffect` constructs `new BpmnModelerClass({ container, moddleExtensions: { flowable: flowableModdle } })` and stores it in `modelerRef`.
3. Subscribe to `eventBus.on("selection.changed", ...)` and `eventBus.on("commandStack.changed", ...)` to drive the properties panel and dirty state.
4. `importXML(...)` loads either a deployed definition's XML (via `api.getProcessDefinitionResource`) or one of the shared starter strings from [src/modeler/starters.ts](../src/modeler/starters.ts) (`LOAN_BPMN_XML`, `BLANK_BPMN_XML`, `LOAN_DMN_XML`).
5. Cleanup destroys the modeler instance (wrapped in try/catch — bpmn-js can throw on already-disposed modelers under React strict-mode double-mount).

The BPMN modeler includes a Flowable-extensions properties panel ([src/modeler/FlowablePropertiesPanel.tsx](../src/modeler/FlowablePropertiesPanel.tsx)) backed by [src/modeler/flowable-moddle.json](../src/modeler/flowable-moddle.json) — a registered moddle descriptor that enables lossless round-trip of `flowable:` attributes and extensionElements (ADR-006).

The required CSS for all modeler libraries is imported **once** in [src/main.tsx](../src/main.tsx). Don't import bpmn-js/dmn-js/form-js CSS in component files.

Deployment goes through `api.deployBpmn(name, xml)` / `api.deployDmn(name, xml)`, both of which use the multipart upload path described in the API section.

## Theming and design system

See [src/styles/](../src/styles/) and the **Design system** section of [CLAUDE.md](../CLAUDE.md). The stylesheet is split into three files: `tokens.css` (`:root` / `html[data-*]` variable blocks), `components.css` (class hooks + keyframes + scrollbar), `index.css` (entry `@import`). High-level:

- Variables: `--bg`, `--fg`, `--accent`, `--mono`, `--font-display`, etc. — set by `:root[data-look][data-theme][data-density]` selectors.
- Three looks: `editorial`, `terminal`, `industrial` (typography + accent character differ).
- Two themes: `light`, `dark`.
- Three densities: `compact`, `regular`, `comfy` (row heights / paddings).
- Accent palettes (OKLCH): `default`, `cobalt`, `emerald`, `amber`, `magenta`. Active palette sets `--accent` inline on `<html>` via `ACCENT_PALETTES` in [src/app.tsx](../src/app.tsx).

The TweaksPanel writes the three `data-*` attributes; `<App/>`'s effect block in [src/app.tsx](../src/app.tsx) propagates them and the accent.

## Integration with Flowable

External integrations: **only** Flowable's REST API.

| Aspect              | Implementation                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| Transport           | `fetch()` directly                                                                |
| Authentication      | Pluggable `AuthStrategy` (Basic / Bearer / OIDC PKCE) — `api.ts` awaits `authStrategy.authorizationHeader()` |
| Content negotiation | `Accept: application/json` (default) or `*/*` (when `raw: true`)                  |
| Multipart upload    | Used for deployments; `FormData` with the BPMN/DMN file plus optional `tenantId`  |
| CORS handling       | Native Flowable CORS (`flowable.rest.app.cors.*` env vars) in Docker; Vite proxy in dev — never reach Flowable directly from the browser |
| Error handling      | Thrown `Error` with `.status` (HTTP code) and `.message` (server body or `HTTP NNN`) |

## Build & dev pipeline

- **Dev:** `vite` serves `index.html` and HMRs source on `:5173`. The Vite proxy forwards `/flowable-rest/*` to `http://localhost:8080` ([vite.config.ts](../vite.config.ts)).
- **Build:** `vite build`. Vendor splitting via `manualChunks` produces four chunks beyond the main bundle: `bpmn`, `dmn`, `react`, `oidc`. bpmn-js and dmn-js are pre-bundled via `optimizeDeps`.
- **Lint / format:** Biome v2 (`npm run lint`, `npm run format`, `npm run check`). Pre-commit hook via Husky.
- **Unit tests:** Vitest (`npm test`). Browser-mode for component tests (`npm run test:browser`).
- **E2E tests:** Playwright (`npm run e2e`) — requires a live Docker Flowable engine.
- **CI:** GitHub Actions (`.github/workflows/`) — `check` (Biome) + `unit` (Vitest) + `e2e` (Playwright + Docker Compose) + `build` (artifact upload) + `release` (semantic-release).

## Testing strategy

Three levels:

1. **Unit / component tests** (Vitest) — `src/__tests__/` for token-contract guards (Pattern P-008: WCAG contrast, empty-states exhaustiveness, sr-only class, shortcuts registry) and API funnel logic.
2. **E2E tests** (Playwright) — `e2e/` directory, each spec against a live Docker Flowable engine. Cover golden paths for deployments, instances, tasks, jobs, history, identity, modelers, and accessibility flows.
3. **Live smoke** — the in-app API Inspector + `/flowable-status` slash command for manual health checks.

## Risks and follow-ups

- **Hard-coded creds** — `rest-admin` / `test` ship as defaults in [src/api.ts](../src/api.ts) and [docker-compose.yml](../docker-compose.yml). Any non-local deployment must rotate them.
- **No mock fallback** — all screens show real error states when the engine is unreachable. The mock path was removed intentionally; future agents must not reintroduce mocks.
- **OIDC engine-side gap** — Flowatch sends `Authorization: Bearer <jwt>` for OIDC connections, but the default `flowable-rest:7.2.0` image is Basic-only. OIDC calls against the default stack 401 by design. Operators must configure their own Spring Security JWT verifier on the Flowable side.
