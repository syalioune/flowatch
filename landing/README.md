# `landing/` — Flowatch GitHub Pages presentation site

A **one-page static project presentation** deployed to
`https://syalioune.github.io/flowatch/` on every push to `develop` that touches
`landing/**` or `branding/**`. Defined by PRD **FR-F12** + **FR-F13** (milestone 0.0.1).
The deploy source is `develop` (not `main`) because `develop` is the long-lived
default branch where work lands first; `main` only receives release-only merges.

**README.md (repo root) is the source of truth** for project facts. This page is
a curated reflection targeted at prospective users — not contributors, not
operators-mid-task. Update cadence: only when README hero / positioning /
quickstart commands change.

## What lives here

| File | Purpose |
| --- | --- |
| `index.html` | The page itself (hand-authored, no SSG). |
| `style.css` | Editorial-light tokens lifted from `src/styles.css`. Self-contained. |
| `.nojekyll` | Tells GitHub Pages not to run Jekyll on the upload. |

## What does **not** live here

Branding assets (`flowatch-lockup.svg`, `flowatch-favicon.svg`, IBM Plex fonts)
stay canonical in `branding/`. They're copied into the deploy artefact at build
time by `make landing-stage` (and by the matching step in
`.github/workflows/pages.yml`).

## Preview locally

```bash
make landing-preview     # stages into _site/ and serves on http://localhost:4173
```

`_site/` is git-ignored — it's a transient build output, not source.

## Validate (matches the CI gate)

```bash
make landing-check       # fails on any external https:// asset reference
```

`landing-check` is what the PR-time job in `pages.yml` runs to enforce NFR-9
(no telemetry, no CDN-loaded fonts/scripts).

## Constraints (binding)

- **No CDN.** Every asset is local. No Google Fonts, no CDN-loaded analytics,
  no chat widgets, no testimonial blocks. NFR-9.
- **No SaaS clichés.** No gradient cards, no glass-morphism, no animated
  illustrations, no "request a demo", no email capture. UX-spec §1 carve-out.
- **Tokens mirror `src/styles.css`** (editorial / light / regular). When the
  app's editorial tokens move, copy the new OKLCH values into `style.css` by
  hand — there is no build coupling between the app and this page, by design.
- **Apache 2.0 SPDX header** on every source file. FR-F7, NFR-28.
- **Pre-alpha banner** visible above the fold. The page must not over-promise.
