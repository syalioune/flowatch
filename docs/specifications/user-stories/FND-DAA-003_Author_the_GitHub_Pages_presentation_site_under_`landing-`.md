# FND-DAA-003: Author the GitHub Pages presentation site under `landing/`

> **User Story ID**: FND-DAA-003
> **Persona**: DAA
> **Epic**: 6 — Distribution & Discovery Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.6)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As Daan (evaluator who landed on a forum link), I want a one-page project presentation at `https://syalioune.github.io/flowatch/`, so that I can decide in under a minute whether Flowatch is worth my afternoon — without reading a README written half for contributors. Per FR-F12.

**Acceptance Criteria:**

**Given** PRD FR-F12 and the branding assets in `branding/` (lockup, favicon, IBM Plex fonts)
**When** `landing/` is populated with `index.html`, `style.css`, `.nojekyll`, and `README.md` documenting the folder, and `index.html` includes the following sections in order
  1. Hero — lockup, one-sentence positioning, primary CTA (`docker pull` command), secondary CTA (GitHub repo link). Pre-alpha banner visible above the fold.
  2. Why Flowatch exists (≤ 4 sentences condensing README §"Why Flowatch exists")
  3. What you get — three tiles: Modeler (BPMN + DMN) · Admin (deployments, instances, jobs, history) · Identity & Tenants. *Not* a per-screen feature inventory.
  4. What makes it different — three bullets: API Inspector · three-look design system · Flowable-aware (REST quirks, multipart, DMN sub-app prefix)
  5. Get started — Docker quickstart, same commands as README's "Pull the image" section (text-first in 0.0.1; screenshots back-filled later when DOC-DAA-001 lands in 1.0.0)
  6. OSS promises — four single-sentence bullets: Apache 2.0 · no telemetry · no SaaS lock-in · no enterprise-only gating
  7. Project status — pre-alpha framing, link to latest release on GitHub, link to `docs/compat.md`, link to issue tracker
  8. Footer — GitHub repo link, docs index link, license link, the line "Not affiliated with Flowable.com Ltd."
**Then** the page renders correctly in latest Chromium, Firefox, Safari (NFR-13)
**And** it scores ≥ 95 on Lighthouse Performance, Accessibility, Best Practices, SEO
**And** there are zero `https://` external references in `<script src>`, asset-loading `<link href>` (rel = `stylesheet | preload | prefetch | modulepreload | icon | manifest | dns-prefetch | preconnect`), `@font-face src`, or `@import` declarations — navigation/canonical `href`s are allowed and unaffected (NFR-9 enforcement via `make landing-check`)
**And** all visual tokens resolve to the same OKLCH values as `:root[data-look="editorial"][data-theme="light"][data-density="regular"]` in `src/styles.css` (typography, accent, spacing, line-heights)
**And** the page contains no SaaS clichés (no gradient cards, no glass-morphism, no animated illustrations, no email capture, no chat widget, no testimonial blocks, no social-proof logo strip, no "request a demo")
**And** the pre-alpha banner is visible without scrolling on a 1440×900 viewport
**And** `landing/index.html` and `landing/style.css` include `<!-- SPDX-License-Identifier: Apache-2.0 -->` per FR-F7 / NFR-28
**And** the page is previewable locally via `make landing-preview` (Makefile target documented in [docs/repo-settings.md](../../docs/repo-settings.md)).

**Notes:**
- Screenshot strip is deliberately deferred to a follow-up story in 0.0.2 or 1.0.0 once DOC-DAA-001 produces look × theme × density screenshots of the rebuilt app. Inlining pre-rebuild screenshots would set the wrong expectation for visitors who then install the current build.
