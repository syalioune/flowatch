# Project Overview — Flowatch

## Purpose

Flowatch is a single-page React + Vite GUI for **Flowable 7 OSS** — an open-source BPMN/DMN process engine. It wraps the Flowable REST API and embeds the official [`bpmn-js`](https://bpmn.io/toolkit/bpmn-js/) and [`dmn-js`](https://bpmn.io/toolkit/dmn-js/) modelers in the browser.

The app talks **only to the live Flowable engine** — there is no mock fallback or offline mode. When the engine is unreachable, screens render explicit error states rather than fake data.

## Executive summary

- **Type:** monolith (single-part), web project
- **Runtime:** browser SPA, no SSR
- **Backend:** none of its own — consumes `flowable-rest:7.2.0` running in Docker
- **State:** local React state only (`useState` / `useEffect`); no Redux/Zustand/Context-based store
- **Routing:** single `view` string switched in [src/app.jsx](../src/app.jsx); no router library
- **Tests / lint / format:** none configured
- **Repository status:** active, design-driven (UI mocked first via Claude Design then implemented)

## Tech stack

| Category        | Technology              | Version  | Notes                                                          |
| --------------- | ----------------------- | -------- | -------------------------------------------------------------- |
| Language        | JavaScript (JSX)        | ES2022+  | No TypeScript by convention                                    |
| Framework       | React                   | ^18.3.1  | Hooks-only; no class components                                |
| Bundler         | Vite                    | ^5.4.8   | `@vitejs/plugin-react` 4.x                                     |
| BPMN modeler    | bpmn-js                 | ^17.11.1 | Vanilla class wrapped in React, not the React binding          |
| DMN modeler    | dmn-js                  | ^16.6.1  | Same wrapping pattern                                          |
| Process engine  | Flowable REST           | 7.2.0    | External — runs in Docker (`flowable/flowable-rest:7.2.0`)     |
| Database        | PostgreSQL              | 16-alpine | Persistence for Flowable only; Flowatch doesn't touch it       |
| CORS proxy      | nginx                   | alpine   | Required because flowable-rest rejects browser-origin requests |
| Dev proxy       | Vite proxy              | n/a      | Forwards `/flowable-rest` → `http://localhost:8080`            |

## Architecture type

**Single-page application** with a layered structure:

```
UI screens (screens.jsx, modeler.jsx)
        │
        ▼
useApi hook ──────► api.js (single request() funnel) ──► Flowable REST
        │                       │
        │                       ├─► API_LOG (in-memory ring buffer)
        │                       └─► window CustomEvent("api:log")
        ▼                               │
   Toast notifications                  ▼
                                ApiInspector drawer
```

Cross-component coordination happens via **`window` events** (the API log) and **prop drilling from `App`**. The `TweaksPanel` uses `window.postMessage` to toggle edit mode.

Theming uses **data attributes on `<html>`** (`data-look`, `data-theme`, `data-density`) — see [src/styles.css](../src/styles.css) for the variable vocabulary.

## Repository structure

Monolith. All source under [src/](../src/), no client/server split. Flowable, PostgreSQL, and the nginx proxy are containerized externally via [docker-compose.yml](../docker-compose.yml).

## Linked documentation

- [Architecture](./architecture.md) — detailed component, data, and integration design
- [Source tree analysis](./source-tree-analysis.md) — annotated file/folder reference
- [Component inventory](./component-inventory.md) — all React components catalogued
- [Development guide](./development-guide.md) — setup, build, run commands
- [Deployment guide](./deployment-guide.md) — Docker stack and nginx CORS proxy
- [API contracts](./api-contracts.md) — Flowable REST wrappers exported by `api.js`
- [CLAUDE.md](../CLAUDE.md) — AI-agent contract and conventions for this repo
