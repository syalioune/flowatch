# Project Overview — Flowatch

## Purpose

Flowatch is a single-page React + Vite GUI for **Flowable 7 OSS** — an open-source BPMN/DMN process engine. It wraps the Flowable REST API and embeds the official [`bpmn-js`](https://bpmn.io/toolkit/bpmn-js/) and [`dmn-js`](https://bpmn.io/toolkit/dmn-js/) modelers in the browser.

The app talks **only to the live Flowable engine** — there is no mock fallback or offline mode. When the engine is unreachable, screens render explicit error states rather than fake data.

## Executive summary

- **Type:** monolith (single-part), web project
- **Runtime:** browser SPA, no SSR
- **Backend:** none of its own — consumes `flowable-rest:7.2.0` running in Docker
- **State:** local React state only (`useState` / `useEffect`); no Redux/Zustand/Context-based store
- **Routing:** TanStack Router — file-based routes under [src/routes/](../src/routes/)
- **Tests / lint / format:** Vitest (unit) · Biome v2 (lint/format) · Playwright (E2E)
- **Repository status:** active, v1.0.0 released

## Tech stack

| Category        | Technology              | Version  | Notes                                                          |
| --------------- | ----------------------- | -------- | -------------------------------------------------------------- |
| Language        | TypeScript / TSX        | ES2022+  | Strict mode; all source files under `src/` are `.ts` / `.tsx`  |
| Framework       | React                   | ^18.3.1  | Hooks-only; no class components                                |
| Bundler         | Vite                    | ^5.x     | `vite.config.ts`, `@vitejs/plugin-react` 4.x                  |
| Router          | TanStack Router         | ^1.x     | File-based routes in `src/routes/`; auto-generated `routeTree.gen.ts` |
| BPMN modeler    | bpmn-js                 | ^17.x    | Vanilla class wrapped in React, not the React binding          |
| DMN modeler     | dmn-js                  | ^16.x    | Same wrapping pattern                                          |
| Form viewer     | @bpmn-io/form-js-viewer | —        | Same wrapping pattern (Pattern P-006 N=3)                      |
| OIDC            | oidc-client-ts + react-oidc-context | — | PKCE flow; tokens in-memory only (NFR-11) |
| Process engine  | Flowable REST           | 7.2.0    | External — runs in Docker (`flowable/flowable-rest:7.2.0`)     |
| Database        | PostgreSQL              | 16-alpine | Persistence for Flowable only; Flowatch doesn't touch it       |
| CORS            | Native Flowable CORS    | n/a      | `flowable.rest.app.cors.*` env vars configure cross-origin access directly on the engine |
| Dev proxy       | Vite proxy              | n/a      | Forwards `/flowable-rest` → `http://localhost:8080`            |
| Lint / format   | Biome v2                | ^2.x     | Replaces ESLint + Prettier; pre-commit hook via Husky          |
| Unit tests      | Vitest                  | —        | Browser-mode provider for component tests                      |
| E2E tests       | Playwright              | —        | Against live Docker Flowable engine                            |

## Architecture type

**Single-page application** with a layered structure:

```
TanStack Router routes (src/routes/**)
  + legacy screens (src/screens.tsx)
  + modelers (src/modeler/)
        │
        ▼
useApi hook / route loaders ──► api.ts (single request() funnel) ──► Flowable REST
                                        │
                                        ├─► API_LOG (in-memory ring buffer)
                                        └─► window CustomEvent("api:log")
                                                │
                                                ▼
                                        ApiInspector drawer
```

Cross-component coordination happens via **`window` events** (the API log) and **prop drilling from `App`**. The `TweaksPanel` uses `window.postMessage` to toggle edit mode.

Theming uses **data attributes on `<html>`** (`data-look`, `data-theme`, `data-density`) — see [src/styles/tokens.css](../src/styles/tokens.css) for the variable vocabulary.

## Repository structure

Monolith. All source under [src/](../src/), no client/server split. Flowable and PostgreSQL are containerized externally via [docker-compose.yml](../docker-compose.yml); native Flowable CORS handles cross-origin access.

## Linked documentation

- [Architecture](./architecture.md) — detailed component, data, and integration design
- [Component inventory](./component-inventory.md) — all React components catalogued
- [Development guide](./development-guide.md) — setup, build, run commands
- [Deployment guide](./deployment-guide.md) — Docker stack and native Flowable CORS
- [API contracts](./api-contracts.md) — Flowable REST wrappers exported by `api.ts`
- [CLAUDE.md](../CLAUDE.md) — AI-agent contract and conventions for this repo
