# FND-MIR-002: Harden nginx CORS proxy (production-aware config)

> **User Story ID**: FND-MIR-002
> **Persona**: MIR
> **Epic**: 6 — Docker & Distribution Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As Mira, I want the nginx CORS config to work in both local dev (allow `http://localhost:5173`) and production (allow the configured `flowatch.dev` origin), so that the same Docker image works in both contexts.

**Acceptance Criteria:**

**Given** `docker/nginx.conf` currently allows `http://localhost:5173`
**When** the config is parameterized via env var `ALLOWED_ORIGIN` (defaulting to `http://localhost:5173`) and rebuilt to use `envsubst`
**Then** running `docker compose up` with `ALLOWED_ORIGIN=https://syalioune.github.io` produces an nginx that allows that origin
**And** the default unchanged behavior works for local dev
**And** the OPTIONS preflight short-circuit (204) is preserved.
