# INS-SAS-001: API_LOG ring buffer + window event bus

> **User Story ID**: INS-SAS-001
> **Persona**: SAS
> **Epic**: 8 — API Inspector — observability differentiator
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 8.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:ins, release:0.0.2


As Sasha, I want every Flowable REST call captured in an in-memory log so that I can inspect the REST traffic Flowatch generates. Per FR-6, FR-7, Pattern P-001.

**Acceptance Criteria:**

**Given** the `request()` funnel in `src/api/client.ts` (Pattern P-001)
**When** any API call is made
**Then** an entry `{ id, method, path, status, ms, at, error?, body? }` is unshifted into `API_LOG` (capped at 60)
**And** `window.dispatchEvent(new CustomEvent('api:log', { detail: entry }))` fires synchronously
**And** the entry's `Authorization` header is redacted in the log (per NFR-8).
