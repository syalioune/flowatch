# Claude Code Token Usage — Flowatch Road to 1.0.0

_Period: 2026-05-19 → 2026-06-18 (31 calendar days, 27 active dev days)_  
_Scope: Stories 8.1 → 34.2 — from post-v0.0.1 baseline to v1.0.0 graduation_

> **Metrics gap — Epics 1–7 not captured.** Claude Code retains session logs for **30 days** by default (`cleanupPeriodDays`). By the time `ccusage` was run to extract these metrics, sessions covering the initial project scaffolding (Epics 1–7, roughly Stories 1.1 → 7.4) had already been purged. The $2,219.75 total and all per-day figures below represent only the **final push from v0.0.1 → v1.0.0**; the true project total is higher. Retention has since been extended to 365 days in `~/.claude/settings.json` so future full-project reports will be complete.
>
> **Projection for missing Epics 1–7.** Git history records 29 confirmed stories across Epics 1–6 (1.1–1.4 · 2.1–2.5 · 3.1–3.6 · 4.1–4.4 · 5.1–5.5 · 6.1–6.5) plus Epic 7 (~4–5 stories, not pattern-matched in commits). Estimated total: ~34 stories. Early sessions had far less context than Phase 1 (smaller CLAUDE.md, smaller codebase → lower cache volume), so per-story cost would have been lower — estimate **$12–18/story** vs. the $25–28 observed in Phase 1. **Projected gap: ~$400–600.** Full project API-equivalent cost estimate: **~$2,600–2,800**.
>
> **API-equivalent vs. Claude Code Max.** All figures in this document reflect **public API list prices** — what the same token volume would cost using the Anthropic API directly. Flowatch was developed under a **Claude Code Max subscription**, where usage is covered by a flat monthly fee rather than per-token billing. The API-equivalent figures are kept as a reference to understand the scale of computation involved; they do not represent the actual out-of-pocket cost.

---

## Summary

| Metric | Captured (May 19–Jun 18) | Projected full project |
|--------|--------------------------|------------------------|
| API-equivalent cost | $2,219.75 | **~$2,620–2,820** |
| Total tokens consumed | 3,109,433,517 | ~3.7–3.8 B (est.) |
| Cache read ratio | 97.96 % | ~97 % (est.) |
| Stories shipped | ~80 | **~114** |
| Epics closed | 27 (Epics 8–34) | 34 (Epics 1–34) |
| Active dev days | 27 (ccusage) / 35 calendar days (May 15–Jun 18) | **30** (git: 4 pre-period May 15–18 + 26 in-period) |
| Average cost / active day | $82.21 | — |
| Average cost / story | $27.75 | **~$23–25** (est.) |
| Releases cut | v0.0.2 · v0.0.3 · v0.0.4 · v1.0.0 | same |

The overwhelming driver of token volume is **prompt-cache reads** (3.05 billion of 3.11 billion captured tokens). Without caching, the effective cost would have been an order of magnitude higher. The raw "new" tokens entering the model on each turn (input + cache-create) total only 53.8 million — 1.73 % of the captured ledger.

---

## Token budget breakdown

| Token type | Count | % of total |
|------------|------:|----------:|
| Cache reads | 3,046,253,389 | 97.96 % |
| Cache creates | 53,008,132 | 1.71 % |
| Output | 9,417,641 | 0.30 % |
| Input | 754,355 | 0.024 % |
| **Total** | **3,109,433,517** | 100 % |

> Cache reads dominate because every turn re-sends the full CLAUDE.md + growing project context, but the prompt-cache layer serves it at a fraction of the cost of fresh input tokens. The 53 M cache-create tokens represent net new context committed to the cache across the month.

---

## Development phases

The captured period maps to four releases. Phase boundaries are drawn at the release-prep commits. Percentages below are of the **$2,219.75 captured total**; against the projected full-project figure (~$2,720 midpoint) they each run ~3 pp lower.

### Phase 0 — Initial scaffolding → v0.0.1 (pre-May 19, **projected ~$400–600** · ~18–22 % of full project)

**Epics 1–7.** Project bootstrap, Vite + React setup, basic routing, Flowable connection config, engine probe, ErrorBox, Dashboard, API Inspector foundation, deployments + definitions screens. Sessions purged by the 30-day default retention before metrics were extracted.

Stories in scope: 1.1–1.4 · 2.1–2.5 · 3.1–3.6 · 4.1–4.4 · 5.1–5.5 · 6.1–6.5 · 7.x (~34 stories)

Per-story cost estimated lower than Phase 1 ($12–18 vs $25–28) because the project context (CLAUDE.md, source tree, cache corpus) was small and growing — cache-read volume was a fraction of the mature-project baseline.

v0.0.1 shipped before the metrics window opens.

### Phase 1 — Core feature foundation → v0.0.2 (May 19–27, $1,209.90 · 55 % of captured)

**Epics 8–18.** The largest single investment: API Inspector enrichment, History canonical archetype, DMN screens, Modeler rewrite, Design system (3-look × 2-theme × 3-density), and the full A11y pass (keyboard nav, ARIA, visual baselines, keyboard cheatsheet).

Stories in scope: 8.1–8.4 · 9.1–9.6 · 10.1–10.4 · 11.1–11.5 · 12.1–12.4 · 13.1–13.4 · 14.1–14.4 · 15.1–15.4 · 16.1–16.4 · 17.1–17.5 · 18.1–18.4 (~48 stories)

The period peaks on May 25 ($349.47) and May 26 ($317.13) — both days saw 10+ stories committed including all of Epic 17 (design-system split) and the full DMN + Modeler epics (15, 16).

v0.0.2 shipped on **May 27**.

### Phase 2 — Runtime management + identity + connections → v0.0.3 (May 28–Jun 5, $640.72 · 29 % of captured)

**Epics 19–27.** Instance variable CRUD, process definition category edit, task property edit + attachments, full identity CRUD (users + groups + membership), saved-connections quick-switch, Batch + Event subscription screens, .bar deployment support, and the BPMN/DMN Save-as-new-version modeler feature.

Stories in scope: 19.1–19.2 · 20.1 · 21.1–21.3 · 22.1–22.3 · 23.1–23.2 · 24.1–24.2 · 25.1 · 26.1–26.2 · 27.1 (~17 stories)

Notable: May 31 committed 8 stories (21.1–21.3, 22.1–22.3, 23.1–23.2) in a single session at $164.43 — the highest story-per-dollar day of the project.

v0.0.3 shipped on **June 4**.

### Phase 3 — Auth strategies + modeler properties → v0.0.4 (Jun 7–8, $216.88 · 10 % of captured)

**Epics 28–31.** Pluggable `AuthStrategy` seam, Settings Auth tab, Bearer auth, full OIDC PKCE flow (4 stories built on a single day, Jun 7), form-js task form rendering (P-006 consumer 3), Flowable BPMN properties panel with moddle descriptor + lossless round-trip, and the version-drift advisory banner.

Stories in scope: 28.1–28.4 · 29.1 · 30.1–30.2 · 31.1 (8 stories)

Jun 7 was the highest-velocity day by story count: 7 distinct feat/fix stories committed at $174.63. The auth Epic 28 (Basic → Bearer → OIDC strategy chain) landed entirely in one session.

v0.0.4 entered beta on **June 8**.

### Phase 4 — Quality gate + launch assets → v1.0.0 (Jun 10–18, $152.23 · 7 % of captured)

**Epics 32–34.** Full axe-core WCAG 2.1 AA scan across 8 look × theme combinations × 11 screens, violation remediation + Playwright hard-gate, 1.0.0 launch assets (README screenshots, forum announcement, GitHub social card), 1.0.0 branding graduation, configurable per-sub-app URI prefixes (FR-59), and replacement of the nginx CORS sidecar with native Flowable CORS.

Stories in scope: 32.1–32.2 · 33.1–33.3 · 34.1–34.2 (7 stories)

Jun 14 was the graduation day: `feat(branding)!: graduate Flowatch to 1.0.0 GA line` committed alongside Stories 32.2 and 33.1–33.3 at $85.95.

v1.0.0 entered beta on **June 14**; `1.0.0-beta.5` is the latest tag as of the period close.

---

## Daily spend timeline

```
Date       Cost       Models                  Key work
────────────────────────────────────────────────────────────────────────────────────────
2026-05-19  $  17.98  haiku-4-5, opus-4-7     Sprint planning, early Story 8 scaffolding
2026-05-20  $  35.51  opus-4-7                Story 9 (deployments canonical archetype)
2026-05-21  $  13.23  opus-4-7                Story 10 (instances + modals)
2026-05-22  $  16.26  opus-4-7, sonnet-4-6    Stories 10–11 (instances + tasks)
2026-05-23  $  24.45  opus-4-7, sonnet-4-6    Stories 11–12 (tasks + jobs)
2026-05-24  $ 168.44  opus-4-7                Stories 8.1–8.4, 12 (API Inspector enrichment)
2026-05-25  $ 349.47  haiku-4-5, opus-4-7    ★ Epic 13 (History) + Epic 17 (Design system, 5 stories!)
2026-05-26  $ 317.13  haiku-4-5, opus-4-7    ★ Epics 14–16 (Identity, DMN, Modeler — 16 stories!)
2026-05-27  $ 267.43  haiku-4-5, opus-4-7     Stories 18.2–18.4 + Docker flowatch profile + v0.0.2 RC
2026-05-28  $  44.56  haiku-4-5, opus-4-7     Stories 19.1–19.2 (variable CRUD) ← v0.0.2 back-merge day
2026-05-29  —         —                       (no activity)
2026-05-30  $ 183.87  haiku-4-5, opus-4-7     Stories 20.1, 26.1–26.2 (definition edit + BPMN diagram)
2026-05-31  $ 164.43  opus-4-7                Stories 21.1–21.3, 22.1–22.3, 23.1–23.2 (8 stories)
2026-06-01  $ 121.86  haiku-4-5, opus-4-7     Stories 24.1–24.2, 25.1 (Batches, Events, BAR uploads)
2026-06-02  $  75.81  opus-4-7                Story 25.1 multi-commit refactor chain
2026-06-03  $  46.58  opus-4-7, opus-4-8      Story 27.1 (Save-as-new-version) + 25.1 api-pin tests
2026-06-04  $   3.02  opus-4-8                v0.0.3 release-prep headline
2026-06-05  $   0.59  opus-4-8                Minor CI fix
2026-06-06  —         —                       (no activity)
2026-06-07  $ 174.63  haiku-4-5, opus-4-8    ★ Epics 28 (OIDC, 4 stories) + 29 (form-js) + 30 (moddle)
2026-06-08  $  42.25  opus-4-8                Story 31.1 (version-drift banner)
2026-06-09  —         —                       (no activity)
2026-06-10  $   7.84  fable-5, opus-4-8       Minor review + CI
2026-06-11  $   0.63  fable-5                 Trivial follow-up
2026-06-12  —         —                       (no activity)
2026-06-13  $   9.76  opus-4-8                Story 32.1 (axe-core matrix test suite)
2026-06-14  $  85.95  opus-4-8               ★ Stories 32.2, 33.1–33.3 + 1.0.0 graduation
2026-06-15  $  17.13  haiku-4-5, opus-4-8     Story 33.1 screenshot follow-up
2026-06-16  $  13.13  sonnet-4-6              Story 34.1 (configurable sub-app prefixes)
2026-06-17  $  10.63  haiku-4-5, sonnet-4-6   Story 34.2 (native Flowable CORS)
2026-06-18  $   7.16  sonnet-4-6              Landing page 1.0.0 update
────────────────────────────────────────────────────────────────────────────────────────
Total       $2,219.75  (captured — Epics 8–34 only)
────────────────────────────────────────────────────────────────────────────────────────
Projected   ~$400–600  (Epics 1–7, pre-May 19 sessions purged)
Full est.   ~$2,620–2,820
```

★ marks the three outlier sessions that individually drove ≥ 8 % of captured spend.

---

## Model evolution

| Period | Primary model | Secondary | Rationale |
|--------|--------------|-----------|-----------|
| May 19–23 | opus-4-7 | haiku-4-5, sonnet-4-6 | Early exploration; mixed model probes |
| May 24–Jun 2 | opus-4-7 | haiku-4-5 | Heavy implementation; haiku for sub-agents (multi-agent orchestration via Workflow tool) |
| Jun 3–8 | **opus-4-8** | haiku-4-5 | Model upgrade on availability; same usage pattern |
| Jun 10–11 | opus-4-8 | **fable-5** | Brief fable-5 evaluation on lightweight review tasks |
| Jun 13–15 | opus-4-8 | haiku-4-5 | A11y + launch assets (still substantial code generation) |
| Jun 16–18 | **sonnet-4-6** | haiku-4-5 | Final stretch is lighter (docs, config, CORS env-var); sonnet is sufficient and cheaper |

The haiku-4-5 appearances align with multi-agent Workflow sessions (sub-agent fleet for parallel review / find passes). Opus handled all primary code generation and architectural decisions.

---

## Efficiency analysis

### Cache return on investment

The 53 M cache-create tokens represent the cumulative "investment" in context — every page of CLAUDE.md, file reads, conversation history written into the cache. The 3.05 B cache-read tokens are the "return": each subsequent turn re-consumed that context without regenerating it.

Cache read multiplier: **57×** (each context byte written was re-read ~57 times on average over the month).

### Cost per deliverable

| Deliverable unit | Captured count | $/unit | Input / unit | Output / unit | Cache write / unit | Cache read / unit | Projected full project |
|-----------------|---------------:|-------:|-------------:|--------------:|-------------------:|------------------:|------------------------|
| Story | ~80 | $27.75 | ~9.4 K | ~117.7 K | ~663 K | ~38.1 M | ~114 stories · **~$23–25** |
| Epic | 27 (Epics 8–34) | $82.21 | ~27.9 K | ~348.8 K | ~1.96 M | ~112.8 M | 34 (Epics 1–34) · ~$79 |
| Release | 4 (v0.0.2–v1.0.0) | $554.94 | ~188.6 K | ~2.35 M | ~13.3 M | ~761.6 M | 5 (v0.0.1–v1.0.0) · ~$544 |

Output (~117.7 K/story) is the model's actual generated text — code, reasoning, tool calls. Input (~9.4 K/story) is the new prompt content added each turn beyond the cached context. Cache writes (~663 K/story) are the net context committed to the cache across a story's sessions. Cache reads (~38.1 M/story) dominate token volume but cost a fraction per token — they are the project context re-served from cache on every turn rather than re-sent as fresh input. The **output:input ratio of ~12.5:1** reflects an agent doing far more generation than reading new instructions.

The $27.75/story captured average spans a 2-story spike like Story 12.2 to trivial follow-up commits; median is $15–20 for smaller stories, $50–80 for complex multi-file epics (OIDC, Modeler properties). Projected full-project figures: ~114 stories at ~$23–25, ~34 epics at ~$79, 5 releases at ~$544.

### Peak-day anatomy

| Rank | Date | Cost | Dominant driver |
|------|------|-----:|----------------|
| 1 | May 25 | $349.47 | Epic 13 (History, 4 stories) + entire Epic 17 (Design system, 5 stories) — 18 PR-equivalent commits |
| 2 | May 26 | $317.13 | Epics 14–16 (Identity + DMN + Modeler rewrite, 16 stories) in one session |
| 3 | May 27 | $267.43 | Stories 18.2–18.4 (visual baselines = many screenshot generations) + v0.0.2 RC |
| 4 | May 24 | $168.44 | Stories 8.1–8.4 (API Inspector enrichment, body-byte budget, copy-as-curl) |
| 5 | Jun 7 | $174.63 | 7 stories (OIDC 4-part auth chain + form-js + BPMN/DMN moddle) |

The May 25–27 cluster ($934.03 — 42 % of captured spend, ~34 % of full-project estimate) is the "velocity spike": the largest batch of cross-cutting stories shipped back-to-back. Cache read volume on these days was proportionally high because the project context (CLAUDE.md + file history) was at its most mature.

---

## Reproduce

```bash
export PROJECT=-media-alioune-Data-dev-flowatch
npx ccusage@latest claude daily --instances --project="$PROJECT"
```

Requires [ccusage](https://github.com/ryoppippi/ccusage) and a Claude Code session log for this project path. Run without `--project` to see all projects.
