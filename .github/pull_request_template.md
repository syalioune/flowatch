# 🚀 Pull Request

## 📌 Summary

- **Purpose:** What does this PR change and why?
- **Linked issue(s):** Closes #<issue>

---

## 🎯 Acceptance Criteria

> If this PR resolves a user story, paste the AC list (AC1, AC2, …) and note how each is validated (test or manual).

- AC1 ✅/❌ : … → Done/Cancelled because…

---

## 🔗 Traceability to specs

- **FR**: (updated/confirmed unaffected) → FR-…
- **NFR**: (security, performance, observability, a11y) → NFR-…
- **ADR**: referenced/updated → ADR-… (status: proposed/accepted)
- **Compat**: any change to `docs/compat.md` (Flowable REST endpoint support)?
- **API contract**: Flowable endpoints added/changed? Update Bruno collection under `bruno/`.

---

## 🧩 Scope of change

- [ ] Source under `src/`
- [ ] Modeler (`bpmn-js` / `dmn-js`) integration
- [ ] API client (`src/api*` — the single REST funnel)
- [ ] API Inspector
- [ ] Design system (CSS variables, `data-look/theme/density`)
- [ ] Routing / TanStack Router
- [ ] Auth strategy (Basic / Bearer / OIDC)
- [ ] Documentation (`docs/`, `_bmad-output/`)
- [ ] Tooling (Biome, Vitest, Playwright, CI workflows)
- [ ] Docker stack (`docker-compose.yml`, `docker/`)
- [ ] Branding (`branding/`, in-app `Mark`)

---

## 🧪 Tests & evidence

- [ ] **Unit (Vitest):**
- [ ] **Component (Vitest browser mode):**
- [ ] **E2E (Playwright vs. live `flowable-rest:7.x`):** scenarios covered + results
- [ ] **Coverage:** % (meets threshold? Y/N)
- [ ] **Manual verification:**
  1. …

> Attach CI job links or artifacts.

---

## 🔐 Security & supply chain

- [ ] No secrets logged to API_LOG (Authorization header redacted)
- [ ] No new network endpoints called from the browser other than the configured Flowable engine (per NFR-9)
- [ ] No new CDN-loaded assets (fonts, scripts) — air-gap rule
- [ ] GitHub Actions in workflows are SHA-pinned (per NFR-26)
- [ ] Dependency scans green

---

## ♿ UX & accessibility (if UI changes)

- [ ] Renders four states explicitly (loading / error / empty / data) on every screen touched
- [ ] Error box surfaces the verbatim Flowable response — no friendly rewrites
- [ ] Keyboard navigation works; focus ring visible
- [ ] WCAG AA contrast verified for all 8 look × theme combinations touched
- [ ] Works in all three densities (compact / regular / comfy)
- [ ] No regressions in the API Inspector

---

## 🌐 Flowable engine compatibility (if API or contract changes)

- [ ] Endpoint(s) validated against `flowable-rest:7.2.0` (current target)
- [ ] `docs/compat.md` updated if endpoint support changed
- [ ] Bruno collection updated for any new endpoint
- [ ] No reliance on Flowable Enterprise-only endpoints
