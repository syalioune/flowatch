# FND-DAA-001: Verify one-command Docker stack reaches Dashboard in < 2 min

> **User Story ID**: FND-DAA-001
> **Persona**: DAA
> **Epic**: 6 — Distribution & Discovery Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.1)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As Daan, I want `docker compose up -d && npm run dev` to land me on a working Dashboard in under 2 minutes on a fresh machine, so that the evaluation friction is minimal.

**Acceptance Criteria:**

**Given** a clean machine with Docker + Node 18 installed
**When** the user runs `docker compose up -d && npm install && npm run dev` and opens `http://localhost:5173`
**Then** the Dashboard renders with the connection indicator green within 120 seconds (including Docker pull + Flowable warmup on a typical broadband connection)
**And** the `bash scripts/dev/run-dev.sh` script automates this in one command (Epic 6 has this already from Phase-2 work)
**And** README.md "Quick start" section documents this end-to-end.
