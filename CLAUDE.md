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
| `make engine-up-flowatch` | `docker compose --profile flowatch up -d` (engine + published SPA image on `:5173`) |
| `make engine-down`   | `docker compose down`                                                    |
| `make engine-logs`   | `docker compose logs -f`                                                 |
| `make engine-health` | `curl -fsS -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine` |
| `make engine-psql`   | `docker compose exec postgres psql -U flowable -d flowable`              |

Either column works in isolation — pick whichever fits the context. The Makefile is a thin wrapper, not a lock-in.

There is **no test suite, linter, or formatter** configured yet — the npm package only ships `dev`, `build`, `preview`, and the `release:preview*` helpers.

Other Makefile namespaces (see `make help`): `bootstrap-*` (one-time GitHub repo setup), `stories-*` (user-stories ↔ issues sync), `bmad-*` (private companion repo helpers), `release-*` (semantic-release preview).

## Architecture

### Routing

[src/app.jsx](src/app.jsx) holds a single `view` state string and renders one screen via a `switch` statement. There is no React Router — adding/renaming a screen means updating three places in [app.jsx](src/app.jsx): the `switch`, `VIEW_TITLE`, and `ENDPOINT_BY_VIEW`. Empty-state copy for list screens lives in [src/lib/empty-states.tsx](src/lib/empty-states.tsx) — bootstrap-and-extend.

### API layer

API calls funnel through a single `request()` function in [src/api.js](src/api.js); DMN calls use `dmnBase()` / `connectionRoot()`-relative helpers; the live engine is the only backend — no mock fallback. → [API Layer](docs/claude/api-layer.md) for full details on auth strategies, the Inspector log, connection config, and the CORS proxy chain.

### Modelers

Both BPMN and DMN modelers wrap their vanilla `bpmn-js` / `dmn-js` classes via Pattern P-006 (useEffect instantiation, local event-type interfaces, destroy-on-cleanup). Shared starter XMLs live in [src/modeler/starters.ts](src/modeler/starters.ts). → [Modelers](docs/claude/modelers.md) for Pattern P-006 full spec, form-js viewer (N=3), BPMN properties panel, and DMN JUEL discipline.

### Modal conventions

Five named modal shapes: retryable-creation (in-modal ErrorBox), one-shot destructive (navigate-on-both), console-shape (stay open, iterate), discovery-shape (read-only, keyboard-opened), and add-membership variant. All modals use `triggerRef` focus-restore; destructive modals whose trigger row is removed add `fallbackRef`. → [Modal Conventions](docs/claude/modal-conventions.md) for full specs including ARIA contract, segmented-control picker, auth-strategy dispatcher, and datetime-local round-trip.

### Component patterns

Key patterns: panel-as-sibling (each panel owns its own `useApi`, never extracted), row-expand-for-detail, PUT-with-partial-fields wrapper family, `useApi` hook for secondary fetches, TanStack Router `loader` for canonical list screens. → [Component Patterns](docs/claude/component-patterns.md) for map-symmetry, sequence-counter race guard, tab-aware dispatch, never-extract-at-N=4, and cross-component invalidation events.

### Design system

Three looks × two themes × three densities, all driven by `data-look` / `data-theme` / `data-density` attributes on `<html>` — CSS variables only, no Tailwind or CSS-in-JS. Pattern P-007 governs theming hooks; Pattern P-008 governs token-contract guard tests. → [Design System](docs/claude/design-system.md) for full P-007 / P-008 specs and the `.sr-only` discipline.

## Cross-story sequencing

Conventions covering placeholder-then-real, UX-polish cadence, review-patch-fold vs post-closure-fixup, bundled refactor avoidance, LegacyXxxShim migrations, live-engine-walkthrough commit shapes, post-smoke DAR discipline, sprint-status flip timing, and spec-authoring checks. → [Sequencing Conventions](docs/claude/sequencing-conventions.md)

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
- **No CSS-in-JS.** Add component CSS to [src/styles/components.css](src/styles/components.css); add new tokens to [src/styles/tokens.css](src/styles/tokens.css); use the existing CSS-variable vocabulary.
- **Live API only.** Don't reintroduce mock fixtures into screens — show `{loading, error, empty}` states from the real `useApi` hook instead. [src/data.js](src/data.js) only holds REST endpoint metadata for the Inspector and PageHead chips.
- **`landing/` is the project presentation page**, not part of the app. It's a hand-authored static HTML+CSS one-pager that deploys to GitHub Pages (PRD FR-F12 / FR-F13). Don't pull `src/`, `vite.config.js`, TanStack Router, or React into it. Don't add CDN references — NFR-9 is enforced by `make landing-check`. Visual tokens come from [src/styles/tokens.css](src/styles/tokens.css) editorial-light-regular — kept in sync by hand, not via build coupling. README.md is the source of truth for project facts; the landing page is a curated reflection. Preview locally with `make landing-preview`.
- **Canvas-integration e2e tests assert computed-style, not just class-presence (Epic 26 retro AI-2).** When a story applies CSS classes to elements rendered by vanilla `bpmn-js` / `dmn-js` (or any future canvas-integration library), Playwright e2e MUST include `getComputedStyle(...)` assertions against the rendered SVG — not only `page.locator(".activity-current")` class-presence checks. Class-presence verifies markup; computed-style verifies visibility. bpmn-js' `BpmnRenderer` sets `stroke` / `fill` / `stroke-width` via inline `style` attributes that ALWAYS win over CSS rules without `!important`; diagram-js' own marker classes (`connect-ok` / `drop-ok`) carry `!important` for the same reason. Story 26.2 closed with marker classes applied and class-presence asserts green, but the markers were INVISIBLE — caught only at smoke (`8f9ea57`). The canonical regression-guard shape lives in [e2e/instance-detail-dual-fetch.spec.ts](e2e/instance-detail-dual-fetch.spec.ts): `await expect.poll(() => canvas.evaluate(el => getComputedStyle(el).stroke)).toMatch(/^oklch\(/)` — assert the design-system token shape (`oklch(...)`), not a literal color value. Future Pattern P-006 viewer consumers (Epic 27 model-versioning, any future audit-replay overlay) inherit this discipline on day one.
- **Sidebar nav-link selectors must be href-based, not strict-regex accessible-name (Epic 24 retro AI-1).** Sidebar `<Link>` items that carry a count badge (`<span className="nav-count">{N}</span>` since `bb6c0dd`) concatenate the badge text into the link's accessible name — `getByRole('link', { name: /^Batches$/ })` matches "Batches" but NOT "Batches 0". Use href-based locators on the Sidebar: `page.locator('a[href="/batches"]')` or `page.getByRole('link', { name: /^Batches/ })` (prefix-only regex). The canonical shape lives in [e2e/sidebar-nav.spec.ts](e2e/sidebar-nav.spec.ts) post-`df07751`. This is NOT a Sidebar-specific quirk — any clickable surface that accumulates text fragments (icon-text + label + count + indicator) will hit the same accessible-name concatenation. Story 18.2 codification's `<span className="sr-only">Count: </span>` prefix improves screen-reader announcement but does NOT remove the badge digits from the accessible name (sr-only spans are still part of name-from-contents). The cascade caught at CI: `df07751` after `bb6c0dd`; local-vs-CI gate divergence is the same class of bug as Epic 26 retro AI-4 (biome local-vs-CI). Future nav-touching stories (Epic 25 `/app-definitions`, Epic 28 OIDC sign-in routes) inherit this on day one.
