# DOC-SYS-002: GitHub Pages deploy workflow

> **User Story ID**: DOC-SYS-002
> **Persona**: SYS (CI / system)
> **Epic**: 6 — Distribution & Discovery Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (Story 6.7); derived from sprint-change-proposal-2026-05-17
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:ci-cd, release:0.0.1, scope:foundational

As CI, I want a workflow that builds and publishes the landing site to GitHub Pages on every push to `develop` touching `landing/**` or `branding/**`, so that the live page tracks repo state without manual deploy steps. Per PRD FR-F13. (`develop` is chosen over `main` because `develop` is the long-lived default branch; `main` receives release-only merges and would update the Pages site only at GA tags.)

**Acceptance Criteria:**

**Given** PRD FR-F13 and DOC-DAA-003 producing `landing/index.html` + `landing/style.css`
**When** `.github/workflows/pages.yml` is added with two jobs:
  - `landing-check` — runs on PRs to `develop` paths-filtered to `landing/**`, validates the absence of external `https://` asset references (matches the `make landing-check` regex). **NOT** added to `.github/protection/required_checks.json` (path-filtered — making it required would block PRs that don't touch `landing/`).
  - `pages-deploy` — runs on push to `develop` paths-filtered to `landing/**` or `branding/**`, builds `_site/` via `make landing-stage` (which copies `landing/*.html`, `landing/*.css`, `branding/flowatch-lockup.svg`, `branding/flowatch-favicon.svg` → `favicon.svg`, and the IBM Plex woff2 family into `_site/fonts/`), and ships via SHA-pinned `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages` (each with a trailing `# vX.Y.Z` version comment per NFR-26 — never strip those). The job condition gates on `github.ref == 'refs/heads/develop'` so accidental `workflow_dispatch` re-runs from feature branches do not deploy. The workflow has `permissions:` scoped to `contents: read`, `pages: write`, `id-token: write` (least-privilege OIDC for GitHub Pages).
**Then** Dependabot's `github-actions` ecosystem (see [`.github/dependabot.yml`](../../../.github/dependabot.yml)) picks up the new actions for weekly SHA bumps
**And** Repo → Settings → Pages → Source = "GitHub Actions" is set (one-time manual step documented in the "GitHub Pages" subsection of [`docs/repo-settings.md`](../../repo-settings.md))
**And** the workflow does NOT appear in [`.github/protection/required_checks.json`](../../../.github/protection/required_checks.json) (it is a post-merge deploy, not a merge gate)
**And** a smoke verification confirms the live page renders at `https://syalioune.github.io/flowatch/` and serves `/`, `/style.css`, `/favicon.svg`, `/flowatch-lockup.svg`, and `/fonts/ibm-plex-*.woff2` with HTTP 200.

**Notes:**
- Pairs with DOC-DAA-003 (page authoring). Both can land in the same PR or sequenced PRs.
- The `landing-check` job is also runnable locally via `make landing-check`; the CI job is the same regex set.
- Concurrency group `pages` with `cancel-in-progress: false` prevents stomping on in-flight deployments.
