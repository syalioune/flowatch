<p align="left">
  <img src="branding/flowatch-lockup.svg" alt="Flowatch" height="48">
</p>

# Flowatch — the OSS GUI for Flowable 7+

> _Flowatch is a community OSS GUI for Flowable. Not affiliated with Flowable.com Ltd._

A single-page React + Vite GUI for **[Flowable](https://www.flowable.com/open-source/)** 7.x and beyond — the open-source BPMN/DMN process engine. Flowatch wraps the Flowable REST API and embeds the official [`bpmn-js`](https://bpmn.io/toolkit/bpmn-js/) and [`dmn-js`](https://bpmn.io/toolkit/dmn-js/) modelers in the browser. The app talks **only to the live engine** — there is no mock fallback. When the engine is unreachable, screens render explicit error states.

## Why Flowatch exists

Flowable 6.x shipped a web UI (modeler + admin + task + IDM) bundled with the OSS engine. Flowable [removed that UI in 7.0](https://www.flowable.com/blog/releases/flowable-open-source-7-0-0-release) and has not restored it since — the redesigned UX is **enterprise-only**. Public-sector teams, SMEs, air-gapped deployments, and self-hosters who can't (or won't) pay for Flowable Enterprise are left with just the REST API. A 2026-05 scan of the OSS landscape ([full report](https://github.com/syalioune/flowatch-bmad/blob/main/_bmad-output/planning-artifacts/research/market-flowable-oss-gui-alternatives-research-2026-05-11.md) — maintainer-only private repo) found **no actively-maintained community alternative** — forks of the legacy 6.x WARs are abandoned, and modern community projects are modeler-only POCs.

Flowatch is filling that gap. The benchmark is the old 6.x OSS UI: if 6.x-OSS users used to do it, Flowatch should eventually do it.

**Scope choices, on purpose:**
- **Flowable-specific.** Multi-engine support is out — [Operaton](https://operaton.org/), [Flowset](https://flowset.io/), and [Miragon/bpmn-modeler](https://github.com/Miragon/bpmn-modeler) already serve cross-engine users. Flowatch's value is being Flowable-aware down to the REST quirks (DMN sub-app prefix, missing `/identity/tenants`, multipart deployments).
- **OSS only.** No dependency on enterprise endpoints, no SaaS fallback, no telemetry.
- **Live API only.** No embedded mocks, no offline pretence — operators get real engine state or an honest error.

## Quick start

```bash
npm install
docker compose up -d   # Postgres 16 + flowable-rest 7.2.0 + nginx CORS proxy (:8080)
npm run dev            # Vite dev server on http://localhost:5173
```

Default credentials (configurable in the Settings modal): `rest-admin` / `test`.

Health-check the engine directly:

```bash
curl -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine
```

## Scripts

| Command           | What it does                                |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | Vite dev server with HMR                    |
| `npm run build`   | Production bundle to `dist/`                |
| `npm run preview` | Serve the production bundle locally         |

No test suite, linter, or formatter is configured.

## Where to read next

| If you want…                                | Open                                                |
| ------------------------------------------- | --------------------------------------------------- |
| A guided overview of what Flowatch is        | [docs/project-overview.md](docs/project-overview.md) |
| Architecture, request flow, theming layers  | [docs/architecture.md](docs/architecture.md)         |
| File-by-file annotated tree                 | [docs/source-tree-analysis.md](docs/source-tree-analysis.md) |
| Every React component catalogued            | [docs/component-inventory.md](docs/component-inventory.md) |
| Local setup & build details                 | [docs/development-guide.md](docs/development-guide.md) |
| Docker stack & nginx CORS proxy             | [docs/deployment-guide.md](docs/deployment-guide.md) |
| Flowable REST wrappers exported by `api.js` | [docs/api-contracts.md](docs/api-contracts.md)       |
| AI-agent contract & repo conventions        | [CLAUDE.md](CLAUDE.md)                              |

The full doc index lives at [docs/index.md](docs/index.md).

## Status

**Pre-alpha.** The current `src/` is the output of a Claude Design → Claude Code handoff that was completed only partially before being carried forward locally. It runs against `flowable-rest:7.2.0` end-to-end, but the project will be bootstrapped from zero to install proper engineering practices — tests, lint, formatter, CI, and possibly a TypeScript move. Treat existing implementation choices as starting points to validate, not as permanent decisions. The [docs/](docs/) folder is the public source of truth; PRD / architecture / epics / story-specs live in a private companion repo (see [DEVELOPERS.md §2](DEVELOPERS.md#2-first-time-setup) for the two-repo split).

## License

Not currently licensed — internal/experimental.
