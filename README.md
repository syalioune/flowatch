<p align="left">
  <img src="branding/flowatch-lockup.svg" alt="Flowatch" height="48">
</p>

[![CI](https://github.com/syalioune/flowatch/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/syalioune/flowatch/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/syalioune/flowatch?display_name=tag&sort=semver)](https://github.com/syalioune/flowatch/releases)
[![Tested vs Flowable](https://img.shields.io/badge/Flowable-7.2.0-orange.svg)](docs/compat.md)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12874/badge)](https://www.bestpractices.dev/projects/12874)

# Flowatch — the OSS GUI for Flowable 7+

> _Flowatch is a community OSS GUI for Flowable. Not affiliated with Flowable.com Ltd._

A single-page React + Vite GUI for **[Flowable](https://www.flowable.com/open-source/)** 7.x and beyond — the open-source BPMN/DMN process engine. Flowatch wraps the Flowable REST API and embeds the official [`bpmn-js`](https://bpmn.io/toolkit/bpmn-js/) and [`dmn-js`](https://bpmn.io/toolkit/dmn-js/) modelers in the browser. The app talks **only to the live engine** — there is no mock fallback. When the engine is unreachable, screens render explicit error states.

## Why Flowatch exists

Flowatch gives Flowable 7+ OSS users a complete browser GUI: model BPMN and DMN, deploy them, watch instances, work tasks, inspect jobs and history, and manage identity — all without writing curl commands.

The need is real. Flowable's 7.x OSS distribution ships the engine and REST API; the web UI sits in the enterprise tier. Public-sector teams, SMEs, and air-gapped self-hosters need an OSS browser front-end, and the 2026 OSS landscape has none actively maintained — most community alternatives are modeler-only POCs ([full landscape report](https://github.com/syalioune/flowatch-bmad/blob/main/_bmad-output/planning-artifacts/research/market-flowable-oss-gui-alternatives-research-2026-05-11.md) — maintainer-only private repo).

Flowatch fills that gap. The benchmark is the legacy 6.x OSS UI: if a 6.x-OSS operator used to do it, Flowatch should do it.

**Scope choices, on purpose:**
- **Flowable-specific.** Multi-engine support is out — [Operaton](https://operaton.org/), [Flowset](https://flowset.io/), and [Miragon/bpmn-modeler](https://github.com/Miragon/bpmn-modeler) already serve cross-engine users. Flowatch's value is being Flowable-aware down to the REST quirks (DMN sub-app prefix, missing `/identity/tenants`, multipart deployments).
- **OSS only.** No dependency on enterprise endpoints, no SaaS fallback, no telemetry.
- **Live API only.** No embedded mocks, no offline pretence — operators get real engine state or an honest error.

## Pull the image

Pre-built multi-arch images (`linux/amd64` + `linux/arm64`) are published from CI to two registries on every push to `main`, `develop`, and on `v*` tags:

```bash
# GitHub Container Registry (no auth needed for public pulls)
docker pull ghcr.io/syalioune/flowatch:latest

# Docker Hub mirror
docker pull syalioune/flowatch:latest
```

Each push gets the matching `:latest` (main) / `:develop` (develop) tag plus a `:sha-<short>` tag for traceability. Releases get `:<X.Y.Z>`, `:<X.Y>`, and `:<X>` tags as well. Every image carries SBOM (`spdx-json`) and SLSA provenance attestations — verify with:

```bash
docker buildx imagetools inspect ghcr.io/syalioune/flowatch:latest --format '{{ json .SBOM }}'
```

Run it pointed at any reachable Flowable backend (configure the URL in the Settings modal after the SPA loads):

```bash
docker run --rm -p 8081:8080 ghcr.io/syalioune/flowatch:latest
# open http://localhost:8081 — set baseUrl in Settings to your Flowable instance
```

The image carries only the static SPA bundle and a tiny nginx — no Node, no JRE. **Runs as non-root** (`uid 101`, `nginx`) and listens on the **unprivileged port 8080**, so it drops cleanly into Kubernetes restricted-baseline policies and can run with all Linux capabilities dropped. CPU/RAM at idle: <5 MB / <50 m-cpu.

## Quick start

```bash
make install     # npm ci
make stack       # postgres + flowable-rest 7.2.0 + nginx (:8080) + Vite (:5173)
```

Without `make`:

```bash
npm ci
bash scripts/dev/run-dev.sh
```

Or in three explicit steps (`make` / no-`make`):

```bash
make install         |   npm ci
make engine-up       |   docker compose up -d
make dev             |   npm run dev
```

Default credentials (configurable in the Settings modal): `rest-admin` / `test`.

Health-check the engine: `make engine-health` (or `curl -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine`).

**First boot pulls ~700 MB of Docker images** (postgres + flowable-rest 7.2.0 + nginx). Expect a green-light Dashboard within 2 minutes on broadband. Subsequent boots reuse the images and finish in well under a minute.

The sidebar footer shows a connection pill: **green** = engine reachable, **red** = unreachable. Click the pill to open the Settings modal and reconfigure the base URL or credentials.

**Restart paths:**

- **Warm restart** (keeps Flowable's Postgres state): `docker compose down && docker compose up -d` — back to green in under a minute.
- **Cold restart** (wipes the DB volume): `docker compose down -v && docker compose up -d` — re-bootstraps the Flowable schema; ~2 min.

**If the indicator stays red:**

- `make engine-logs` to tail flowable + nginx + postgres.
- `lsof -i :8080` (or `ss -ltnp '( sport = :8080 )'`) to check the port isn't held.
- Docker daemon running? `docker ps` should return without error.
- Credentials in the Settings modal match `rest-admin` / `test` (or whatever you've set).
- The `/flowable-status` slash command in Claude Code prints the engine summary.
- See [docs/deployment-guide.md](docs/deployment-guide.md) for deeper diagnostics.

## Scripts

`make help` lists every target. The common ones (with the underlying command they wrap):

| `make` target         | Underlying command                       | What it does                                          |
| --------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `make stack`          | `bash scripts/dev/run-dev.sh`            | Full local stack (Docker + Vite) in one shot          |
| `make dev`            | `npm run dev`                            | Vite dev server with HMR (assumes engine is up)       |
| `make build`          | `npm run build`                          | Production bundle to `dist/`                          |
| `make preview`        | `npm run preview`                        | Serve the production bundle locally                   |
| `make engine-up`      | `docker compose up -d`                   | Start the Docker stack (postgres + flowable + nginx)  |
| `make engine-down`    | `docker compose down`                    | Stop & remove engine containers                       |
| `make engine-logs`    | `docker compose logs -f`                 | Tail logs from all engine services                    |
| `make engine-health`  | `curl -u rest-admin:test …/management/engine` | Hit the Flowable management endpoint            |
| `make clean`          | `rm -rf node_modules dist`               | Remove `node_modules/` and `dist/`                    |

No test suite, linter, or formatter is configured yet.

## Where to read next

| If you want…                                | Open                                                |
| ------------------------------------------- | --------------------------------------------------- |
| A guided overview of what Flowatch is        | [docs/project-overview.md](docs/project-overview.md) |
| Architecture, request flow, theming layers  | [docs/architecture.md](docs/architecture.md)         |
| Local setup & build details                 | [docs/development-guide.md](docs/development-guide.md) |
| Docker stack & nginx CORS proxy             | [docs/deployment-guide.md](docs/deployment-guide.md) |
| Flowable REST wrappers exported by `api.js` | [docs/api-contracts.md](docs/api-contracts.md)       |

The full doc index lives at [docs/index.md](docs/index.md).

## Status

**Pre-alpha.** Flowatch runs against `flowable-rest:7.2.0` end-to-end today, and is being put on a defensible engineering footing — tests, lint, formatter, CI, and a TypeScript move — before adding net-new capabilities. Treat existing implementation choices as starting points to validate, not as permanent decisions. The [docs/](docs/) folder is the public source of truth; PRD / architecture / epics / story-specs live in a private companion repo (see [DEVELOPERS.md §2](DEVELOPERS.md#2-first-time-setup) for the two-repo split).

## AI-assisted development

Flowatch is built openly with AI as a first-class collaborator. Treat that as a feature, not a disclaimer: it's how a single maintainer can deliver Flowable-grade scope on a community budget. Every commit is human-reviewed and the maintainer (`Signed-off-by: Alioune SY`) carries the DCO; an `Co-Authored-By: Claude Opus 4.x` trailer is appended whenever an agent materially co-wrote the change.

**Tools the project uses:**

| Tool | Role | Where it shows up |
|---|---|---|
| [Claude Code](https://claude.com/claude-code) (Anthropic) | Interactive coding agent — implements stories, runs tests, opens PRs against the live engine. | [.claude/settings.json](.claude/settings.json), [.claude/commands/](.claude/commands/), [.claude/hooks/](.claude/hooks/) |
| [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) (community framework) | Agentic agile workflow — defined agents (PM, Architect, Analyst, Dev, UX, Tech-writer) and skills (brainstorm → PRD → architecture → epics → stories → dev → retro). | [.claude/skills/bmad-*](.claude/skills/) |

**Workflow in one breath:** BMAD plans the work (private companion repo: PRD, architecture, epics) → BMAD shards epics into story specs (public: [docs/specifications/user-stories/](docs/specifications/user-stories/)) → Claude Code implements one story at a time → tests + human review → conventional-commit + sign-off → CI. The two custom slash commands in [.claude/commands/](.claude/commands/) (`/flowable-status`, `/deploy-process`) automate the routine engine-interaction checks.

**For contributors:** every BMAD skill is committed and every Claude Code permission allowlist is reproducible from this repo. There is no maintainer-only sauce. See [DEVELOPERS.md](DEVELOPERS.md) for first-time setup and [BOOTSTRAP.md](BOOTSTRAP.md) for the one-time GitHub repo provisioning. Personal Claude Code overrides go in `.claude/settings.local.json` (gitignored) so the shared surface stays clean.

**Attribution & responsibility.** Claude Code and BMAD are tools; the design choices, the QA, and the responsibility for what ships are the maintainer's. Bug reports and feedback go to the same [issue tracker](https://github.com/syalioune/flowatch/issues) regardless of which keystrokes were AI-assisted.

## Release process

Releases follow `develop → release/X.Y.Z → main` per [ADR-011](_bmad-output/planning-artifacts/architecture.md#adr-011--release-pipeline-conventional-commits--semantic-release). The operational runbook with exact commands is at [docs/release-runbook.md](docs/release-runbook.md).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
