# FND-SYS-006: Wire semantic-release for automated release notes

> **User Story ID**: FND-SYS-006
> **Persona**: SYS
> **Epic**: 5 — Release Pipeline Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 5.2)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As a maintainer, I want semantic-release to compute the version bump, generate the CHANGELOG entry, tag the commit, and publish a GitHub Release directly from the Conventional Commits range on each push to a release branch, so that I never hand-write a CHANGELOG. Per NFR-25.

**Acceptance Criteria:**

**Given** `semantic-release` is installed (per `package.json` devDependencies) and `release.config.mjs` is configured with Flowatch themes + the `release\/(\d+)\.(\d+)(?:\.(\d+))?` branch matcher (existing)
**When** `.github/workflows/release.yml` is added running `npx semantic-release` against `release/*` and `main` branches, with `GITHUB_TOKEN` granted `contents: write` + `issues: write` + `pull-requests: write` permissions, all action SHAs pinned per NFR-26
**Then** squash-merging `release/0.0.1 → main` triggers the workflow, which computes `v0.0.1` from the aggregated `feat:` commits, generates a CHANGELOG.md entry, creates the `v0.0.1` git tag, and publishes a GitHub Release with auto-generated notes
**And** the release notes use the theme structure from `release.config.mjs` (Modelers, Runtime, etc.)
**And** subsequent `release/x.y.z → main` merges follow the same flow without manual intervention.
