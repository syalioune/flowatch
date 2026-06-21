# Component Inventory

> **Snapshot date: 2026-05-11.** The codebase has grown significantly since then — TypeScript migration, TanStack Router, many new route files and sibling-panel components. This document reflects the original baseline; see [CLAUDE.md](../CLAUDE.md) and the actual [src/](../src/) tree for the current state.

All React components in Flowatch, grouped by responsibility. Every component is a function component using hooks; there are no class components.

## App shell & chrome — [src/components.tsx](../src/components.tsx)

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

## Routed screens — [src/routes/](../src/routes/) + [src/screens.tsx](../src/screens.tsx)

Screens have been progressively migrated to TanStack Router file-based routes under `src/routes/`. Each route uses `createFileRoute`, a `loader` for initial data, and `pendingComponent` / `errorComponent` slots for the four render states. Legacy screens not yet migrated remain in `src/screens.tsx`.

The `useApi(fn, deps)` hook (defined in `src/screens.tsx`) is still used for secondary fetches inside components and panels.

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

## Modeler components — [src/modeler/](../src/modeler/)

| File / Component            | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `BpmnModeler.tsx`           | Embeds a vanilla `bpmn-js/lib/Modeler` with `moddleExtensions: { flowable: flowableModdle }`. Lists deployed definitions, loads XML, deploys via `api.deployBpmn`. Includes `<FlowablePropertiesPanel>` for Flowable-extension editing. |
| `DmnModeler.tsx`            | Same shape but for `dmn-js`. Uses `api.listDecisions`, `api.getDmnResource`, `api.deployDmn`. Includes `definitionPropertiesView` for standard OMG DMN metadata. |
| `FlowablePropertiesPanel.tsx` | BPMN properties panel: element-type field dispatch (UserTask, ServiceTask, …) backed by the moddle descriptor. |
| `ExtensionEditors.tsx`      | Reusable sub-components for listener / field-injection / in-out editors (used by FlowablePropertiesPanel). |
| `flowable-moddle.json`      | Moddle descriptor: name `Flowable`, prefix `flowable`, uri `http://flowable.org/bpmn`. Enables lossless round-trip of `flowable:` attributes (ADR-006). |
| `starters.ts`               | Shared starter XMLs exported as named constants: `BLANK_BPMN_XML`, `LOAN_BPMN_XML`, `LOAN_DMN_XML`. |
| `bpmn-moddle.d.ts`          | Minimal ambient shim for `bpmn-moddle` (no published types — ADR-001 `any` zone). |
| `dmn-moddle.d.ts`           | Minimal ambient shim for `dmn-moddle`. |

## Sibling-panel components — [src/components/](../src/components/)

These components each own their own `useApi`, four-state rendering, refresh affordance, and row-count badge. They accept a single stable identifier prop (Pattern: panel-as-sibling). See CLAUDE.md "Panel-as-sibling-component".

Selected panels (not exhaustive):

| Component                          | Purpose                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `InstanceVariablesPanel`           | Runtime variables for a process instance                        |
| `InstanceHistoricPanel`            | Historic record for an instance (endTime, duration, …)          |
| `InstanceHistoricActivitiesPanel`  | Historic activity log for an instance                           |
| `InstanceActiveActivitiesPanel`    | Active activities via `finished=false` filter (RC-14)           |
| `InstanceRuntimePanel`             | Runtime status panel                                            |
| `InstanceHistoricVariablesPanel`   | Historic variables (RC-12: nested `entry.variable.*` shape)     |
| `InstanceDiagramPanel`             | Embedded bpmn-js viewer with activity highlighting (Epic 26)    |
| `InstanceEventSubscriptionsPanel`  | Event subscriptions on a running instance (FR-54)               |
| `JobStacktracePanel`               | Job exception stacktrace (uses namespace-aware wrapper RC-11)   |
| `BatchPartsPanel`                  | Batch-parts row-expand for the Batches screen (FR-53)           |
| `DeploymentAppDefinitionsPanel`    | App definitions linked to a deployment (FR-55)                  |
| `DeploymentBundledProcessesPanel`  | BPMN processes bundled in a `.bar` deployment                   |
| `ProcessDefinitionDetail`          | Definition metadata panel                                       |
| `GroupMembersPanel`                | Group membership list (identity)                                |
| `ManageConnectionsPanel`           | Saved-connections list (Auth Story 23.1)                        |
| `AuthStrategyFields`               | Controlled segmented-control for Basic/Bearer/OIDC auth config  |
| `ConnectionSwitch`                 | Per-connection switcher in the Topbar                           |

## Tweaks panel — [src/tweaks-panel.tsx](../src/tweaks-panel.tsx)

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

## Root entry — [src/main.tsx](../src/main.tsx)

Mounts `<App/>`, imports bpmn-js / dmn-js / form-js CSS, calls `installStrategyForActiveConnection()` before render, and conditionally dynamically imports the OIDC `<AuthProvider>` if the active connection is OIDC. **This is the only file where those CSS imports live**; do not duplicate them elsewhere.

## Top-level orchestrator — [src/app.tsx](../src/app.tsx)

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

- All visual primitives (`.btn`, `.tag`, `.panel`, `.table`, `.empty`, `.mono`, `.seg-btn`, etc.) are defined as plain CSS classes in [src/styles/components.css](../src/styles/components.css).
- All theming is driven by **CSS variables** (`--bg`, `--fg`, `--accent`, `--mono`, `--font-display`, …) set by `:root[data-look][data-theme][data-density]` selectors in [src/styles/tokens.css](../src/styles/tokens.css). Components reference variables; they never hard-code colors.

## What does NOT exist

To make absence explicit (and prevent agents from "finding" things that aren't there):

- No Storybook / component playground.
- No design-token JSON; the tokens are the CSS variables themselves.
- No higher-order components, render props, or Context providers beyond what React itself provides and the OIDC `<AuthProvider>` (loaded dynamically, OIDC connections only).

> Component tests DO exist: Vitest unit tests (`src/__tests__/`) for token-contract guards (Pattern P-008) and Playwright E2E specs (`e2e/`) for golden-path coverage.
