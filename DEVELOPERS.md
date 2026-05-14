# DEVELOPERS.md

A living guide for contributors to **Flowatch**. Environment setup, coding conventions, the branching model, testing, reviews, CI/CD, and release practices.

> TL;DR: `bash scripts/dev/run-dev.sh` brings up Docker (postgres + flowable-rest + nginx) and the Vite dev server in one go.

---

## 0) Repository structure

Flowatch is a **single-package React + Vite SPA**. There is no backend of its own — Flowable is the engine, Flowatch is the GUI.

```
/
├── src/                          # Application source (React + TypeScript)
│   ├── api*                      # The single Flowable REST request funnel
│   ├── screens*                  # Routed screens (Dashboard / Tasks / Jobs / …)
│   ├── modeler*                  # bpmn-js / dmn-js wrappers
│   ├── components/               # Reusable UI primitives (post-bootstrap)
│   ├── styles.css                # Single stylesheet, all themed via CSS variables
│   └── ...
├── public/                       # Static assets served verbatim by Vite (TBD)
├── branding/                     # Logo SVGs (mark, lockup, favicon)
├── bruno/                        # Bruno API collection for the Flowable REST API
├── docker/                       # nginx CORS proxy config for the dev stack
├── docs/                         # Living documentation (architecture, dev guide, compat matrix, ...)
├── _bmad-output/                 # ⤴ symlink → flowatch-bmad (private)  Planning artifacts (PRD, UX, …)
├── _bmad/                        # ⤴ symlink → flowatch-bmad (private)  BMad install + team overrides
├── .github/                      # Issue templates, labelers, dependabot, branch-protection config
├── .husky/                       # Git hooks (commit-msg via commitlint, pre-commit via Biome, pre-push tests)
├── scripts/
│   ├── bootstrap-gh/             # gh-CLI bootstrap (labels, milestones, project, branch protection)
│   ├── dev/                      # run-dev.sh
│   ├── release/                  # semantic-release helpers (preview, scope-check)
│   └── user-stories/             # Optional: keep local story files in sync with GitHub issues
├── docker-compose.yml            # Postgres + flowable-rest + nginx for local dev
├── vite.config.js                # Vite config (proxy, chunk splitting)
├── package.json                  # Single npm package at the root
├── index.html                    # Vite entry HTML
├── biome.json[c]                 # Biome v2 config (lint + format, TBD post-bootstrap)
├── tsconfig.json                 # TypeScript config (TBD post-bootstrap)
├── release.config.mjs            # semantic-release config (Conventional Commits → release notes)
├── CLAUDE.md                     # AI-agent contract (conventions, no-go's)
├── SECURITY.md                   # Security disclosure policy
├── CODE_OF_CONDUCT.md            # Contributor Covenant v2.1
├── SUPPORT.md                    # Where to ask for help
├── LICENSE                       # Apache 2.0
└── README.md                     # Project overview + positioning
```

---

## 1) Environment & tooling

**Required versions:**
- [Node.js](https://nodejs.org/en/download/) 18 LTS or higher (Vite 5 requirement)
- npm (committed `package-lock.json`)
- [Docker](https://docs.docker.com/get-started/get-docker/) + Docker Compose v2
- [Git](https://git-scm.com/downloads) with **GPG/SSH signing configured** (signed commits are enforced on `main`)
- [GitHub CLI](https://cli.github.com/) for the bootstrap scripts
- [jq](https://jqlang.org/download/) for the bootstrap scripts and shell helpers

**Optional but recommended:**
- [Bruno](https://www.usebruno.com/) for inspecting/editing the Flowable REST collection under `bruno/`
- [SVG Preview](https://marketplace.visualstudio.com/items?itemName=SimonSiefke.svg-preview) extension if you're touching `branding/`

---

## 2) First-time setup

```bash
# 1. Clone
git clone https://github.com/syalioune/flowatch.git
cd flowatch

# 2. (Maintainers only) Wire the private BMAD companion repo.
#    Required if you'll run BMad skills (PRD/architecture/epics/stories).
#    Skip if you're a code-only contributor.
bash scripts/setup-bmad.sh                                # interactive (prompts for path + protocol)
# or:  bash scripts/setup-bmad.sh -d ~/work/flowatch-bmad # specify checkout path, skip prompts
# or:  bash scripts/setup-bmad.sh -d ~/work/flowatch-bmad -i  # also auto-run `bmad-method install` if needed

# 3. One-shot dev environment (Docker stack + dev server)
bash scripts/dev/run-dev.sh

# Or step-by-step:
docker compose up -d                              # postgres + flowable-rest + nginx
npm ci                                            # dependencies
npm run dev                                       # Vite dev server on :5173
```

> **BMAD planning artefacts** (PRD, architecture, epics, stories, custom
> skill overrides) live in the private companion repo
> [`syalioune/flowatch-bmad`](https://github.com/syalioune/flowatch-bmad).
> [`scripts/setup-bmad.sh`](scripts/setup-bmad.sh) clones that repo to a
> location you choose and symlinks `_bmad/` and `_bmad-output/` into the repo
> root (both are `.gitignore`'d here). Re-run the script if you ever move the
> private checkout — the symlinks resolve via absolute paths captured at run
> time. Pass `-d <path>` to skip the path prompt, or `-i` to auto-run
> `bmad-method install` when the probe detects missing modules.

### Keeping the private repo in sync

Once BMAD is wired, the private repo gets new artefacts every time a BMad
skill produces one (PRD edits, architecture, epics, story-specs, sprint
plans, change proposals). Three mechanisms keep that flow committed without
turning the log into noise:

1. **[`scripts/bmad-sync.sh`](scripts/bmad-sync.sh)** — the single chokepoint
   for committing + pushing the private repo. It **derives the repo path
   from the `_bmad` symlink at runtime**, never from a hardcoded location,
   so moving the private checkout only requires re-running `setup-bmad.sh`.

   ```bash
   bash scripts/bmad-sync.sh -m "feat(prd): add FR-60 batch retry"     # commit + push
   bash scripts/bmad-sync.sh --no-push -m "..."                        # commit only
   bash scripts/bmad-sync.sh --status-only                             # reminder (no mutation)
   ```

2. **BMad `on_complete` directives** — every artefact-producing skill (PRD,
   architecture, epics, story-spec, sprint-planning, correct-course) has an
   override at [`_bmad/custom/<skill>.toml`](_bmad/custom/) telling the
   agent to call `bmad-sync.sh` with a Conventional-Commits message
   composed from the actual diff. Commit boundaries land on logical work
   units, not per-file edits.

3. **Stop hook in [`.claude/settings.json`](.claude/settings.json)** — fires
   at end of every Claude turn, runs `bmad-sync.sh --status-only`, and
   prints a one-line reminder if the private repo is dirty. It **never**
   auto-commits — manual edits to `flowatch-conventions.md` or
   `_bmad/custom/*.toml` stay your decision, with the human in the loop for
   the commit message.

If you're a **code-only contributor** (no access to `flowatch-bmad`), all
three pieces degrade silently: the sync script no-ops when `_bmad` isn't a
symlink, the hook prints nothing, and `on_complete` directives never fire
because the skills aren't installed.

Verify the engine is reachable:

```bash
curl -sf -u rest-admin:test http://localhost:8080/flowable-rest/service/management/engine | jq .
# → { "name": "default", "version": "7.2.0", ... }
```

Open <http://localhost:5173>. The Dashboard should connect automatically.

---

## 3) Branching model

Flowatch uses **single-branch trunk** (`main` only) until the project has multiple regular contributors. PRs target `main` directly; releases tag `main`.

- Feature branches: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`.
- No long-lived `develop` branch.
- `main` is protected: PR required, 1 approving review, signed commits, linear history, required CI checks (`check`, `unit`, `e2e`, `build`).

If/when the project grows: extend `scripts/bootstrap-gh/protect-branches.sh` to add a `develop` integration branch and adjust semantic-release `branches` in [release.config.mjs](release.config.mjs).

---

## 4) Commit conventions

**[Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/) — enforced by `commitlint` in the `commit-msg` hook.** Non-conforming commits are rejected before they reach the index.

Format:
```
<type>(<scope>): <subject>

[optional body]

[optional footer(s): BREAKING CHANGE: …, Closes: #N]
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `ci`, `chore`, `build`, `style`. See the table in [CONTRIBUTING.md](CONTRIBUTING.md#commit-conventions).

Scopes are project-defined and grouped into release-notes themes by [release.config.mjs](release.config.mjs). Before introducing a new scope:

```bash
node scripts/release/check-scope.mjs <scope> "<subject>"
```

Exit 0 means the scope is mapped; exit 1 means it'll fall into the "🧰 Other" catch-all on the next release — add it to the appropriate theme first.

**Breaking changes:** `feat(api)!: drop /repository/forms` plus a `BREAKING CHANGE: <description>` footer. The `!:` shortcut also triggers a major bump.

---

## 5) Testing

Three tiers. Each runs in its own CI job and has a corresponding npm script.

| Tier | Tool | Where it lives | Command | When it runs |
|------|------|----------------|---------|--------------|
| Unit | Vitest + jsdom | `src/**/*.test.ts(x)` | `npm test` | pre-push (changed files only), CI on every PR |
| Component | Vitest browser mode + Playwright provider | `src/**/*.spec.tsx` | `npm run test:component` | CI on every PR |
| E2E | Playwright vs. live `flowable-rest:7.x` | `e2e/**/*.spec.ts` | `npm run e2e` | CI on every PR (Docker stack provisioned in-runner) |

**Live-API discipline (PRD NFR-5):** E2E tests run against a real Dockerized Flowable. No mocking the engine in test code. If a test needs deterministic data, deploy a fixture process to a fresh Postgres before the run.

---

## 6) Code quality

| Tool | Role | Command | When |
|------|------|---------|------|
| Biome v2 | Lint + format (replaces ESLint + Prettier) | `npx biome check` / `npx biome format --write` | pre-commit (auto-fix), CI on every PR |
| TypeScript | Type check (strict) | `npx tsc --noEmit` | pre-push, CI |
| Vitest | Unit tests | `npm test` | pre-push, CI |
| Playwright | E2E + visual snapshots | `npm run e2e` | CI |
| Trivy | Container CVE scan (Docker images, if any) | CI job | CI |
| `check-scope.mjs` | Validate Conventional Commits scopes | `node scripts/release/check-scope.mjs <scope>` | Manual, pre-commit hint |

---

## 7) Reviews

PRs require:

- ✅ Passing CI (`check`, `unit`, `e2e`, `build`)
- ✅ 1 approving review from a CODEOWNERS entry (currently @syalioune)
- ✅ Linear history (rebase, no merge commits)
- ✅ Signed commits
- ✅ Conventional Commits compliant message(s)
- ✅ Acceptance Criteria section completed in the PR template (if it closes a user story)

The PR template covers traceability (FR/NFR/ADR), scope checklist, test evidence, security checklist, accessibility checklist, and Flowable-compatibility checklist. Fill the ones that apply; explicitly check off "N/A" lines you don't touch — don't silently leave them.

---

## 8) CI/CD

CI is GitHub Actions. See `.github/workflows/` once the workflows land (post-bootstrap).

Required checks (configured in `.github/protection/required_checks.json`):

| Check name | What it does |
|---|---|
| `CI / check` | Biome lint + format + `tsc --noEmit` |
| `CI / unit` | Vitest unit tests |
| `CI / e2e` | Playwright against Docker-Compose Flowable |
| `CI / build` | `vite build`; uploads `dist/` artifact |

All GitHub Actions used in workflows are SHA-pinned (per NFR-26), and Dependabot bumps the SHAs weekly.

---

## 9) Release practices

Releases are automated by [semantic-release](https://semantic-release.gitbook.io/) on tags. Push to `main` after a `feat:` or `fix:` commit lands → semantic-release tags the next version, generates release notes from Conventional Commits, and publishes to GitHub Releases.

To preview the release notes locally:

```bash
node scripts/release/preview-fast.mjs                       # vs. last stable tag
node scripts/release/preview-fast.mjs --range v0.0.1..HEAD  # explicit range
```

Release-notes themes (Modelers, Runtime Tasks & Forms, Jobs Batches & Events, History & Audit, Identity & Tenants, API Inspector, Authentication, Design System & Theming, …) are defined in [release.config.mjs](release.config.mjs) and grouped by scope. Add new scopes to the theme that best fits — `scripts/release/check-scope.mjs` validates the mapping.

Pre-1.0 posture: no compatibility guarantees between pre-1.0 releases. Breaking changes may land at any time. **1.0.0 is the first compatibility-stable release.** This is rendered as a banner on every release page.

---

## 10) Common tasks

### Add a new screen

Per PRD: three places in [src/app.jsx](src/app.jsx) historically (and the equivalent route file post-TanStack-Router-migration):

1. Add the route in the router config.
2. Update `VIEW_TITLE` (or its TanStack-Router equivalent).
3. Update `ENDPOINT_BY_VIEW` so the API Inspector chip rail picks up the screen's endpoint hints.

Follow the `useApi(fn, deps)` pattern. Render four states explicitly: loading skeleton → ErrorBox (verbatim engine message) → "No records." → data.

### Add a new Flowable REST endpoint

1. Add a wrapper in [src/api.js](src/api.js) (or `src/lib/api/` post-bootstrap) that goes through `request(method, path, opts)`.
2. Export it from the `api` object at the bottom of the file.
3. Add the endpoint to the Bruno collection under `bruno/` so contributors can call it manually.
4. Update [docs/compat.md](docs/compat.md) with the verification result against `flowable-rest:7.2.0`.

For DMN endpoints, pass `{ base: dmnBase() }` — DMN lives under `/flowable-rest/dmn-api`, not `/flowable-rest/service`.

### Bootstrap the GitHub repo (one-time)

When the repo is created:

```bash
bash scripts/bootstrap-gh/create-labels.sh    syalioune/flowatch
bash scripts/bootstrap-gh/create-milestones.sh syalioune/flowatch
bash scripts/bootstrap-gh/create-project.sh   syalioune flowatch "Flowatch Roadmap"
bash scripts/bootstrap-gh/protect-branches.sh syalioune/flowatch
```

These are idempotent — running them again upserts/patches existing items.

---

## 11) References

- [PRD](https://github.com/syalioune/flowatch-bmad/blob/main/_bmad-output/planning-artifacts/prd.md) — functional + non-functional requirements (private repo)
- [Architecture](docs/architecture.md) — request flow, theming, integration with Flowable
- [Compat matrix](docs/compat.md) — which Flowable REST endpoints work in 7.2.0
- [Bruno collection](bruno/) — runnable API requests
- [CLAUDE.md](CLAUDE.md) — AI-agent contract (also the canonical conventions doc for humans)
- [Bootstrap research](https://github.com/syalioune/flowatch-bmad/blob/main/_bmad-output/planning-artifacts/research/technical-bootstrap-decisions-research-2026-05-11.md) — the rationale behind every stack choice in this guide (private repo)
