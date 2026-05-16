# Component Inventory

All React components in Flowatch, grouped by responsibility. Every component is a function component using hooks; there are no class components.

## App shell & chrome — [src/components.jsx](../src/components.jsx)

| Component         | Purpose                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `Sidebar`         | Left nav. Renders the `NAV` list (Dashboard, BPMN, DMN, Deployments, Process definitions, Process instances, Tasks, Jobs, History, Identity, Tenants), badge counts from `App`, and the connection status row. |
| `Topbar`          | Top header. Holds tenant cycle button, theme toggle, Inspector toggle, gear/settings button, palette/tweaks button. |
| `PageHead`        | Per-screen header. Shows title/subtitle + `EndpointChip`s + actions slot. Most screens use this. |
| `SettingsModal`   | Modal form to edit `baseUrl` / `username` / `password` / `tenantId` and save via `api.setConfig`. |
| `ApiInspector`    | Right-edge drawer listing real-time API calls. Subscribes to `window.addEventListener("api:log", ...)`. Filterable by method/status. |
| `Toaster`         | Single global toast surface. Listens for a custom event from `toast()`.                            |
| `toast(detail)`   | Imperative helper — dispatches the event the `Toaster` listens for.                                |
| `Icon`            | SVG sprite resolver (`name`, `size`).                                                              |
| `Logo`, `Mark`    | Flowatch brand marks.                                                                               |
| `EndpointChip`    | Method-coloured pill rendering `METHOD path`. Clicking opens the Inspector.                        |
| `EndpointRow`     | Container for a row of `EndpointChip`s (used by `PageHead`).                                       |
| `fmtTime(iso)`    | Helper — relative/short human time.                                                                |
| `fmtDue(iso)`     | Helper — due-date formatter for tasks.                                                             |

## Routed screens — [src/screens.jsx](../src/screens.jsx)

Every screen uses the `useApi(fn, deps)` hook (defined at the top of the file) and renders four states explicitly: loading, error (with the actual error message), empty (`No records.`), and data.

| Screen               | Calls (via `api.*`)                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `Dashboard`          | `listProcessInstances`, `listTasks`, `listJobs` (counts + recent activity tiles)           |
| `Deployments`        | `listDeployments`, `deleteDeployment`, `createDeployment` (upload .bpmn/.dmn/.bar)         |
| `ProcessDefinitions` | `listProcessDefinitions`, `suspendProcessDefinition`, `getProcessDefinitionResource`       |
| `ProcessInstances`   | `listProcessInstances`, `startProcessInstance`, `deleteProcessInstance`, `getProcessInstanceVariables` |
| `Jobs`               | `listJobs`, `listTimerJobs`, `listDeadLetterJobs`, `executeJob`, `moveDeadLetterJob`, `jobStacktrace` |
| `Tasks`              | `listTasks`, `taskAction` (claim/complete/delegate), `getTaskForm`, `submitTaskForm`, `getTaskVariables` |
| `History`            | `listHistoricInstances`, `listHistoricActivities`, `listHistoricVariables`, `listHistoricTasks` |
| `Identity`           | `listUsers`, `listGroups`, `getUserGroups`, `addUserToGroup`                               |
| `Tenants`            | Operates on the tenants list resolved at app startup via `api.listTenants()`               |

Internal helpers in the same file:

- `useApi(fn, deps)` — generic data hook, returns `{ loading, data, error, reload }`.
- `ErrorBox` — error pane with retry button.
- `EmptyRow` — table-row placeholder for empty tables.
- `Info` — small `<label>: <value>` line used in instance/job detail panels.
- `fmtMs`, `stateOf` — small formatting helpers.

## Modeler components — [src/modeler.jsx](../src/modeler.jsx)

| Component     | Purpose                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `BpmnModeler` | Embeds a vanilla `bpmn-js/lib/Modeler`. Lists deployed definitions via `api.listProcessDefinitions`, loads XML via `api.getProcessDefinitionResource`, deploys via `api.deployBpmn`. Tracks dirty state and selection via `eventBus`. Defaults to `LOAN_BPMN_XML` starter. |
| `DmnModeler`  | Same shape but for `dmn-js`. Uses `api.listDecisions`, `api.getDmnResource`, `api.deployDmn`, all against the `dmn-api` sub-app prefix. |

Local constants:

- `BLANK_BPMN_XML` — empty starter loaded when the user picks "new from scratch".
- `LOAN_BPMN_XML` — the demo Loan Approval BPMN that ships embedded.
- `LOAN_DMN_XML` — the matching DMN decision table.
- `iconFor(type)` — maps element type to BPMN icon class (e.g. `bpmn-icon-task`, `bpmn-icon-gateway-parallel`).
- `download(name, content, type)` — generic browser save-as helper for "Download XML" buttons.

## Tweaks panel — [src/tweaks-panel.jsx](../src/tweaks-panel.jsx)

The tweaks panel is a floating, dev-time design control surface. It is **always mounted** but only visible after `window.postMessage({ type: "__activate_edit_mode" })` (sent by Ctrl+Shift+T or the palette icon in `Topbar`).

| Export             | Purpose                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `useTweaks(defaults)` | Hook that persists `{ look, theme, density, accent }` to `localStorage` and returns `[state, setOne]`. |
| `TweaksPanel`      | The floating container, renders children inside a styled draggable panel.                  |
| `TweakSection`     | Section header + grouped rows.                                                             |
| `TweakRow`         | Single labeled row, inline or stacked.                                                     |
| `TweakRadio`       | Radio-segmented control (used for Look / Theme / Density).                                 |
| `TweakSelect`      | Dropdown (used for Accent palette).                                                        |
| `TweakSlider`      | Range slider with units (not currently wired in `App`).                                    |
| `TweakToggle`      | Boolean toggle (not currently wired in `App`).                                             |
| `TweakText`        | Text input.                                                                                |
| `TweakNumber`      | Number input with optional min/max/step/unit.                                              |
| `TweakColor`       | Swatch picker (not currently wired in `App`).                                              |
| `TweakButton`      | Primary or secondary button.                                                               |
| `__twkIsLight(hex)` | Internal contrast helper for `TweakColor`.                                                |

## Root entry — [src/main.jsx](../src/main.jsx)

Mounts `<App/>` and imports the bpmn-js / dmn-js CSS. **This is the only file where those CSS imports live**; do not duplicate them elsewhere.

## Top-level orchestrator — [src/app.jsx](../src/app.jsx)

Single component `App()` that owns:

- The `view` state and its `switch`-based screen renderer.
- The `tenants` list, active `tenant`, and tenant cycle behaviour.
- The `inspectorOpen` / `settingsOpen` modal flags.
- The `conn` engine-connection probe (`api.ping()` on mount).
- The `navCounts` polled for tasks and jobs.
- Connection of `useTweaks` state to `<html>` `data-*` attributes and the accent CSS variable.

Two important constant maps that must be updated when adding a screen:

- `VIEW_TITLE` — sidebar/header label for every `view` value.
- `ENDPOINT_BY_VIEW` — endpoint hints shown by `PageHead` chips and the Inspector chip rail.

## Design system primitives

Not React components, but worth knowing about:

- All visual primitives (`.btn`, `.tag`, `.panel`, `.table`, `.empty`, `.mono`, `.seg-btn`, etc.) are defined as plain CSS classes in [src/styles.css](../src/styles.css).
- All theming is driven by **CSS variables** (`--bg`, `--fg`, `--accent`, `--mono`, `--font-display`, …) set by `:root[data-look][data-theme][data-density]` selectors. Components reference variables; they never hard-code colors.

## What does NOT exist

To make absence explicit (and prevent agents from "finding" things that aren't there):

- No Storybook / component playground.
- No design-token JSON; the tokens are the CSS variables themselves.
- No component tests, snapshot tests, or visual regression tests.
- No design-system docs other than this inventory and the `CLAUDE.md` "Design system" section.
- No higher-order components, render props, or context providers besides what React itself provides.
