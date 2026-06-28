# Flowatch Documentation Index

_Generated: 2026-05-11 by `bmad-document-project` (deep scan). Last updated: 2026-06-18._

## Project overview

- **Type:** monolith, web project (single-page application)
- **Primary language:** TypeScript / TSX
- **Architecture:** layered SPA, hooks-only React, single `request()` funnel over Flowable REST
- **Repository:** [github.com/syalioune/flowatch](https://github.com/syalioune/flowatch)

## Quick reference

| Attribute              | Value                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| Framework              | React 18.3.1                                                                     |
| Bundler                | Vite 5 (`vite.config.ts`)                                                        |
| Modeler libs           | bpmn-js 17.x, dmn-js 16.x, @bpmn-io/form-js-viewer                              |
| Engine consumed        | Flowable REST 7.2.0 (external, runs in Docker)                                   |
| Persistence            | None client-side beyond `localStorage`; PostgreSQL 16 for Flowable               |
| Tests / lint / format  | Vitest (unit) · Biome v2 (lint/format) · Playwright (E2E)                        |
| Entry point            | [src/main.tsx](../src/main.tsx) → `<App/>` in [src/app.tsx](../src/app.tsx)      |
| Routing                | TanStack Router — file-based routes under [src/routes/](../src/routes/)          |
| State                  | `useState` / `useEffect` only; `window` events for cross-cutting signals         |
| Design system          | CSS variables × `data-look` / `data-theme` / `data-density` on `<html>`          |

## Generated documentation

- [Project overview](./project-overview.md) — purpose, exec summary, tech stack table
- [Architecture](./architecture.md) — components, data flow, integrations, risks
- [Component inventory](./component-inventory.md) — React components catalogued _(snapshot: 2026-05-11; many new components added since)_
- [Development guide](./development-guide.md) — setup, build, run, conventions
- [Deployment guide](./deployment-guide.md) — Docker stack, native CORS, prod notes
- [API contracts](./api-contracts.md) — Flowable REST wrappers exported by `api.ts`
- [Compatibility matrix](./compat.md) — which PRD FRs are viable against `flowable-rest:7.2.0`
- [Runtime caveats](./runtime-caveats.md) — browser/API quirks that produced real review patches
- [OIDC testing guide](./oidc-testing.md) — Keycloak smoke-test setup for OIDC auth

### Tooling metrics

- [Claude Code token usage — Road to 1.0.0](./claude-code-token-metrics.md) — token consumption breakdown across Stories 8.1 → 34.2 (2026-05-19 → 2026-06-18, 27 active dev days).

### Accessibility

- [WCAG 2.1 AA contrast audit — 2026-05](./a11y-audit-2026-05.md) — 32 contrast computations across 8 look × theme combinations. Locked behind [src/__tests__/wcag-contrast.test.ts](../src/__tests__/wcag-contrast.test.ts) (Pattern P-008 — token-contract guard test).
- [A11y audit — 1.0.0](./a11y-audit-1.0.0.md) — full axe-core audit across 8 look × theme combinations × 11 screens (Story 32.1).

> Data models — _Not applicable._ Flowatch is a frontend-only client and owns no persistent data models. Flowable's Postgres schema is internal to the engine.

## Existing documentation in the repo

- [CLAUDE.md](../CLAUDE.md) — **authoritative AI-agent contract.** Read first. Documents conventions ("no TypeScript", "no state library", "live API only"), architectural choices, and the design-system vocabulary.
- [README.md](../README.md) — **stale.** Contains a generic Claude Design handoff notice that predates implementation. Treat as out of date until rewritten.
- [.claude/commands/flowable-status.md](../.claude/commands/flowable-status.md) — `/flowable-status` slash command (engine health + active counts).
- [.claude/commands/deploy-process.md](../.claude/commands/deploy-process.md) — `/deploy-process <file>` slash command (BPMN/DMN deployment via `curl`).

## Getting started

1. `npm install`
2. `docker compose up -d` (starts Postgres + Flowable REST with native CORS)
3. Wait for engine to be ready: `curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .`
4. `npm run dev` → open `http://localhost:5173`

Defaults connect to `http://localhost:8080/flowable-rest/service` with `rest-admin` / `test`. Use the gear icon in the top bar to change them at runtime.

## Working in this repo

To add a new screen, create a route file under [src/routes/](../src/routes/) following the TanStack Router file-based pattern. See [development-guide.md](./development-guide.md#add-a-new-screen) for details.

For new API endpoints, add a wrapper in [src/api.ts](../src/api.ts) (or the relevant split file — `api-app.ts`, `api-history.ts`, `api-identity.ts`) that goes through `request(...)` and export it from the `api` object at the bottom. See [API contracts](./api-contracts.md).

## Brownfield PRD pointer

When running the BMad PRD workflow on this project, point it at this `index.md`. The PRD generator will pull tech stack, architecture, and existing-features context from the documents linked above.
