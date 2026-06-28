# HST-MIR-004: Inspector previewBody renders the truncation envelope explicitly

> **User Story ID**: HST-MIR-004
> **Persona**: MIR
> **Epic**: 13 — History (audit trail)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 13.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:hst, release:0.0.2


As Mira (operator inspecting API calls in the Inspector drawer), I want the body preview to render the `{__preview, __truncated}` envelope shape in an operator-readable form, so that I can immediately recognise when a body was truncated by the byte budget rather than mistaking the envelope itself for the request payload. Per Epic 10 retrospective A-3 (promoted from three-epic carry-forward chain on 2026-05-25).

**Acceptance Criteria:**

**Given** an `API_LOG` entry whose `body` field is the truncation envelope `{__preview: string, __truncated: number}` (produced by `captureBody` in [src/api.ts](src/api.ts) when the body exceeds `BODY_BYTE_BUDGET = 16 KB`)
**When** the operator expands the row in the Inspector drawer
**Then** the body preview renders as:

```
[body truncated: <__truncated> bytes total]
<__preview>...
```

rather than as `{__preview: "{...}", __truncated: 51234}` JSON
**And** non-envelope bodies continue to render as `JSON.stringify(d, null, 2)?.slice(0, 4000) ?? String(d)` (unchanged behaviour for the 99% case)
**And** the Inspector unit-test suite (`src/components/__tests__/ErrorBox.spec.tsx` or a sibling `ApiInspector.spec.tsx`) covers both rendering branches with explicit assertions on the envelope-detection path
**And** no change to `captureBody` is required — the envelope-detection lives at render time in [src/components.tsx](src/components.tsx)'s `previewBody` helper
**And** the change is scoped to ~10 LOC plus tests; do NOT widen scope to other Inspector polish items in the same PR (single-issue PR per Epic 12 retro §3.4 spirit).

**Dev Notes:**

- This story closes the Epic 10 retro A-3 carry-forward chain (Epic 10 → Epic 11 → Epic 12 → promoted 2026-05-25). The "opportunistic during Epic N" framing failed three times because no Epic N story touched `src/components.tsx`. Promoting to a dedicated story unblocks the work.
- The implementation outline lives in [_bmad-output/implementation-artifacts/epic-10-retro-2026-05-25.md §A-3](../implementation-artifacts/epic-10-retro-2026-05-25.md) — a ~10-LOC branch added to `previewBody`. The spec author can lift it verbatim.
- Surface this independently of Epic 13's History theme — it touches the Inspector drawer, not any History endpoint. Scheduling it in Epic 13 simply uses the window; it has no semantic dependency on 13.1 / 13.2 / 13.3.

---
