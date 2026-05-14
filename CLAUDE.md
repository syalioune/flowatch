# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flowatch is a single-page React + Vite GUI for **Flowable 7 OSS** (BPMN/DMN process engine). It wraps the Flowable REST API and embeds the official `bpmn-js` / `dmn-js` modelers. **The app talks only to the live engine** — there is no mock fallback. If the engine is unreachable, screens show error states.

## Commands

```bash
npm install
npm run dev       # Vite dev server with HMR on http://localhost:5173
npm run build     # production bundle to dist/
npm run preview   # preview production build

docker compose up -d   # Postgres 16 + flowable-rest:7.2.0 + nginx (CORS proxy on :8080)
```

There is **no test suite, linter, or formatter** configured — `npm run dev/build/preview` are the only scripts.

Engine health check (when running with Docker):
```bash
curl -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine
```

## Architecture

### Routing layer (no router library)

[src/app.jsx](src/app.jsx) holds a single `view` state string and renders one screen via a `switch` statement. There is no React Router — adding/renaming a screen means updating three places in [app.jsx](src/app.jsx): the `switch`, `VIEW_TITLE`, and `ENDPOINT_BY_VIEW` (the latter feeds the [ApiInspector](src/components.jsx) chips for that screen).

### API layer — single request() funnel

[src/api.js](src/api.js) is a thin wrapper around `fetch()`. Every endpoint method goes through a single `request(method, path, { params, body, base, raw })` function that injects Basic auth, logs the call, and parses the response. Errors propagate to the caller — there is no offline fallback.

Two important details:

- **DMN lives at a different URL prefix.** Flowable's BPMN/runtime/identity endpoints are under `/flowable-rest/service`, but DMN sits at `/flowable-rest/dmn-api`. The `dmnBase()` helper rewrites the configured base URL by replacing `/service` with `/dmn-api`. Pass `{ base: dmnBase() }` for any DMN call.
- **`/identity/tenants` does not exist in flowable-rest 7.2.** `api.listTenants()` derives distinct tenant IDs from `/repository/deployments` instead.

When adding a new endpoint, just add a wrapper in [api.js](src/api.js) and export it from the `api` object at the bottom of the file.

### Event-driven API log (the Inspector drawer)

Every `request()` call pushes an entry into the in-memory `API_LOG` array (capped at 60) and dispatches a `window` `CustomEvent('api:log', { detail: entry })`. The [ApiInspector](src/components.jsx) component listens for this event to render real-time call history. Do **not** bypass `request()` for fetches — the Inspector will go blind.

### Connection config

Persisted in `localStorage` under `flowatch.connection.v1` (`baseUrl`, `username`, `password`, `tenantId`, `offlineFallback`). Defaults: `http://localhost:8080/flowable-rest/service`, `rest-admin`/`test`. Mutated via `api.setConfig(...)` or the `SettingsModal` (gear icon).

### Modelers

[src/modeler.jsx](src/modeler.jsx) wraps `bpmn-js/lib/Modeler` and `dmn-js/lib/Modeler` directly (not the React bindings). Each component instantiates the vanilla class in a `useEffect`, attaches it to a ref'd `<div>`, and bridges save actions to `api.deployBpmn` / `api.deployDmn`. CSS for the modelers is imported once in [src/main.jsx](src/main.jsx) — both `bpmn-js/dist/assets/*.css` and `dmn-js/dist/assets/*.css`.

The BPMN modeler:
- Lists deployed definitions in a dropdown and loads the raw XML via `GET /repository/process-definitions/{id}/resourcedata`.
- The embedded `LOAN_BPMN_XML` literal is the default starter when no real definition is selected; `BLANK_BPMN_XML` is loaded when the user picks "new from scratch".
- Deploys via `api.deployBpmn`, which performs a multipart `POST /repository/deployments` (Flowable rejects JSON-with-base64; the mock-mode shape from earlier no longer applies).

The DMN modeler is similar but its REST calls go to the `dmn-api` sub-app (see API layer note above).

### State / data fetching pattern

Screens use a small `useApi(fn, deps)` hook in [src/screens.jsx](src/screens.jsx) that returns `{ loading, data, error, reload }`. Every screen renders three states: loading, error (with the actual error message — no silent fallbacks), and empty (`No records.`). When you add a screen, follow this pattern rather than introducing a state library.

### Vite → nginx → Flowable proxy chain

[vite.config.js](vite.config.js) proxies `/flowable-rest` → `http://localhost:8080`. The nginx container ([docker/nginx.conf](docker/nginx.conf)) listens on :8080 and forwards to the `flowable` container while injecting CORS headers. Without nginx in the middle, Flowable's REST app would reject browser requests. The Vite proxy avoids same-origin issues during dev.

`bpmn-js` and `dmn-js` are pre-bundled via `optimizeDeps` and split into their own chunks (`bpmn`, `dmn`, `react`) by `manualChunks`.

### Design system (3 looks × 2 themes × 3 densities)

[src/styles.css](src/styles.css) is a single ~32KB stylesheet. There is no Tailwind, CSS Modules, or component library. All theming is driven by **data attributes on `<html>`**:

- `data-look="editorial|terminal|industrial"` — typography + accent character
- `data-theme="light|dark"` — background/foreground swap
- `data-density="compact|regular|comfy"` — row heights and paddings

Each combination defines its own `:root` block of CSS variables (`--bg`, `--fg`, `--accent`, `--font-display`, etc.). Components reference these vars exclusively — never hard-code colors.

The [TweaksPanel](src/tweaks-panel.jsx) (Ctrl+Shift+T or palette icon) is a floating dev-time control that mutates these data attributes. It communicates with [app.jsx](src/app.jsx) via `window.postMessage({ type: "__activate_edit_mode" })`.

Accent colors use OKLCH and can be overridden at runtime via the `ACCENT_PALETTES` map in [app.jsx](src/app.jsx), which sets `--accent` inline on `<html>`.

## BMAD planning artefacts live in a private companion repo

`_bmad/` and `_bmad-output/` at the repo root are **symlinks** into the private companion repo [syalioune/flowatch-bmad](https://github.com/syalioune/flowatch-bmad). The split keeps PRD / architecture / epics / story-specs / custom skill overrides off the public OSS surface while letting BMad skills resolve their planning context transparently.

- **Onboarding:** [scripts/setup-bmad.sh](scripts/setup-bmad.sh) (`-d <path>`, `-i` auto-install) clones the private repo and creates absolute symlinks. Re-run if the private checkout moves.
- **Commit sync:** [scripts/bmad-sync.sh](scripts/bmad-sync.sh) is the single chokepoint that commits + pushes the private repo. It **derives the private-repo path from the `_bmad` symlink at runtime — never hardcode `flowatch-bmad`** in any script or hook; resolve via `dirname $(realpath _bmad)` like `bmad-sync.sh` does.
- **`on_complete` directives:** every artefact-producing skill's `_bmad/custom/<skill>.toml` ends with an instruction to run `bash scripts/bmad-sync.sh -m "<conventional-commits message>"`. When writing new override files or extending existing ones, follow that pattern — the agent composes the message from the actual diff.
- **Stop hook:** `.claude/settings.json` runs `bash scripts/bmad-sync.sh --status-only` at end-of-turn. It prints a one-line reminder if the private repo is dirty; it **never** auto-commits. If the reminder fires and you can write a precise commit message from what just happened, propose calling `bmad-sync.sh -m "<message>"`; otherwise leave it for the maintainer.
- **Public vs private boundary:** the shard adapter writes user-story files into `docs/specifications/user-stories/` — that path is in the **public** repo and is committed manually by the maintainer alongside feature work. The sync script only touches the private repo.

When `_bmad/` is not a symlink (code-only contributors), the sync script silently no-ops. Don't fail end-to-end on its absence.

## Custom slash commands

- `/flowable-status` — check engine health, list active process counts ([.claude/commands/flowable-status.md](.claude/commands/flowable-status.md))
- `/deploy-process` — deploy a BPMN or DMN file to the running engine ([.claude/commands/deploy-process.md](.claude/commands/deploy-process.md))

## Conventions worth following

- **No TypeScript.** All source is `.jsx` / `.js`. Don't introduce `.ts(x)` files without explicit ask.
- **No state library.** `useState` / `useEffect` only. Cross-component coordination uses `window` events (see API log) or prop drilling from `App`.
- **No CSS-in-JS.** Add styles to [styles.css](src/styles.css) using the existing CSS-variable vocabulary.
- **Live API only.** Don't reintroduce mock fixtures into screens — show `{loading, error, empty}` states from the real `useApi` hook instead. [src/data.js](src/data.js) only holds REST endpoint metadata for the Inspector and PageHead chips.
