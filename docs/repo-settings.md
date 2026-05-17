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
- **CodeQL** (SAST for JS/TS) — not currently configured. May land during a later milestone if value justifies the CI minutes.
- **Trivy** — wired in the `image` job of [`ci.yml`](../.github/workflows/ci.yml). Two-phase build/scan/push: amd64 is built to the local daemon and scanned via [`aquasecurity/trivy-action`](https://github.com/aquasecurity/trivy-action) before any push. Severity gate is `CRITICAL,HIGH` with `ignore-unfixed: true` — fixed CVEs at those severities fail the job and block the multi-arch push (no half-pushed manifests). SARIF is uploaded to the Security tab on every run (category `trivy-image`) so state is tracked across runs even when the gate passes. The published image lives at `ghcr.io/syalioune/flowatch` and `docker.io/syalioune/flowatch` with SBOM + SLSA provenance attestations from the same job. The **project-presentation page** is what ships to GitHub Pages (see [GitHub Pages](#github-pages) below) and is out of Trivy's scope. [`.trivyignore`](../.trivyignore) is the allowlist — policy is "should be empty; any entry needs a time-boxed justification and a tracked issue."

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
