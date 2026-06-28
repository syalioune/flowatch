# Deployment Guide

Flowatch ships as a static SPA bundle. There is no server-side runtime to deploy — the only moving parts in a Flowatch "deployment" are:

1. The static `dist/` bundle (output of `npm run build`).
2. A reachable Flowable REST engine with CORS configured.

## Local Docker stack

The repo ships a Compose stack at [docker-compose.yml](../docker-compose.yml) that runs both external dependencies for local development.

### Services

| Service    | Image                            | Purpose                                                                                  |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`             | Persistence for the Flowable engine. DB/user/password all hard-coded to `flowable`.      |
| `flowable` | `flowable/flowable-rest:7.2.0`   | The BPMN/DMN process engine, exposing the REST API at `/flowable-rest/service` and DMN at `/flowable-rest/dmn-api`. Publishes host `:8080` directly with **native CORS** configured via `flowable.rest.app.cors.*` env vars. Admin user `rest-admin` / password `test`. |
| `flowatch` *(profile: `flowatch`)* | `syalioune/flowatch:${FLOWATCH_TAG:-latest}` | Optional — the published SPA image, served on host `:${FLOWATCH_PORT:-5173}`. Only started when `--profile flowatch` is passed. Use this to demo or self-host without running `npm` / Vite locally. |

Volume `postgres_data` persists the Flowable database between restarts.

### Start / stop / inspect

```bash
docker compose up -d                 # start everything (default services)
docker compose --profile flowatch up -d   # also pull & run the SPA image on :5173
docker compose ps                    # see status
docker compose logs -f flowable      # tail engine logs
docker compose down                  # stop (data preserved)
docker compose down -v               # stop AND wipe Postgres data
```

The `flowatch` profile and `make dev` both bind host port `5173` — pick one. Override with `FLOWATCH_PORT=8081 docker compose --profile flowatch up -d` to run both side-by-side; override `FLOWATCH_TAG` (`develop`, `sha-<short>`, or a version) to track a different image stream.

### Health check

```bash
curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .
```

Expected: `{ "name": "default", "version": "7.2.0", "resourceUrl": "...", "exception": null }`.

## Native Flowable CORS

Since Story 34.2 (2026-06-17) the bundled stack uses **Flowable's native CORS support** — no nginx sidecar.

### How it works

`flowable-rest:7.2.0` honors `flowable.rest.app.cors.*` Spring Boot properties via environment variables. Spring relaxed-binding converts property names to env vars: dots become underscores, hyphens within a segment are dropped, everything uppercased. The working set (verified live):

```
FLOWABLE_REST_APP_CORS_ENABLED=true
FLOWABLE_REST_APP_CORS_ALLOWEDORIGINS=http://localhost:5173
FLOWABLE_REST_APP_CORS_ALLOWEDHEADERS=Authorization,Content-Type,Accept
FLOWABLE_REST_APP_CORS_ALLOWEDMETHODS=GET,POST,PUT,DELETE,OPTIONS
FLOWABLE_REST_APP_CORS_ALLOWCREDENTIALS=true
```

The `ALLOWED_ORIGIN` env var (same variable the old nginx used) feeds `FLOWABLE_REST_APP_CORS_ALLOWEDORIGINS` — default `http://localhost:5173`.

### Setting a production origin

```bash
ALLOWED_ORIGIN=https://flowatch.example.com docker compose up -d
```

### ⚠️ Guardrail regression vs the previous nginx setup

The old `40-validate-origin.sh` script failed loud on a malformed `ALLOWED_ORIGIN` (empty, trailing slash, wildcard, comma-list). Flowable's native CORS **does not fail-fast** — a bad value silently produces a bad `Access-Control-Allow-Origin` header and browsers reject all cross-origin requests without an obvious error.

Operators are responsible for ensuring `ALLOWED_ORIGIN` is:
- A single, exact origin (`scheme://host[:port]`) — no trailing slash
- Not a wildcard (`*`) — incompatible with `Allow-Credentials: true`
- Not a comma-separated list — CORS allows only one origin per response header

### Pointing Flowatch at your own Flowable engine

Operators running their own `flowable-rest:7.2.0` no longer need a nginx sidecar. Add the five env vars above to your Flowable deployment (Docker, Kubernetes env, Spring `application.properties`, etc.) and point Flowatch at your engine directly. See [docs/compat.md](compat.md) for the live verification results.

## Production deployment

There is no committed production Dockerfile or CI pipeline. To deploy:

1. `npm install && npm run build` — produces `dist/`.
2. Serve `dist/` as static files behind any HTTP server (nginx, Cloudflare Pages, S3+CloudFront, etc.).
3. Provide a Flowable REST engine reachable from the browser with CORS configured (native, or any proxy that sets `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials: true` for your SPA's origin).
4. Either point users to `Settings → Connection` to set the `baseUrl`, or change the `defaultCfg` in [src/api.ts](../src/api.ts) before building and rebuild.

The Vite build splits vendor code into separate chunks (`bpmn`, `dmn`, `react`, `oidc`) per [vite.config.ts](../vite.config.ts), so the initial bundle stays small until the user opens a modeler or OIDC connection.

## CI/CD

GitHub Actions workflows live under `.github/workflows/`. The pipeline runs on every push to `develop` and on PRs:

| Job | Trigger | What it does |
|---|---|---|
| `check` | push / PR | Biome lint + format check (`npm run check`) |
| `unit` | push / PR | Vitest unit + browser-mode tests (`npm test`) |
| `e2e` | push / PR | Playwright E2E against Docker Compose Flowable engine |
| `build` | push / PR | `npm run build` + dist artifact upload |
| `release` | push to `main` | semantic-release (changelog, GitHub release, npm publish) |

Dependabot runs weekly SHA-pin bumps for both npm and GitHub Actions deps.

## Operational notes

- **Credentials**: `rest-admin` / `test` are hard-coded in [docker-compose.yml](../docker-compose.yml) and in `defaultCfg` of [src/api.ts](../src/api.ts). For any non-local deployment, change both _and_ rotate the Postgres password (`POSTGRES_PASSWORD`).
- **Persistence**: only Flowable's Postgres volume needs backing up. Flowatch itself stores nothing server-side; its only state lives in the browser's `localStorage` under `flowatch.connection.v1`.
- **Tenant isolation**: Flowable supports multi-tenancy. Flowatch reads tenant IDs via `api.listTenants()` (derived from `/repository/deployments`, since `/identity/tenants` is not available in flowable-rest 7.2) and the active tenant is set via `api.setConfig({ tenantId })`.
