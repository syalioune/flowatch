# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flowatch is a single-page React + Vite GUI for **Flowable 7 OSS** (BPMN/DMN process engine). It wraps the Flowable REST API and embeds the official `bpmn-js` / `dmn-js` modelers. **The app talks only to the live engine** — there is no mock fallback. If the engine is unreachable, screens show error states.

## Commands

The [Makefile](Makefile) is the canonical entry point — `make help` lists every target. The common ones, each shown with the underlying command it wraps:

| `make` target        | Underlying command                                                       |
| -------------------- | ------------------------------------------------------------------------ |
| `make install`       | `npm ci`                                                                 |
| `make stack`         | `bash scripts/dev/run-dev.sh`                                            |
| `make dev`           | `npm run dev`                                                            |
| `make build`         | `npm run build`                                                          |
| `make preview`       | `npm run preview`                                                        |
| `make engine-up`     | `docker compose up -d`                                                   |
| `make engine-down`   | `docker compose down`                                                    |
| `make engine-logs`   | `docker compose logs -f`                                                 |
| `make engine-health` | `curl -fsS -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine` |
| `make engine-psql`   | `docker compose exec postgres psql -U flowable -d flowable`              |

Either column works in isolation — pick whichever fits the context. The Makefile is a thin wrapper, not a lock-in.

There is **no test suite, linter, or formatter** configured yet — the npm package only ships `dev`, `build`, `preview`, and the `release:preview*` helpers.

Other Makefile namespaces (see `make help`): `bootstrap-*` (one-time GitHub repo setup), `stories-*` (user-stories ↔ issues sync), `bmad-*` (private companion repo helpers), `release-*` (semantic-release preview).

## Architecture

### Routing layer (no router library)

[src/app.jsx](src/app.jsx) holds a single `view` state string and renders one screen via a `switch` statement. There is no React Router — adding/renaming a screen means updating three places in [app.jsx](src/app.jsx): the `switch`, `VIEW_TITLE`, and `ENDPOINT_BY_VIEW` (the latter feeds the [ApiInspector](src/components.jsx) chips for that screen).

Empty-state copy for list screens lives in [src/lib/empty-states.tsx](src/lib/empty-states.tsx) — bootstrap-and-extend: every list-screen story (Deployments first, then Process Definitions, Instances, Tasks, Jobs, History, Identity) appends its own entry to the `emptyStates` record.

### API layer — single request() funnel

[src/api.js](src/api.js) is a thin wrapper around `fetch()`. Every endpoint method goes through a single `request(method, path, { params, body, base, raw, asResponse })` function that injects Basic auth, logs the call, and parses the response. Errors propagate to the caller — there is no offline fallback. `{ asResponse: true }` short-circuits the parse step and returns the raw `Response` so binary callers (e.g. `api.getDeploymentResource`) can pick `.blob()` / `.arrayBuffer()`; mutually exclusive with `raw`.

Two important details:

- **DMN lives at a different URL prefix.** Flowable's BPMN/runtime/identity endpoints are under `/flowable-rest/service`, but DMN sits at `/flowable-rest/dmn-api`. The `dmnBase()` helper rewrites the configured base URL by replacing `/service` with `/dmn-api`. Pass `{ base: dmnBase() }` for any DMN call.
- **`/identity/tenants` does not exist in flowable-rest 7.2.** `api.listTenants()` derives distinct tenant IDs from `/repository/deployments` instead.

When adding a new endpoint, just add a wrapper in [api.js](src/api.js) and export it from the `api` object at the bottom of the file.

### Event-driven API log (the Inspector drawer)

Every `request()` call pushes an entry into the in-memory `API_LOG` array (capped at 60) and dispatches a `window` `CustomEvent('api:log', { detail: entry })`. The [ApiInspector](src/components.tsx) component listens for this event to render real-time call history. Do **not** bypass `request()` for fetches — the Inspector will go blind.

The `ApiLogEntry` shape is `{ id, method, path, url, status, ms, at, headers?, body?, error? }`. Two NFR-8 guarantees about `headers`: the `Authorization` value is redacted **scheme-preservingly** — `Basic <base64>` becomes `Basic ***`, future `Bearer <jwt>` becomes `Bearer ***` (a value with no space falls through to `***` alone) — before the entry is pushed; the headers object handed to `fetch()` is **never** mutated (the redactor clones via spread). The optional `body` field carries the original JS value of `opts.body` for JSON requests — not the stringified form — so the drawer can pretty-print structured payloads. Response bodies are intentionally **not** captured (memory: 60 × 4 KB would balloon the buffer). Multipart `uploadDeployment()` calls log only the Authorization header, never the file contents or `FormData` parts.

**Body byte-budget in the API funnel (Story 10.2).** Request bodies passed to `request()` are funneled through `captureBody(body)` ([src/api.ts](src/api.ts)). Bodies whose stringified form is ≤ `BODY_BYTE_BUDGET` (16 KB) are captured by reference; larger bodies are captured as `{ __preview: <first 16 KB>, __truncated: <total bytes> }`. The ring buffer stays bounded regardless of payload size. Future bulk-input flows (variable edit, batch operations) inherit this without re-decision. `captureBody` also catches `JSON.stringify` throws (BigInt / circular refs / throwing `toJSON`, per RC-7) and falls through to the envelope shape rather than crashing the funnel.

`ErrorBox` is the canonical producer of the `app:open-inspector` event (Story 8.2): every rendered error box ships a `[data-testid="open-inspector"]` button that dispatches the event with `detail: { focusEntryId? }`, where the id is matched against `API_LOG[].error` to scroll the drawer to the offending call. The drawer's "Recent calls" tab filters by method + status bucket, expands rows on click to reveal full URL + redacted headers + request body, and applies a transient `[data-focused="1"]` highlight to the scroll target. "Copy as curl" puts real creds in the clipboard by design — NFR-8 only governs `API_LOG`; clipboard access is gated by explicit user intent (Story 8.3).

### Connection config

Persisted in `localStorage` under `flowatch.connection.v1` (`baseUrl`, `username`, `password`, `tenantId`). Defaults: `http://localhost:8080/flowable-rest/service`, `rest-admin`/`test`. Mutated via `api.setConfig(...)` or the `SettingsModal` (gear icon).

### Modelers

[src/modeler.jsx](src/modeler.jsx) wraps `bpmn-js/lib/Modeler` and `dmn-js/lib/Modeler` directly (not the React bindings). Each component instantiates the vanilla class in a `useEffect`, attaches it to a ref'd `<div>`, and bridges save actions to `api.deployBpmn` / `api.deployDmn`. CSS for the modelers is imported once in [src/main.jsx](src/main.jsx) — both `bpmn-js/dist/assets/*.css` and `dmn-js/dist/assets/*.css`.

The BPMN modeler:
- Lists deployed definitions in a dropdown and loads the raw XML via `GET /repository/process-definitions/{id}/resourcedata`.
- The embedded `LOAN_BPMN_XML` literal is the default starter when no real definition is selected; `BLANK_BPMN_XML` is loaded when the user picks "new from scratch".
- Deploys via `api.deployBpmn`, which performs a multipart `POST /repository/deployments` (Flowable rejects JSON-with-base64; the mock-mode shape from earlier no longer applies).

The DMN modeler is similar but its REST calls go to the `dmn-api` sub-app (see API layer note above).

The Upload modal at [src/lib/upload-deployment-modal.tsx](src/lib/upload-deployment-modal.tsx) (Story 9.2) is the GUI-driven counterpart to the modeler's Save-and-deploy — both routes ultimately call `api.deployBpmn(filename, xml)`.

### Modal conventions

**Modal focus-restore via `triggerRef` (Story 10.2).** Modals accept `triggerRef?: React.RefObject<HTMLElement | null>` and call `triggerRef.current?.focus()` on Esc / Cancel / successful submit. Callers pass `useRef` on the trigger button (the menuitem or the explicit Open button); a single `triggerRef` per surface is enough since only one modal can be open at a time. All current modals — [upload-deployment-modal.tsx](src/lib/upload-deployment-modal.tsx), [delete-deployment-modal.tsx](src/lib/delete-deployment-modal.tsx), [start-instance-modal.tsx](src/lib/start-instance-modal.tsx), [cancel-instance-modal.tsx](src/lib/cancel-instance-modal.tsx) — use this shape. New modals MUST as well.

**Navigate-on-both vs in-modal-ErrorBox decision (Stories 10.2 / 10.3).** Two failure-path shapes are codified for modal-driven actions:

- **One-shot destructive** (cancel, delete) — modal closes and a toast carries the outcome regardless of success or failure. The engine is the source of truth; the list view shows the current state of the world. See `CancelInstanceModal` (10.3) called from `/instances/$id` which navigates to `/instances` on both success and failure.
- **Retryable creation** (start, deploy) — failure renders an in-modal `ErrorBox` so the operator can fix-and-resubmit without re-typing. See `StartInstanceModal` (10.2) which preserves the operator's Variables JSON on engine error.

Apply by operator-intent: "stop this" vs "I'm building this". Future task / job stories will encounter this fork — match the recipe.

### Panel-as-sibling-component (Story 10.4)

Detail pages with multiple panels use sibling components rather than inline panel logic. Each panel owns its own `useApi`, its own four-state rendering, its own refresh affordance, and its own row-count badge. The parent component mounts the panel with a single stable identifier prop (e.g. `<InstanceVariablesPanel instanceId={id} />`) — no callbacks, no state-threading. See [src/components/InstanceVariablesPanel.tsx](src/components/InstanceVariablesPanel.tsx). Future multi-panel detail pages (Historic Activity Instances, task detail with form + variables + history) follow this shape.

### Cross-story sequencing conventions

**Placeholder-then-real (multi-epic pattern).** When a story references functionality that arrives in a later story, ship a `data-testid`-anchored placeholder in the earlier story (e.g. a toast that says "X arrives in Story Y.Z"). The `data-testid` is the swap point — the downstream dev replaces the handler without changing markup. Precedents: 9.1's `data-testid="upload-deployment"` (swapped by 9.2), 9.1's two-Delete-items (collapsed by 9.3), 9.4's `Start instance` toast (swapped by 10.2), 10.1's `Cancel` toast (swapped by 10.3). **The swap PR MUST also drop the placeholder-toast E2E assertion from the earlier story's spec file in the same PR** — otherwise the earlier story's E2E asserts a toast text that no longer fires and CI red-builds until the cleanup commit lands (Epic 10 retro §3.5).

**UX-polish cadence is opt-in by next story.** Canonical archetype stories ship working `window.confirm()` / native form elements / default styles. The polish story swaps to design-system equivalents. See 9.1 (`confirm()` for delete) → 9.3 (`DeleteDeploymentModal`); `prompt()` on instance detail → 10.3 (`CancelInstanceModal`). Don't preempt polish in the archetype; don't skip polish in the polish story.

### State / data fetching pattern

Screens use a small `useApi(fn, deps)` hook in [src/screens.jsx](src/screens.jsx) that returns `{ loading, data, error, reload }`. Every screen renders three states: loading, error (with the actual error message — no silent fallbacks), and empty (`No records.`). When you add a screen, follow this pattern rather than introducing a state library.

**v1 canonical for list screens (Story 9.1 onwards):** URL-identity list data uses TanStack Router's `loader` + `pendingComponent` + `errorComponent` slots (precedent: [src/routes/deployments/index.tsx](src/routes/deployments/index.tsx)). `useApi` remains the pattern for secondary fetches inside components. The migration of the other list screens (Process Definitions, Instances, Tasks, Jobs, History, Identity) lands in subsequent Epic 9-15 stories — until each one ships, those screens keep their `useApi` implementation.

### Vite → nginx → Flowable proxy chain

[vite.config.js](vite.config.js) proxies `/flowable-rest` → `http://localhost:8080`. The nginx container ([docker/nginx.conf.template](docker/nginx.conf.template)) listens on :8080 and forwards to the `flowable` container while injecting CORS headers. Without nginx in the middle, Flowable's REST app would reject browser requests. The Vite proxy avoids same-origin issues during dev. The allowed CORS origin is parameterized via the `ALLOWED_ORIGIN` env var (default `http://localhost:5173`); the official nginx image renders the template at container start (`/etc/nginx/templates/*.template` → `/etc/nginx/conf.d/*.conf`, envsubst scoped to `ALLOWED_ORIGIN` via `NGINX_ENVSUBST_FILTER`).

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
- **`landing/` is the project presentation page**, not part of the app. It's a hand-authored static HTML+CSS one-pager that deploys to GitHub Pages (PRD FR-F12 / FR-F13). Don't pull `src/`, `vite.config.js`, TanStack Router, or React into it. Don't add CDN references — NFR-9 is enforced by `make landing-check`. Visual tokens come from [src/styles.css](src/styles.css) editorial-light-regular — kept in sync by hand, not via build coupling. README.md is the source of truth for project facts; the landing page is a curated reflection. Preview locally with `make landing-preview`.
