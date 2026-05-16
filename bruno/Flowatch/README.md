# Flowatch Bruno collection

Runnable [Bruno](https://www.usebruno.com/) collection for the **Flowable 7+ REST API**. Mirrors every endpoint Flowatch uses (and a few it doesn't yet) so contributors can poke at the engine without writing curl by hand.

## Quick start

1. Install Bruno: <https://www.usebruno.com/downloads>
2. **Open Collection** → point Bruno at this directory (`bruno/Flowatch`).
3. Select the **Local** environment (top-right environment dropdown). Default credentials are `rest-admin` / `test`, matching the dev Docker stack.
4. Start the Flowable engine: `bash scripts/dev/run-dev.sh` (or just `docker compose up -d`).
5. Open **01-Diagnostics / 01-Engine info** and hit **Send**. You should get a 200 with `{ name, version: "7.2.0", … }`.

## Layout

The collection follows the same structure as [docs/api-contracts.md](../../docs/api-contracts.md) — one folder per Flowable sub-app / band:

| Folder | Sub-app root | Notes |
|---|---|---|
| `01-Diagnostics` | `/flowable-rest/service/management/{engine,properties}` | Engine info + service properties |
| `02-Repository-BPMN` | `/flowable-rest/service/repository/*` | BPMN deployments + process definitions |
| `03-Runtime` | `/flowable-rest/service/runtime/*` | Process instances, tasks, variables, attachments, event subscriptions |
| `04-Form` | `/flowable-rest/service/form/*` | Task forms |
| `05-Management` | `/flowable-rest/service/management/*` | Jobs, timer jobs, dead-letter, batches |
| `06-History` | `/flowable-rest/service/history/*` | Audit trail (instances / activities / variables / tasks) |
| `07-Identity` | `/flowable-rest/service/identity/*` | Users, groups, (privileges — **BLOCKED in 7.2 OSS**) |
| `08-DMN` | `/flowable-rest/dmn-api/*` | DMN decisions + execution history + (decision services — **BLOCKED**) |
| `09-CMMN` | `/flowable-rest/cmmn-api/*` | Case definitions / instances / tasks / jobs — exposed but **not yet used by Flowatch** (FR-50 v2+) |
| `10-App` | `/flowable-rest/app-api/*` | App definitions (read-only; runtime side **BLOCKED**) |

## Environments

Two are provided, both pointing at the same local Docker stack:

| Environment | Use when |
|---|---|
| `Local` | Default. Plain `localhost:8080`. |
| `Local-Docker` | Same as Local, with extra docs explaining the nginx CORS proxy path. |

To target a different engine, duplicate one of the `.bru` files under `environments/` and update `baseUrl`, `dmnBase`, `cmmnBase`, `appBase`.

## Variables

Each environment defines:

| Variable | Default | Purpose |
|---|---|---|
| `baseUrl` | `http://localhost:8080/flowable-rest/service` | BPMN + Runtime + Form + Management + History + Identity |
| `dmnBase` | `http://localhost:8080/flowable-rest/dmn-api` | DMN sub-app — Flowatch's `dmnBase()` helper swaps `/service` → `/dmn-api` for these |
| `cmmnBase` | `http://localhost:8080/flowable-rest/cmmn-api` | CMMN sub-app |
| `appBase` | `http://localhost:8080/flowable-rest/app-api` | App-definitions sub-app |
| `username` / `password` | `rest-admin` / `test` | Default credentials from `docker-compose.yml` |
| `tenantId` | (empty) | Optional — set to filter by tenant |

Per-request variables (e.g. `instanceId`, `taskId`, `deploymentId`, `processDefinitionId`) are declared in each request's `vars:pre-request` block with `PASTE_…` placeholder values. Fill them in before sending.

## Conventions in this collection

- **PRD traceability**: every request that maps to a Functional Requirement carries the FR ID in its name and/or docs section. E.g. `Edit instance variables (FR-19)`.
- **Compat audit results**: requests whose endpoint is **BLOCKED in flowable-rest:7.2.0 OSS** are kept in the collection (so we can re-test on Flowable releases) and labeled clearly in the request name and docs. See [docs/compat.md](../../docs/compat.md) for the full audit.
- **Mutating requests**: any PUT/POST/DELETE that mutates engine state has a placeholder ID. Don't run them against a production engine without changing the value.
- **Multipart uploads**: deployments use Bruno's `body:multipart-form` block with `file: @file()`. Bruno will prompt you to pick a file when you send.

## Maintaining the collection

When Flowatch adds a new Flowable endpoint in [src/api.js](../../src/api.js):

1. Add a corresponding `.bru` file in the appropriate folder.
2. Reference the PRD FR in its `docs` section.
3. If you ran a live test, update [docs/compat.md](../../docs/compat.md) with the result.
4. PR auto-labeler will apply `ref:bruno` (see `.github/labeler.yml`).

When a Flowable major/minor release drops:

1. Re-run the **BLOCKED** requests (e.g. `/identity/privileges`, `/dmn-api/dmn-repository/decision-services`, `/process-migration`) to see if they've been exposed.
2. Move the unblocked ones out of "BLOCKED" naming and update [docs/compat.md](../../docs/compat.md) accordingly.

## Why Bruno (not Postman / Insomnia / Hoppscotch)

- **Plain text on disk.** Each request is a single `.bru` file in git — diffable, reviewable, no binary collections.
- **Local-first.** No SaaS, no telemetry — matches Flowatch's air-gap rule.
- **Free, open source.** No license required for collaborators.
- **No vendor lock-in.** If we ever move to another runner, the `.bru` format converts to OpenAPI / Postman trivially.
