# Flowatch Documentation Index

_Generated: 2026-05-11 by `bmad-document-project` (deep scan)._

## Project overview

- **Type:** monolith, web project (single-page application)
- **Primary language:** JavaScript / JSX (no TypeScript by policy)
- **Architecture:** layered SPA, hooks-only React, single `request()` funnel over Flowable REST
- **Repository:** [github → flowatch](.) (URL change to `github.com/syalioune/flowatch` pending — see rename checklist)

## Quick reference

| Attribute              | Value                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| Framework              | React 18.3.1                                                                     |
| Bundler                | Vite 5.4.8                                                                       |
| Modeler libs           | bpmn-js 17.11.1, dmn-js 16.6.1                                                   |
| Engine consumed        | Flowable REST 7.2.0 (external, runs in Docker)                                   |
| Persistence            | None client-side beyond `localStorage`; PostgreSQL 16 for Flowable               |
| Tests / lint / format  | None configured                                                                  |
| Entry point            | [src/main.jsx](../src/main.jsx) → `<App/>` in [src/app.jsx](../src/app.jsx)      |
| Routing                | Single `view` string + `switch` in [app.jsx](../src/app.jsx) — no router         |
| State                  | `useState` / `useEffect` only; `window` events for cross-cutting signals         |
| Design system          | CSS variables × `data-look` / `data-theme` / `data-density` on `<html>`          |

## Generated documentation

- [Project overview](./project-overview.md) — purpose, exec summary, tech stack table
- [Architecture](./architecture.md) — components, data flow, integrations, risks
- [Source tree analysis](./source-tree-analysis.md) — annotated directory tree
- [Component inventory](./component-inventory.md) — every React component catalogued
- [Development guide](./development-guide.md) — setup, build, run, conventions
- [Deployment guide](./deployment-guide.md) — Docker stack, CORS proxy, prod notes
- [API contracts](./api-contracts.md) — Flowable REST wrappers exported by `api.js`

### Accessibility

- [WCAG 2.1 AA contrast audit — 2026-05](./a11y-audit-2026-05.md) — 32 contrast computations across 8 look × theme combinations. Locked behind [src/__tests__/wcag-contrast.test.ts](../src/__tests__/wcag-contrast.test.ts) (Pattern P-008 — token-contract guard test).

> Data models — _Not applicable._ Flowatch is a frontend-only client and owns no persistent data models. Flowable's Postgres schema is internal to the engine.

## Existing documentation in the repo

- [CLAUDE.md](../CLAUDE.md) — **authoritative AI-agent contract.** Read first. Documents conventions ("no TypeScript", "no state library", "live API only"), architectural choices, and the design-system vocabulary.
- [README.md](../README.md) — **stale.** Contains a generic Claude Design handoff notice that predates implementation. Treat as out of date until rewritten.
- [.claude/commands/flowable-status.md](../.claude/commands/flowable-status.md) — `/flowable-status` slash command (engine health + active counts).
- [.claude/commands/deploy-process.md](../.claude/commands/deploy-process.md) — `/deploy-process <file>` slash command (BPMN/DMN deployment via `curl`).

## Getting started

1. `npm install`
2. `docker compose up -d` (starts Postgres + Flowable REST + nginx CORS proxy)
3. Wait for engine to be ready: `curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .`
4. `npm run dev` → open `http://localhost:5173`

Defaults connect to `http://localhost:8080/flowable-rest/service` with `rest-admin` / `test`. Use the gear icon in the top bar to change them at runtime.

## Working in this repo

Three places to update when adding a new screen (see [development-guide.md](./development-guide.md#add-a-new-screen)):

1. `switch` in [src/app.jsx](../src/app.jsx)
2. `VIEW_TITLE` in [src/app.jsx](../src/app.jsx)
3. `ENDPOINT_BY_VIEW` in [src/app.jsx](../src/app.jsx)

For new API endpoints, add a wrapper in [src/api.js](../src/api.js) that goes through `request(...)` and export it from the `api` object at the bottom.

## Brownfield PRD pointer

When running the BMad PRD workflow on this project, point it at this `index.md`. The PRD generator will pull tech stack, architecture, and existing-features context from the documents linked above.
