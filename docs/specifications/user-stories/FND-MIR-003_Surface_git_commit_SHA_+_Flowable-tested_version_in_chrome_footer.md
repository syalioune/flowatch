# FND-MIR-003: Surface git commit SHA + Flowable-tested version in chrome footer

> **User Story ID**: FND-MIR-003
> **Persona**: MIR
> **Epic**: 6 — Docker & Distribution Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.5)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As Mira (debugging a deployed Flowatch instance), I want the sidebar footer to show the git commit SHA the build was cut from plus the Flowable version Flowatch was tested against, so that I can correlate observed behavior to a specific build without inspecting bundle bytes. Per NFR-20.

**Acceptance Criteria:**

**Given** Vite builds the bundle and `define.__BUILD_SHA__` is injected at build time from `git rev-parse --short HEAD`
**When** the chrome footer (next to the `.conn-pill`) renders a small `<span class="build-info">` showing `build {sha} · tested vs Flowable {compat.testedVersion}`
**Then** dev builds show `build dev · tested vs Flowable 7.2.0` (no real SHA outside of CI)
**And** CI builds embed the actual short SHA
**And** the Flowable-tested version is sourced from a single constant emitted alongside the badge generator in Story 6.4 (no duplicate hard-coded literal)
**And** the footer text is selectable (for copy-paste into bug reports).

---
