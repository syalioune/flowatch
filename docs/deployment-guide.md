# Deployment Guide

Flowatch ships as a static SPA bundle. There is no server-side runtime to deploy — the only moving parts in a Flowatch "deployment" are:

1. The static `dist/` bundle (output of `npm run build`).
2. A reachable Flowable REST engine.
3. A CORS proxy in front of Flowable (because `flowable-rest` does not emit browser-friendly CORS headers).

## Local Docker stack

The repo ships a Compose stack at [docker-compose.yml](../docker-compose.yml) that runs all three external dependencies for local development.

### Services

| Service    | Image                            | Purpose                                                                                  |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`             | Persistence for the Flowable engine. DB/user/password all hard-coded to `flowable`.      |
| `flowable` | `flowable/flowable-rest:7.2.0`   | The BPMN/DMN process engine, exposing the REST API at `/flowable-rest/service` and DMN at `/flowable-rest/dmn-api`. Admin user `rest-admin` / password `test`. |
| `nginx`    | `nginx:alpine`                   | Listens on host `:8080`, proxies `/flowable-rest/*` to the `flowable` container, and **injects CORS headers** allowing `http://localhost:5173` (the Vite dev server). |

Volume `postgres_data` persists the Flowable database between restarts.

### Start / stop / inspect

```bash
docker compose up -d                 # start everything
docker compose ps                    # see status
docker compose logs -f flowable      # tail engine logs
docker compose down                  # stop (data preserved)
docker compose down -v               # stop AND wipe Postgres data
```

### Health check

```bash
curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .
```

Expected: `{ "name": "default", "version": "7.2.0", "resourceUrl": "...", "exception": null }`.

## CORS proxy ([docker/nginx.conf](../docker/nginx.conf))

The nginx config does two things that are non-negotiable for browser access:

1. **Forwards** `/flowable-rest/*` to `http://flowable:8080/flowable-rest/`.
2. **Adds** `Access-Control-Allow-Origin: http://localhost:5173` on every response and short-circuits `OPTIONS` preflight with `204`.

If you front Flowable with a different proxy (Traefik, Caddy, AWS ALB, …) you must replicate **both** behaviours, including the preflight short-circuit and `Access-Control-Allow-Credentials: true`.

## Production deployment

There is no committed production Dockerfile or CI pipeline. To deploy:

1. `npm install && npm run build` — produces `dist/`.
2. Serve `dist/` as static files behind any HTTP server (nginx, Cloudflare Pages, S3+CloudFront, etc.).
3. Provide a Flowable REST engine reachable from the browser, fronted by a CORS-aware proxy.
4. Either point users to `Settings → Connection` to set the `baseUrl`, or change the `defaultCfg` in [src/api.js](../src/api.js#L6) before building and rebuild.

The Vite build splits vendor code into separate chunks (`bpmn`, `dmn`, `react`) per [vite.config.js](../vite.config.js), so the initial bundle stays small until the user opens a modeler.

## CI/CD

**None configured.** No `.github/workflows`, `.gitlab-ci.yml`, `Jenkinsfile`, or equivalent exists in the repository. Build/deploy is fully manual today.

## Operational notes

- **Credentials**: `rest-admin` / `test` are hard-coded in [docker-compose.yml](../docker-compose.yml) and in `defaultCfg` of [src/api.js](../src/api.js). For any non-local deployment, change both _and_ rotate the Postgres password (`POSTGRES_PASSWORD`).
- **Persistence**: only Flowable's Postgres volume needs backing up. Flowatch itself stores nothing server-side; its only state lives in the browser's `localStorage` under `flowatch.connection.v1`.
- **Tenant isolation**: Flowable supports multi-tenancy. Flowatch reads tenant IDs via `api.listTenants()` (derived from `/repository/deployments`, since `/identity/tenants` is not available in flowable-rest 7.2) and the active tenant is set via `api.setConfig({ tenantId })`.
