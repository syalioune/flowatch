# Architecture — Flowatch

## Executive summary

Flowatch is a **client-only** React SPA. It owns no backend, no database, and no persistent server state. Its job is to wrap Flowable 7's REST API in a clean, multi-screen, themable GUI and embed the official bpmn-js / dmn-js modelers for in-browser editing of BPMN/DMN artifacts.

Three architectural choices shape the entire codebase:

1. **Single REST funnel.** Every Flowable call passes through `request()` in [src/api.js](../src/api.js#L50). That funnel logs the call, fires a `window` event, and surfaces errors verbatim — there is no offline path. Bypassing it (`fetch()` directly) is forbidden because the API Inspector goes blind.
2. **No router, no state library.** The active screen is a `view` string in [src/app.jsx](../src/app.jsx#L49). Cross-component coordination uses either prop-drilling from `App` or `window` events / `window.postMessage`.
3. **CSS-variable design system on `<html>` data attributes.** Three "looks" × two themes × three densities, with OKLCH accent palettes — all swap atomically by mutating `data-look`, `data-theme`, `data-density` on the `<html>` element.

## Architecture pattern

Layered SPA with a thin API client and event-driven UI feedback.

```
┌────────────────────────────────────────────────────────────────────┐
│                              <App/>                                │
│  view: state ◄──── ENDPOINT_BY_VIEW, VIEW_TITLE  (app.jsx)         │
│  └─► switch renders one Screen                                     │
└──────────────┬─────────────────────────────────────────────────────┘
               │ props
               ▼
   ┌─────────────────────────┐     ┌────────────────────────┐
   │  Screens (screens.jsx)  │     │  Modelers (modeler.jsx)│
   │  Dashboard, Tasks, ...  │     │  BpmnModeler, DmnModeler│
   └────────────┬────────────┘     └────────────┬───────────┘
                │ useApi(fn, deps)               │ bpmn-js / dmn-js
                ▼                                ▼   (vanilla class refs)
        ┌─────────────────────────────────────────────┐
        │             api.js — `request()`            │
        │  Basic-auth, JSON or raw, dmnBase() switch  │
        │  ├─► API_LOG (60-entry ring buffer)         │
        │  └─► window.dispatchEvent("api:log", entry) │
        └────────────────────┬────────────────────────┘
                             │ fetch()
                             ▼
              http://localhost:8080/flowable-rest/
                     (via Vite proxy in dev,
                      via nginx CORS proxy in Docker)
                             │
                             ▼
                    ┌────────────────┐
                    │ flowable-rest  │  ← embedded BPMN/DMN engine
                    │     7.2.0      │
                    └────────┬───────┘
                             ▼
                       PostgreSQL 16

        ┌─────────────────────────────────────────────┐
        │ ApiInspector — listens for "api:log" events │
        │   shows real-time call history & errors     │
        └─────────────────────────────────────────────┘
```

## Source code organization

Flat layout under [src/](../src/); see [source-tree-analysis.md](./source-tree-analysis.md) for the annotated tree. Every concern lives in exactly one file:

| File              | Responsibility                                                                   |
| ----------------- | -------------------------------------------------------------------------------- |
| `main.jsx`        | React root mount; one-time import of bpmn-js + dmn-js CSS                        |
| `app.jsx`         | Routing (view switch), connection bootstrap, tenants, global modals, tweaks      |
| `api.js`          | All Flowable REST wrappers; the `request()` funnel and `API_LOG` ring buffer     |
| `data.js`         | Per-screen endpoint metadata for Inspector chips and `PageHead`                  |
| `screens.jsx`     | The `useApi` hook + every data screen                                            |
| `components.jsx`  | Reusable UI shell + helpers (Sidebar, Topbar, ApiInspector, SettingsModal, ...)  |
| `modeler.jsx`     | bpmn-js and dmn-js wrappers, plus embedded starter XML (`LOAN_BPMN_XML`, etc.)   |
| `tweaks-panel.jsx`| Dev-time design control surface; toggled via Ctrl+Shift+T                        |
| `styles.css`      | Entire design system (CSS variables × `data-look/theme/density`)                 |

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

- **`API_LOG`** ([api.js:29-35](../src/api.js#L29-L35)) — exported array, capped at 60 entries, newest first. Used by the Inspector. Cleared only when the page reloads.
- **Tweaks** ([tweaks-panel.jsx](../src/tweaks-panel.jsx) `useTweaks`) — UI look/theme/density/accent, persisted to `localStorage` separately by the tweaks panel.

## API design

The `api` object exported from [src/api.js](../src/api.js#L238-L262) is the single dependency every screen and modeler imports. It groups Flowable endpoints into bands:

| Band         | Examples                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Repository   | `listDeployments`, `createDeployment`, `deleteDeployment`, `listProcessDefinitions`, `getProcessDefinitionResource`, `suspendProcessDefinition` |
| Runtime      | `listProcessInstances`, `startProcessInstance`, `deleteProcessInstance`, `getProcessInstanceVariables`, `listTasks`, `taskAction`, `getTaskVariables` |
| Form         | `getTaskForm`, `submitTaskForm`                                                                              |
| Management   | `listJobs`, `listTimerJobs`, `listDeadLetterJobs`, `executeJob`, `moveDeadLetterJob`, `jobStacktrace`        |
| History      | `listHistoricInstances`, `listHistoricActivities`, `listHistoricVariables`, `listHistoricTasks`              |
| Identity     | `listUsers`, `listGroups`, `getUserGroups`, `addUserToGroup`, `listTenants` (synthesized — see below)        |
| DMN          | `listDecisions`, `listDmnDeployments`, `executeDecision`, `getDmnResource`, `deployDmn`                      |
| BPMN deploy  | `deployBpmn` (multipart upload)                                                                              |
| Diagnostics  | `ping` (engine health), `config`, `setConfig`, `log`                                                         |

Full surface — request shapes, response shapes, special cases — is in [api-contracts.md](./api-contracts.md).

### Special cases

- **DMN sub-app prefix.** Flowable mounts DMN at `/flowable-rest/dmn-api`, not `/flowable-rest/service`. The `dmnBase()` helper rewrites the configured base URL by replacing `/service` with `/dmn-api`. Every DMN wrapper passes `{ base: dmnBase() }`. See [api.js:27](../src/api.js#L27).
- **`listTenants` is synthesized.** flowable-rest 7.2 doesn't expose `/identity/tenants`. The wrapper calls `/repository/deployments?size=1000` and reduces distinct truthy `tenantId` values. See [api.js:167-172](../src/api.js#L167-L172).
- **`deployBpmn` / `deployDmn` use multipart, not JSON.** They bypass `request()` for the body but still log to `API_LOG` manually so the Inspector stays consistent. See [api.js:190-228](../src/api.js#L190-L228).
- **`raw: true` option** on `request()` reads the body as text (used for BPMN XML download from `/resourcedata` and DMN equivalents, and for `jobStacktrace`).

### `useApi` pattern

[src/screens.jsx:9-23](../src/screens.jsx#L9-L23) defines:

```js
function useApi(fn, deps = []) {
  // returns { loading, data, error, reload }
}
```

Every screen renders three states explicitly: loading skeleton → error box (with the actual error message) → empty row (`No records.`) → data. No silent fallbacks. This is part of the project contract — see [CLAUDE.md](../CLAUDE.md).

## Component architecture

See [component-inventory.md](./component-inventory.md) for the complete catalog. Three layers:

1. **App shell** — `Sidebar`, `Topbar`, `SettingsModal`, `Toaster` (all from [components.jsx](../src/components.jsx)).
2. **Routed screens** — nine screens in [screens.jsx](../src/screens.jsx), two modelers in [modeler.jsx](../src/modeler.jsx).
3. **Side panels** — `ApiInspector` (right-edge drawer, slides over content) and `TweaksPanel` (floating dev-time control, Ctrl+Shift+T).

## State management

Plain React hooks, intentionally. Strategy by scope:

- **Component-local:** `useState`, `useEffect`, `useRef`. The dominant pattern.
- **Cross-screen (e.g. tenant, theme):** held in `<App/>` and prop-drilled.
- **Cross-cutting events (API log):** `window.dispatchEvent(new CustomEvent("api:log", { detail }))` and `window.addEventListener("api:log", ...)`. The Inspector subscribes; the rest of the app doesn't care.
- **Edit-mode toggling for TweaksPanel:** `window.postMessage({ type: "__activate_edit_mode" }, window.origin)`.
- **Keyboard shortcuts:** registered via `window.addEventListener("keydown", ...)` in `useEffect`; e.g. Ctrl+Shift+T in [app.jsx:105-114](../src/app.jsx#L105-L114).

The "no state library" rule is explicit project policy.

## Modeler integration

[src/modeler.jsx](../src/modeler.jsx) wraps the **vanilla** `bpmn-js/lib/Modeler` and `dmn-js/lib/Modeler` classes — _not_ their React bindings. The pattern (shared by both):

1. `<div ref={containerRef}/>` — the mount point.
2. `useEffect` constructs `new BpmnModelerClass({ container, keyboard: { bindTo: window } })` and stores it in `modelerRef`.
3. Subscribe to `eventBus.on("selection.changed", ...)` and `eventBus.on("commandStack.changed", ...)` to drive selected-element panels and dirty state.
4. `importXML(...)` loads either a deployed definition's XML (via `api.getProcessDefinitionResource`) or one of the embedded starter strings (`LOAN_BPMN_XML`, `BLANK_BPMN_XML`, `LOAN_DMN_XML`).
5. Cleanup destroys the modeler instance.

The required CSS for both libraries is imported **once** in [src/main.jsx](../src/main.jsx#L7-L17). Don't import bpmn-js/dmn-js CSS in component files.

Deployment goes through `api.deployBpmn(name, xml)` / `api.deployDmn(name, xml)`, both of which use the multipart upload path described in the API section.

## Theming and design system

See [src/styles.css](../src/styles.css) and the **Design system** section of [CLAUDE.md](../CLAUDE.md). High-level:

- Variables: `--bg`, `--fg`, `--accent`, `--mono`, `--font-display`, etc. — set by `:root[data-look][data-theme][data-density]` selectors.
- Three looks: `editorial`, `terminal`, `industrial` (typography + accent character differ).
- Two themes: `light`, `dark`.
- Three densities: `compact`, `regular`, `comfy` (row heights / paddings).
- Accent palettes (OKLCH): `default`, `cobalt`, `emerald`, `amber`, `magenta`. Active palette sets `--accent` inline on `<html>` ([app.jsx:57-68](../src/app.jsx#L57-L68)).

The TweaksPanel writes the three `data-*` attributes; `<App/>`'s effect block ([app.jsx:57-68](../src/app.jsx#L57-L68)) propagates them and the accent.

## Integration with Flowable

External integrations: **only** Flowable's REST API.

| Aspect              | Implementation                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| Transport           | `fetch()` directly                                                                |
| Authentication      | HTTP Basic via `Authorization: Basic <base64>` (`api.js:48`)                      |
| Content negotiation | `Accept: application/json` (default) or `*/*` (when `raw: true`)                  |
| Multipart upload    | Used for deployments; `FormData` with the BPMN/DMN file plus optional `tenantId`  |
| CORS handling       | nginx in Docker; Vite proxy in dev — never reach Flowable directly from the browser |
| Error handling      | Thrown `Error` with `.status` (HTTP code) and `.message` (server body or `HTTP NNN`) |

## Build & dev pipeline

- **Dev:** `vite` serves `index.html` and HMRs source on `:5173`. The Vite proxy forwards `/flowable-rest/*` to `http://localhost:8080` ([vite.config.js:22-29](../vite.config.js#L22-L29)).
- **Build:** `vite build`. Vendor splitting via `manualChunks` produces three chunks beyond the main bundle: `bpmn`, `dmn`, `react`. bpmn-js and dmn-js are pre-bundled via `optimizeDeps`.
- **No lint/format/test.** Project policy is intentional pragmatism — see [CLAUDE.md](../CLAUDE.md).

## Testing strategy

There is no automated test suite. Quality is enforced through:

- Live API smoke testing via the in-app **API Inspector**.
- The two project-scoped slash commands ([/flowable-status](../.claude/commands/flowable-status.md), [/deploy-process](../.claude/commands/deploy-process.md)).
- Manual exercise across the three "looks" × two themes × three densities to catch CSS regressions.

If adding tests is on the table, candidates include Playwright (UI smoke against a live engine) and Vitest for the `api.js` request logic — but neither dependency is currently installed.

## Risks and follow-ups

- **No tests / lint** — the only safety net is a developer running the dev server and clicking through screens.
- **Stale [README.md](../README.md)** — refers to a non-existent `project/` folder and `chats/` transcripts; the real contract is [CLAUDE.md](../CLAUDE.md).
- **Hard-coded creds** — `rest-admin` / `test` ship as defaults in [api.js](../src/api.js) and [docker-compose.yml](../docker-compose.yml). Any non-local deployment must rotate them.
- **Mock-mode legacy** — `api.js` includes a comment about "the mock-mode shape from earlier no longer applies" (multipart deployment block). The mock path is fully removed but the comments are the only signal; future agents should not reintroduce mocks.
- **No CI** — `npm run build` is the only "gate". Production deployments are manual.
