# Repository Settings (Flowatch)

## Visibility
- Public from Day 1.

## License
- **Apache-2.0** — see [`/LICENSE`](../LICENSE).

## Branch model
Flowatch uses **two long-lived branches** plus stabilisation branches (see [DEVELOPERS.md §3](../DEVELOPERS.md#3-branching-model)):

- **`main`** — default branch, release-only. Receives merges from `release/*`. Each merge produces a stable `vX.Y.Z` tag via semantic-release.
- **`develop`** — long-lived integration branch. All feature/fix/chore branches PR into `develop`. Each merge produces a `vX.Y.Z-beta.N` pre-release.
- **`release/X.Y[.Z]`** — branched off `develop`, PR'd into `main`. Each merge emits `vX.Y.Z-rc.N` regression candidates.
- **Working branches:** `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `hotfix/<issue-id>`.

```
feat/foo  ─┐
fix/bar   ─┼─►  develop  ──►  release/0.0.2  ──►  main  ──►  tag v0.0.2
chore/baz ─┘   (beta.N)        (rc.N)               (stable)
```

## Branch protection
Both `main` and `develop` are protected via [`scripts/bootstrap-gh/protect-branches.sh`](../scripts/bootstrap-gh/protect-branches.sh):

- PRs required (≥1 approving review, dismiss stale reviews on push)
- CODEOWNERS-required code-owner reviews
- Required status checks (strict): `CI / check`, `CI / unit`, `CI / e2e`, `CI / build` — context list in [`.github/protection/required_checks.json`](../.github/protection/required_checks.json)
- Signed commits required
- Linear history required
- Force-push and branch deletion disallowed
- Admin enforcement on

```bash
./scripts/bootstrap-gh/protect-branches.sh <owner/repo> [main_approvals] [develop_approvals]
```

## Release policy
- Releases are tagged on `main` as `vX.Y.Z` by semantic-release.
- Release notes are auto-generated from Conventional Commits via the `conventionalcommits` preset configured in [`release.config.mjs`](../release.config.mjs) — no hand-written CHANGELOG entries needed.
- Channels:
  - `main` → stable `vX.Y.Z`
  - `develop` → `vX.Y.Z-beta.N`
  - `release/*` → `vX.Y.Z-rc.N`
- **Pre-1.0 posture:** no compatibility guarantees between pre-1.0 releases — see the `PRE_1_0_BANNER` in [`release.config.mjs`](../release.config.mjs).

## Milestones
Roadmap per [`_bmad-output/planning-artifacts/epics.md`](../_bmad-output/planning-artifacts/epics.md):

- **`0.0.1`** — Tech foundation (bootstrap)
- **`0.0.2`** — v1 MVP (parity rebuild)
- **`0.0.3`** — 6.x parity gaps
- **`1.0.0`** — GA / operator polish

Bootstrap on GitHub:

```bash
./scripts/bootstrap-gh/create-milestones.sh <owner/repo>
```

Definitions in [`scripts/bootstrap-gh/milestones.json`](../scripts/bootstrap-gh/milestones.json).

## Labels
Full taxonomy in [`scripts/bootstrap-gh/labels.json`](../scripts/bootstrap-gh/labels.json): `state:*`, `type:*`, `priority:*`, `area:*`, `size:*`, `risk:*`, `ref:*`, `release:*`, `scope:*`. Auto-labelling on PRs is path-driven via [`.github/labeler.yml`](../.github/labeler.yml).

```bash
./scripts/bootstrap-gh/create-labels.sh <owner/repo>
```

## Project board
- Type: **GitHub Projects v2** (owner scope)
- Default title: **Flowatch Roadmap**
- Custom single-select fields created by the bootstrap: `State` (Backlog / Ready / Ongoing / Review / Blocked / Done), `Priority` (critical / high / medium / low), `Effort` (XS–XXL), `Risk` (Low / Medium / High), `Release` (`0.0.1` / `0.0.2` / `0.0.3` / `1.0.0`).

```bash
./scripts/bootstrap-gh/create-project.sh <owner> <repo> "Flowatch Roadmap"
```

### First-time setup
1. Run the bootstrap script — it creates the project + fields and writes [`.github/project/ids.json`](../.github/project/ids.json).
2. Commit `.github/project/ids.json`.
3. Ensure GitHub Actions are enabled for the repo.

## Conventional Commits & automated releases
- **Commit style:** [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/), enforced locally by [commitlint](../commitlint.config.cjs) via the [`.husky/commit-msg`](../.husky/commit-msg) hook.
- **Other Husky hooks:** [`pre-commit`](../.husky/pre-commit) (Biome on staged files — TBD post-bootstrap), [`pre-push`](../.husky/pre-push) (tests).
- **Release engine:** semantic-release — see [`release.config.mjs`](../release.config.mjs).

### First-time setup
```bash
npm ci
npm run prepare      # installs Husky hooks
```

## Linting & formatting
- **Single tool:** [Biome v2](https://biomejs.dev/) — both lint and format (per ADR-007). Configured in `biome.json` (lands during milestone 0.0.1, epic 1).
- **TypeScript:** strict mode (per ADR-001), `tsc --noEmit` enforced by CI (lands during milestone 0.0.1, epic 1).
- The repo has **no separate ESLint/Prettier** and **no backend toolchain** — Flowatch is a single-package React + Vite SPA at the repo root with no Java/Maven/Spotless layer.

### CI enforcement
The four required status checks (`check`, `unit`, `e2e`, `build`) are wired in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) as placeholder jobs that ship real implementations across milestone 0.0.1 epics. The job IDs are load-bearing for branch protection — never rename them without updating [`.github/protection/required_checks.json`](../.github/protection/required_checks.json).

### Enforce pinned GitHub Actions (UI)
Repo → Settings → Actions → General → Workflow policy → **Require actions to be pinned to a full-length commit SHA** → Save.

All actions in [`.github/workflows/`](../.github/workflows/) are SHA-pinned per NFR-26 with a trailing `# vX.Y.Z` version comment. Dependabot's `github-actions` ecosystem bumps the SHAs weekly and keeps the comments in sync — never strip those comments.

## Security scanning

### GitHub Secret Scanning (repo setting)
Enable via Repo → Settings → Code security and analysis → **Secret scanning** → Enable.
GitHub scans pushed commits for known secret patterns (API keys, tokens, credentials) and alerts admins.

### Gitleaks (config only)
Configuration lives in [`.gitleaks.toml`](../.gitleaks.toml) (path allowlist for `.env.example`, fixtures, etc.). The CI workflow that consumes it is **not yet wired** — track on a milestone 0.0.1 follow-up.

### Dependabot
[`.github/dependabot.yml`](../.github/dependabot.yml) monitors **two ecosystems** (Flowatch is a single npm package at the repo root with no backend container):

- **`github-actions`** (root) — weekly SHA bumps; commit prefix `ci(deps)`; labels `type:chore`, `area:ci-cd`. Targets `develop`.
- **`npm`** (root) — weekly bumps; commit prefix `chore(deps)`; labels `type:chore`, `area:tooling`. Targets `develop`. Grouped:
  - **`bpmn-io`** — `bpmn-js*`, `dmn-js*`, `@bpmn-io/*` (tightly coupled toolkit).
  - **`test-toolchain`** — `vitest`, `@vitest/*`, `playwright`, `@playwright/*`, `@testing-library/*`.
  - **`lint-format`** — `@biomejs/*`, `biome`.

Dependabot security alerts are enabled at the repository level for automatic vulnerability notifications.

### Dependency update policy
- **SLA:** Dependabot PRs reviewed within 5 business days.
- **Security patches:** PRs fixing CRITICAL/HIGH CVEs prioritised and merged within 2 business days.
- **Major version bumps:** require manual review and testing before merge.
- **Auto-merge:** not enabled — all dependency PRs require human review.

### CodeQL & Trivy
- **CodeQL** (SAST for JS/JSX) — wired in [`codeql.yml`](../.github/workflows/codeql.yml). Runs on push/PR to `main` + `develop`, on a weekly cron (Mon 06:17 UTC), and on `workflow_dispatch`. Language matrix is `javascript-typescript` (the combined pack — one entry covers `.js`, `.jsx`, and any future `.ts`/`.tsx`). Query suite is `security-extended` — richer than GitHub's default suite; Flowatch's source surface is small enough to triage the extra findings. Findings land in the Security tab → Code scanning alerts (category `/language:javascript-typescript`).
  - **Severity gate (2026-05-17):** the workflow includes a post-analyze step (`Gate on alerts ≥ medium severity`) that polls the Code Scanning API for the current ref and fails the job if any open alert has `security_severity_level >= medium`. Threshold matches the cleanup bar of the 2026-05-17 quality-gates tightening. To adjust, edit both the workflow step AND this paragraph in lockstep.
  - **Required check (2026-05-17):** `Analyze (javascript-typescript)` is in [`required_checks.json`](../.github/protection/required_checks.json). The bake-in window concluded with the same 2026-05-17 PR; the workflow failing now blocks merges to `main` and `develop`.
  - Reproduce locally with `make codeql` (uses the [`gh codeql`](https://github.com/github/gh-codeql) CLI extension; writes `codeql.sarif` at the repo root — both the DB dir and the sarif file are gitignored).
- **Trivy** — wired in the `image` job of [`ci.yml`](../.github/workflows/ci.yml). Two-phase build/scan/push: amd64 is built to the local daemon and scanned via [`aquasecurity/trivy-action`](https://github.com/aquasecurity/trivy-action) before any push. Severity gate is `CRITICAL,HIGH` with `ignore-unfixed: true` — fixed CVEs at those severities fail the job and block the multi-arch push (no half-pushed manifests). SARIF is uploaded to the Security tab on every run (category `trivy-image`) so state is tracked across runs even when the gate passes. The published image lives at `ghcr.io/syalioune/flowatch` and `docker.io/syalioune/flowatch` with SBOM + SLSA provenance attestations from the same job. The **project-presentation page** is what ships to GitHub Pages (see [GitHub Pages](#github-pages) below) and is out of Trivy's scope. [`.trivyignore`](../.trivyignore) is the allowlist — policy is "should be empty; any entry needs a time-boxed justification and a tracked issue."

### Code coverage
Vitest collects coverage via `@vitest/coverage-v8`. The `unit` job in [`ci.yml`](../.github/workflows/ci.yml) runs `npm run test:all -- --coverage`; threshold violations fail the job (which is already a required check). Local reproduction: `npm run test:coverage`.

- **Curated include set** ([`vitest.config.ts`](../vitest.config.ts) `coverage.include`): `src/api.ts`, `src/lib/**/*.{ts,tsx}`. The set is deliberately narrow — the rule is *"files with real runtime logic worth covering"*. Routing (`src/routes/**`, `src/app.tsx`, the generated route tree, `src/main.tsx`), ambient/static data (`src/lib/window-events.ts`, `src/data.ts`, `src/vite-env.d.ts`), and big screens pending a separate test push (`src/screens.tsx`, `src/modeler.tsx`, `src/components.tsx`, `src/tweaks-panel.tsx`, `src/components/*Detail.tsx`) are excluded.
- **Threshold:** `lines: 60`, `branches: 60`, `perFile: true`. The per-file mode means a single weakly-covered file fails the gate — aggregate-only would let strong files mask weak ones.
- **Higher per-file bar:** `src/api.ts` keeps its existing `lines/statements/functions: 70` threshold — the most-tested file in the repo, raising the floor for it would silently regress signal.
- **Reports:** v8 emits text + HTML + lcov to `coverage/`; CI uploads the directory as a `coverage-<run-id>` artifact (14-day retention).
- **Broadening:** to bring in additional logic-bearing files, add them to `coverage.include`. The 60% bar is the floor — files already above it (e.g. `src/api.ts` at 96% / 91%) shouldn't see numbers regress.

### Mutation testing
Stryker runs mutation tests against `src/api.ts` via [`stryker.config.mjs`](../stryker.config.mjs) and [`.github/workflows/mutate.yml`](../.github/workflows/mutate.yml). Local reproduction: `make mutate`.

- **Scope:** `src/api.ts` only. Mutation testing on a low-coverage file produces a noisy score that's just the line-coverage gap rebranded — concentrating on the file with strong line coverage gives a meaningful first-run mutation score that says whether those numbers reflect real fault-detection or just exercise.
- **Threshold gating:** **none, by policy.** The workflow reports the score and uploads `reports/mutation/` as an artifact (14-day retention), but does NOT fail the build below any cut-off. A threshold lands once we have a baseline to anchor on.
- **Required check:** **no.** The `Stryker (src/api.ts)` job is intentionally absent from [`required_checks.json`](../.github/protection/required_checks.json). Promote it once threshold + broader scope are decided.
- **Triggers:** PR to `main`/`develop` + `workflow_dispatch`. Not on push (the per-PR signal is what reviewers compare; weekly cron is not needed yet).

## GitHub Pages
Flowatch publishes a **project-presentation page** at `https://syalioune.github.io/flowatch/` from the [`landing/`](../landing/) source. This is **not** a live app demo — it's a one-page pitch for prospective users (PRD FR-F12), deployed on every push to **`develop`** that touches `landing/**` or `branding/**` (PRD FR-F13). The deploy branch is `develop` (not `main`) because `develop` is the long-lived default branch where work lands first; `main` only receives release-only merges, which would mean the Pages site updates only at GA tags.

- **Source:** [`landing/index.html`](../landing/index.html) + [`landing/style.css`](../landing/style.css)
- **Workflow:** [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)
- **PR-time gate:** `landing-check` job (asserts zero external `https://` asset references per NFR-9). Path-filtered to `landing/**` — intentionally **NOT** in [`required_checks.json`](../.github/protection/required_checks.json) (making a path-filtered job required would block PRs that don't touch `landing/`).

### First-time setup (one-time UI step)
Repo → Settings → Pages → **Source: GitHub Actions** → Save.

### Local preview
```bash
make landing-preview    # stages _site/ from landing/ + branding/ then serves http://localhost:4173
make landing-check      # NFR-9 enforcement — same regex the CI gate runs
```

### Constraints (binding per FR-F12 + NFR-9 + NFR-26 + NFR-28)
- No CDN-loaded fonts, scripts, or stylesheets. IBM Plex woff2 served from [`branding/fonts/`](../branding/fonts/), copied into `_site/fonts/` at stage time.
- All actions in [`pages.yml`](../.github/workflows/pages.yml) are SHA-pinned with `# vX.Y.Z` version comments. Dependabot's `github-actions` ecosystem (see [`dependabot.yml`](../.github/dependabot.yml)) bumps them on the weekly schedule.
- Apache 2.0 SPDX header on every source file (`landing/index.html`, `landing/style.css`).

## Social preview (Story 33.3)

The repo's social-preview card (what renders when `github.com/syalioune/flowatch` is shared on Twitter/X, LinkedIn, Slack) is **uploaded manually** — git/the REST API cannot set it.

- **Upload:** Settings → General → Social preview → upload [`branding/social-preview.png`](../branding/social-preview.png) (1280×640, < 1 MB). **Re-upload after any repo re-creation or settings reset** (the setting does not survive those).
- **Source of truth:** [`branding/social-preview.svg`](../branding/social-preview.svg) (1280×640, editorial-light tokens, inline copy of [`branding/flowatch-lockup.svg`](../branding/flowatch-lockup.svg) + landing-page tagline). Edit the SVG, then re-export the PNG.
- **Re-export the PNG:** `rsvg-convert -w 1280 -h 640 branding/social-preview.svg -o branding/social-preview.png` (or `inkscape --export-type=png -w 1280 -h 640 branding/social-preview.svg`). Either needs IBM Plex Sans/Serif installed locally to match the committed PNG's typography; the woff2 faces live in [`branding/fonts/`](../branding/fonts/). The committed PNG was produced via headless Chromium (Playwright) with those faces loaded from `branding/fonts/`. Confirm the export is exactly 1280×640 and < 1 MB.
- **Verify (manual, post-upload):** paste the repo URL into Twitter/X, LinkedIn, Slack (or a card validator) — the lockup + tagline should be legible at feed-thumbnail size. Platform caches may need a cache-bust.
