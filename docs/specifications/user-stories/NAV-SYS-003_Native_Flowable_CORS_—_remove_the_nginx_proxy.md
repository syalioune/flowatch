# NAV-SYS-003: Native Flowable CORS — remove the nginx proxy

> **User Story ID**: NAV-SYS-003
> **Persona**: SYS
> **Epic**: 34 — Flexible Engine Connection — Sub-app Prefixes + Native CORS
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 34.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:1.0.0


As a maintainer, I want the bundled stack to rely on Flowable's native CORS instead of an nginx sidecar, so that the deployment is simpler and operators pointing at their own engines have a documented native-CORS path. Per NFR-31.

**Acceptance Criteria:**

**Given** `docker compose up`
**When** the stack boots
**Then** `flowable` publishes `:8080` directly with `flowable.rest.app.cors.*` configured and the SPA reaches it cross-origin with the `Authorization` header (preflight returns `Access-Control-Allow-Headers: Authorization`)

**Given** the change lands
**Then** the nginx service, `docker/nginx.conf.template`, and `docker/40-validate-origin.sh` are removed; the `flowatch` profile `depends_on: flowable`; and `ALLOWED_ORIGIN` feeds the flowable service env

**Given** the COMPAT-BOUNDARY verification gate (load-bearing)
**Then** native CORS is live-verified against `flowable-rest:7.2.0` — exact Spring relaxed-binding env-var spelling resolved (`flowable.rest.app.cors.allowed-origins` → `FLOWABLE_REST_APP_CORS_ALLOWEDORIGINS`) and a real cross-origin `api.*` call with `Authorization` browser-proven to survive preflight — BEFORE nginx is deleted; if the image does not honor it, the story HALTS and reports

**And** README / Makefile (`engine-up` / `engine-health` / `engine-logs`) / `scripts/dev/run-dev.sh` / landing copy are updated; boot-to-working-dashboard stays < 2 min.

---

## v2+ Placeholder Epics (no stories — gated)
