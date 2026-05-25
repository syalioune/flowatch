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
- **Flowable job IDs are scoped to per-type namespaces** (Story 12.2). Executable jobs, timer jobs, and dead-letter jobs live in three SEPARATE URL namespaces with different valid action verbs and different stacktrace endpoints. `POST /management/jobs/{timerId}` returns 404; the `/management/timer-jobs/{id}` endpoint accepts `{action: "move"}` (fire-now) and `{action: "reschedule", dueDate: <iso>}`; `/management/deadletter-jobs/{id}` accepts `{action: "move"}`. Use the namespace-specific wrappers in [src/api.ts](src/api.ts) (`executeJob` / `executeTimerJob` / `rescheduleTimerJob` / `moveDeadLetterJob` plus three stacktrace variants). Full quirk listed as RC-11 in [docs/runtime-caveats.md](docs/runtime-caveats.md). The handler-side pattern is **tab-aware action-verb dispatch** (see below).

When adding a new endpoint, just add a wrapper in [api.js](src/api.js) and export it from the `api` object at the bottom of the file.

**Operator-feel UI labels can diverge from wire-level action verbs (Story 12.2).** When the operator's mental model doesn't match the engine's storage model, surface the operator-feel name in the UI (handler label, button text) and the wire-level verb in the `src/api.ts` wrapper — with a docstring naming the gap. Example: "Execute now" on timer-job rows dispatches `{action: "move"}` to `/management/timer-jobs/{id}` — Flowable's terminology — because the engine "fires a timer" by moving it from the timer-jobs queue to the executable-jobs queue. Future label/verb divergences (Epic 21 task-properties, Epic 28 OIDC sign-in flows) follow the same shape: operator-feel label up top, wire-level verb in the wrapper, comment block naming the divergence. See [src/api.ts](src/api.ts) `executeTimerJob` and its preceding comment block.

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

**`<input type="datetime-local">` local→UTC ISO-8601 round-trip (Story 12.2).** The datetime-local input emits `YYYY-MM-DDTHH:MM` in the browser's **LOCAL** timezone. Wire-level Flowable timestamps are ISO-8601 UTC. The convention: hydrate the input via a `toLocalInputValue(iso)` helper that pads month/day/hour/minute as a 2-digit local-time string; on submit parse via `new Date(value)` (browser reinterprets as local) then `.toISOString()` for the wire. The operator's timezone is implicit; the engine receives UTC. Validate `parsed.getTime() > Date.now()` for "must be in the future" inputs. See [src/lib/reschedule-timer-modal.tsx](src/lib/reschedule-timer-modal.tsx). Future stories that edit timer `dueDate`, task due-date (Epic 21), or any ISO-time field should reuse this round-trip — don't reinvent the parsing.

### Panel-as-sibling-component (Story 10.4)

Detail pages with multiple panels use sibling components rather than inline panel logic. Each panel owns its own `useApi`, its own four-state rendering, its own refresh affordance, and its own row-count badge. The parent component mounts the panel with a single stable identifier prop (e.g. `<InstanceVariablesPanel instanceId={id} />`) — no callbacks, no state-threading. See [src/components/InstanceVariablesPanel.tsx](src/components/InstanceVariablesPanel.tsx) and [src/components/TaskFormPanel.tsx](src/components/TaskFormPanel.tsx). Future multi-panel detail pages (Historic Activity Instances, task detail with form + variables + history) follow this shape.

**Parent-level state-gating fetches are an acceptable duplication, not a refactor target (Story 11.3).** When the parent needs the panel's loaded state to gate its own UI — e.g. `<TaskDetail>` hides the legacy Complete button when a form is present (Story 11.3 AC-9) — the parent runs its OWN `useApi` against the same endpoint. Both calls go through the funnel; the Inspector shows two entries. Do NOT thread the panel's internal state up via a callback prop; that breaks the single-stable-identifier contract above and tightly couples parent UI to panel internals.

**Panel-as-sibling is never extracted into a shared abstraction (Epic 12 retro R-2 decision, 2026-05-25).** Four consumers (10.4 `InstanceVariablesPanel`, 11.3 `TaskFormPanel`, 12.4 `JobStacktracePanel`, 13.2 historic-activities panel) and counting; the three-consumer extraction trigger has been deliberately resisted at each evaluation point. The pattern's value IS the conformance: each panel owns its `useApi`, its four-state contract, its refresh affordance, its row-count badge. An extracted `<PanelAsSibling>` helper would either expose diverging render shapes through props (defeating the abstraction) or constrain future panels to a shape that's wrong for them. The cost of "duplication" here is ~30 LOC per panel of obvious, locally-readable code. Future N+1 / N+2 consumers DO NOT need to re-evaluate; this is project policy.

**Time-spanning detail pages use a single route + dual fetches, not split routes (Epic 12 retro R-1 decision, 2026-05-25).** When a detail page must show both runtime and historic state for the same entity (canonical example: `/instances/:id` showing runtime status when the instance is live AND historic record when it has ended), use ONE route with sibling panels — each panel runs its own `useApi`; the runtime panel renders an empty / "instance ended" state when the runtime fetch 404s; the historic panel renders an empty / "no historic record yet" state when the historic fetch 404s. Do NOT split into `/instances/:id` and `/history/instances/:id` — the operator's mental model is "this is the instance, here's everything I know about it." See Epic 13 Story 13.1 / 13.2 acceptance criteria. The pattern reuses the panel-as-sibling shape above; the parent route stays a thin shell.

### Cross-story sequencing conventions

**Placeholder-then-real (multi-epic pattern).** When a story references functionality that arrives in a later story, ship a `data-testid`-anchored placeholder in the earlier story (e.g. a toast that says "X arrives in Story Y.Z"). The `data-testid` is the swap point — the downstream dev replaces the handler without changing markup. Precedents: 9.1's `data-testid="upload-deployment"` (swapped by 9.2), 9.1's two-Delete-items (collapsed by 9.3), 9.4's `Start instance` toast (swapped by 10.2), 10.1's `Cancel` toast (swapped by 10.3). **The swap PR MUST also drop the placeholder-toast E2E assertion from the earlier story's spec file in the same PR** — otherwise the earlier story's E2E asserts a toast text that no longer fires and CI red-builds until the cleanup commit lands (Epic 10 retro §3.5).

**UX-polish cadence is opt-in by next story.** Canonical archetype stories ship working `window.confirm()` / native form elements / default styles. The polish story swaps to design-system equivalents. See 9.1 (`confirm()` for delete) → 9.3 (`DeleteDeploymentModal`); `prompt()` on instance detail → 10.3 (`CancelInstanceModal`). Don't preempt polish in the archetype; don't skip polish in the polish story.

**Review-patch-fold vs post-closure-fixup decision matrix (Epic 12 retro §4.3).** Two defensible shapes for live-engine discoveries that arrive mid-epic: **(a) post-closure fixup commits** — appropriate for *genuine surprises* (engine contract mismatch, missing endpoint, undocumented behaviour); produces bisectable "what was the gap between spec'd and shipped" history; Epic 11's three fixup commits (`89de10f` / `f60756f` / `8c8bd51`) are the precedent. **(b) review-patch fold into originating commit** — appropriate for *scope expansion within original story intent* (the engine exposes additional related actions that the story's intent reasonably covers); produces "story shipped with full real action surface" history; Epic 12's `213bef0` (timer-job namespace absorption) and `eb7e377` (`RescheduleTimerModal` source absorption) are the precedent. Pick deliberately. **Review-patches that ADD files must land all-or-nothing in one commit** — splitting test and source across two commits breaks `git bisect` because the test-only commit fails to compile (Epic 12 retro §3.3).

**Bundled refactor + feature avoidance for canonical-archetype migrations (Epic 12 retro §3.4).** When a canonical-archetype rewrite removes more than 50 LOC from [src/screens.tsx](src/screens.tsx) (or any other legacy file), **split the legacy-removal into its own `chore(refactor):` commit** before the feature commit. Story 12.1 bundled a 155-LOC `<JobsScreen>` deletion into the rewrite commit (`886c76e`); the cost was one less bisectable boundary. Future canonical-archetype migrations (Epic 13 historic-instances, Epic 14 identity, Epic 15 DMN) will face the same temptation — one extra commit per migration is the price for durable bisectability.

### Cross-component state patterns

**Map-symmetry for reverse-action pairs (Epic 11 retro §4.2).** When a story adds the inverse of an existing optimistic-UI action (e.g., unclaim alongside claim, reopen alongside resolve, unassign alongside assign), reuse the existing `Map<string, V>` with a distinct sentinel value (`""` for "intentionally empty"; `null` for "engine-state restored"). Do NOT introduce twin Maps. See [src/routes/tasks/index.tsx](src/routes/tasks/index.tsx) where `optimisticClaimed: Map<string, string>` is consumed by both `handleClaim` (sentinel = username) and `handleUnclaim` (sentinel = `""`); the reconciliation `effectiveAssignee = optimisticClaimed.get(t.id) ?? t.assignee ?? ""` handles both "just claimed" and "just unclaimed" cleanly.

**Sequence-counter race guard (Epic 11 retro §4.5).** When concurrent listener firings can each launch an async fetch and only the latest result should commit, use a `useRef(0)` sequence counter — increment on entry, snapshot the value, only `setState` if the snapshot matches the current sequence:

```ts
const seq = useRef(0);
const refresh = useCallback(async () => {
  const mySeq = ++seq.current;
  const counts = await fetchCounts();
  if (mySeq === seq.current) setCounts(counts);  // only latest wins
}, [tenant.id]);
```

Strictly stronger than an in-flight ref guard (which drops mutations) and trivially simpler than `AbortController` for read-only data. See [src/app.tsx](src/app.tsx)'s `refreshNavCounts`. Reusable for search-as-you-type filtering, dashboard tile refresh on tenant switch, or any future autosave-with-conflict-resolution scenario.

**Tab-aware action-verb dispatch (Epic 12 retro §4.2).** When a URL search-param drives both the list endpoint AND the action verbs that apply to rows, dispatch in the handler — not in a separate handler-per-tab. The discriminant stays in scope at the row action; the handler reads as plain `if (type === "X") await api.tabXAction(j.id); else await api.defaultAction(j.id);`. See `handleExecute` in [src/routes/jobs/index.tsx](src/routes/jobs/index.tsx) branching between `api.executeJob` and `api.executeTimerJob` based on the `type` search-param. Future surfaces likely to need this: Epic 13.3's history-tab dispatch (variables vs tasks), Epic 14's identity-tab dispatch (users vs groups), Epic 15's DMN-tab dispatch (decisions vs deployments). Extraction trigger at N≥3 consumers; current count is 2 (Execute, Move).

**Cross-component invalidation events live in `src/lib/nav-events.ts` (Epic 11 retro A-2).** The `NAV_INVALIDATE_COUNTS` constant is dispatched after mutations that change Sidebar badge counts (Claim / Complete / Delegate / Unclaim / Execute / Move / Start / Cancel / Resolve / form submit). The app-level listener in [src/app.tsx](src/app.tsx) refetches counts; the sequence-counter race guard above keeps it safe under concurrent dispatch. Add new `nav:*` events as named exports in the same module; never use bare string literals in dispatch sites (a `grep '"nav:invalidate-counts"' src/` regression-guard exists).

### State / data fetching pattern

Screens use a small `useApi(fn, deps)` hook in [src/screens.jsx](src/screens.jsx) that returns `{ loading, data, error, reload }`. Every screen renders three states: loading, error (with the actual error message — no silent fallbacks), and empty (`No records.`). When you add a screen, follow this pattern rather than introducing a state library.

**v1 canonical for list screens (Story 9.1 onwards):** URL-identity list data uses TanStack Router's `loader` + `pendingComponent` + `errorComponent` slots (precedent: [src/routes/deployments/index.tsx](src/routes/deployments/index.tsx)). `useApi` remains the pattern for secondary fetches inside components. The migration of the other list screens (Process Definitions, Instances, Tasks, Jobs, History, Identity) lands in subsequent Epic 9-15 stories — until each one ships, those screens keep their `useApi` implementation.

**Canonical-archetype list screens defer browser-tier route-mount tests (Epic 11 retro A-4 Option b).** In favour of loader-unit + Playwright E2E. Precedents: 9.1 (deployments), 9.4 (definitions), 10.1 (instances), 11.1 (tasks), 12.1 (jobs). Spec authors should NOT ask for browser-tier `describe(..., ...)` route-mount tests on canonical-archetype list screens — the per-spec deferral note is unnecessary now that the pattern has 5 applications. The harness to render a TanStack Router route with loader + search-param context + `RouterProvider` is intentionally not built; when a non-archetype list screen needs it (likely Epic 18's keyboard navigation), build the harness then. Per-component browser-tier tests on individual sub-components (modals, panels, ErrorBox) remain expected.

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
