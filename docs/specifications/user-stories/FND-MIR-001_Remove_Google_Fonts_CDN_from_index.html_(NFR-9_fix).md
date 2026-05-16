# FND-MIR-001: Remove Google Fonts CDN from index.html (NFR-9 fix)

> **User Story ID**: FND-MIR-001
> **Persona**: MIR
> **Epic**: 6 — Docker & Distribution Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.2)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As an air-gapped operator, I want Flowatch to load IBM Plex fonts from the project bundle rather than `fonts.googleapis.com`, so that I can run it without external network. Per NFR-9.

**Acceptance Criteria:**

**Given** `index.html` currently has `<link rel="preconnect" href="https://fonts.googleapis.com">` and a Google Fonts stylesheet link
**When** the IBM Plex font files (woff2) are self-hosted under `branding/fonts/` and `src/styles/fonts.css` declares `@font-face` rules pointing at them, and the Google Fonts links are removed from `index.html`
**Then** `npm run dev` shows the correct fonts (IBM Plex Sans, Mono, Serif) across all three looks
**And** browser DevTools Network tab shows zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`
**And** the build output size increase is < 500 KB (woff2 fonts).
