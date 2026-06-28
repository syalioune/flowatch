# FND-SYS-010: Deploy `landing/` to GitHub Pages via SHA-pinned workflow

> **User Story ID**: FND-SYS-010
> **Persona**: SYS
> **Epic**: 6 — Distribution & Discovery Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.7)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As CI, I want a workflow that builds and publishes the landing site to GitHub Pages on every push to `develop` touching `landing/**` or `branding/**`, so that the live page tracks repo state without manual deploy steps. Per FR-F13. (`develop` is the long-lived default branch; deploying from `main` would mean the site updates only at GA tags.)

**Acceptance Criteria:**

**Given** PRD FR-F13 and Story 6.6 producing `landing/index.html` + `landing/style.css`
**When** `.github/workflows/pages.yml` is added with two jobs:
  - `landing-check` — runs on PRs to `develop` paths-filtered to `landing/**`, validates the absence of external `https://` asset references (matches the `make landing-check` regex). **NOT** added to `.github/protection/required_checks.json` (path-filtered).
  - `pages-deploy` — runs on push to `develop` paths-filtered to `landing/**` or `branding/**`, builds `_site/` via `make landing-stage` (which copies `landing/*.html`, `landing/*.css`, `branding/flowatch-lockup.svg`, `branding/flowatch-favicon.svg` → `favicon.svg`, and the IBM Plex woff2 family into `_site/fonts/`), and ships via SHA-pinned `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages` (each with a trailing `# vX.Y.Z` version comment per NFR-26 — never strip those). The job condition gates on `github.ref == 'refs/heads/develop'` to prevent accidental deploys from feature branches via `workflow_dispatch` re-runs. The workflow has `permissions:` scoped to `contents: read`, `pages: write`, `id-token: write` (least-privilege OIDC for GitHub Pages).
**Then** Dependabot's `github-actions` ecosystem (see `.github/dependabot.yml`) picks up the new actions for weekly SHA bumps
**And** Repo → Settings → Pages → Source = "GitHub Actions" is set (one-time manual step documented in a new "GitHub Pages" subsection of `docs/repo-settings.md`)
**And** the workflow does NOT appear in `.github/protection/required_checks.json` (it is a post-merge deploy, not a merge gate; the `landing-check` PR job is implicitly gating because PR review requires green CI per existing protection, but it is path-filtered).

---
