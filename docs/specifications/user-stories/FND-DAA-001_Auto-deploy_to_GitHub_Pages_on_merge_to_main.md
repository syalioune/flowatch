# FND-DAA-001: Auto-deploy to GitHub Pages on merge to main

> **User Story ID**: FND-DAA-001
> **Persona**: DAA
> **Epic**: 4 — CI/CD Foundation (GitHub Actions)
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 4.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As Daan, I want the latest `main` to be served at the Flowatch GitHub Pages URL, so that I can evaluate the live app without cloning. Per NFR-32.

**Acceptance Criteria:**

**Given** the `build` job uploads `dist/` (Story 4.3)
**When** `.github/workflows/pages.yml` runs on `push` to `main`, downloads the `dist/` artifact, and deploys to GitHub Pages via `actions/deploy-pages@<pinned-sha>`
**Then** merging to `main` produces a fresh public deployment at `https://syalioune.github.io/flowatch` within 5 minutes
**And** the deploy URL is added as a badge in README.md
**And** Pages deployment is configured for the `gh-pages` branch with `Source: GitHub Actions`.
