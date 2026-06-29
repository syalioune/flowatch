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
| Total tokens consumed (ccusage) | 3,109,433,517 | ~3.7–3.8 B (est.) |
| Cache read ratio | 97.96 % | ~97 % (est.) |
| RTK commands proxied | 6,435 | — |
| RTK tokens eliminated (pre-model) | 8.4 M (59.2 % of shell output) | — |
| RTK avoided cost (API-equivalent est.) | ~$125–160 | — |
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

### Shell-output filtering (RTK)

[RTK (Rust Token Killer)](https://github.com/ckreiling/rtk) acts as a transparent CLI proxy: every shell command Claude issues is rewritten to `rtk <cmd>`, which compresses the output before it re-enters the model as a tool result. The 8.4 M tokens RTK eliminated never appeared in the ccusage ledger — they were filtered before reaching the model.

| Metric | Value |
|--------|------:|
| Commands proxied | 6,435 |
| Raw output (pre-filter) | 14.3 M tokens |
| Filtered output (post-filter) | 5.8 M tokens |
| **Tokens eliminated** | **8.4 M (59.2 %)** |
| Total exec time | 1,010 min (avg 9.4 s / cmd) |

Top saving sources (by volume eliminated):

| Command | Runs | Tokens saved | Avg filter rate |
|---------|-----:|-------------:|:--------------:|
| `vitest run` | 148 | 4.5 M | 98.6 % |
| `git diff origin/main…` | 2 | 1.04 M | ~97 % |
| `read` | 498 | 738.5 K | 22.2 % |
| `playwright test` (all variants) | 15 | ~729 K | ~100 % |
| `ls` | 666 | 192.5 K | 53.6 % |
| `grep` | 1,043 | 131.7 K | 16.6 % |

Vitest alone accounts for **54 % of all RTK savings** (4.5 M of 8.4 M). Test runners emit full pass/fail output that Claude needs only summarized; RTK's 98.6 % filter rate on those runs reflects near-total verbatim suppression.

**Relationship to ccusage figures.** The 53.8 M "new" tokens in the ccusage ledger (input + cache-create) represent what actually entered the model after RTK filtering. Without RTK those same commands would have contributed ~8.4 M additional tokens — pushing new-token volume to ~62.2 M (+15.6 %). At opus-4-8 cache-create rates (~$18.75/M) that gap represents roughly **$125–160 in avoided API-equivalent cost**, on top of the $2,219.75 captured total. The secondary benefit is architectural: smaller tool-result payloads reduce cache-create pressure and keep each turn's rolling context tighter, compounding across all 27 active days.

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

### Cost and lines by story phase

Each story passes through three phases visible in git history: **analysis** (story spec written into the BMad companion repo), **implementation** (code committed to the public repo), and **review** (code-review findings applied as patches + story spec amended with DAR block). The figures below are derived from commit diff statistics across both repos (149 full story specs in `flowatch-bmad/_bmad-output/implementation-artifacts/`, 40 sampled `feat` commits, and 20 sampled review-fix commits). Phase-level token ratios are inferred from commit iteration patterns and per-day spend ÷ stories-per-day; ccusage has only daily granularity so error bars are ±30–40 % at single-story level.

**Lines produced per story (commit diff, both repos)**

| Phase | Artifact | p25 | Median | p75 | Max |
|-------|----------|----:|-------:|----:|----:|
| Analysis — full story spec | Markdown (bmad impl-artifact) | 326 | **432** | 567 | 957 |
| Analysis — public shard | Markdown (public repo summary) | 19 | **20** | 21 | 37 |
| Implementation — code diff | Net lines changed (ins + del) | ~250 | **~490** | ~950 | 2,734 |
| Review — story amend | Markdown additions (DAR + SDR block) | — | **~80–200** | — | ~200 |
| Review — code patches | Net lines changed | — | **~50–180** | — | 522 |

Per-story combined output: **~700–1,200 lines** (code + markdown) for a typical story; **2,000–3,500 lines** for complex stories (OIDC, BPMN/DMN moddle, design-system split).

**Estimated cost share by phase (at $27.75 captured median/story)**

| Phase | Mechanism | Est. share | $/story |
|-------|-----------|:----------:|--------:|
| Analysis (`bmad-create-story` + spec write) | Single-pass generation: reads epic + PRD + patterns → outputs ~430-line spec. No test loops. | ~15–20 % | ~$4–6 |
| Implementation (`bmad-dev-story` code) | Iterative: code gen → vitest (≈1.8 runs/story avg, 148 total ÷ 80 stories) → fix → repeat. Cache grows during session. | ~55–65 % | ~$15–18 |
| Review (`/code-review` + amend + patches) | Focused: diff read, full findings report (not committed), targeted patches + DAR amend. | ~20–25 % | ~$5–7 |

Three observations from the data:

- **Implementation dominates cost but not line count.** The vitest iteration loops (filtered at 98.6 % by RTK before reaching the model) inflate token volume without leaving lines in git. A story with a 250-line spec can cost more than one with a 500-line spec if it requires more test-fix cycles.
- **Spec size and implementation cost correlate weakly.** The `.bar`-upload story (957-line spec) produced only 218 net code lines; the BPMN moddle story (281-line spec) produced 2,131 net code lines. Spec verbosity ≠ implementation complexity.
- **Review is underrepresented in line counts but not in cost.** The code-review skill generates a full findings report (token-expensive, not committed) before producing the visible patch commits, so the 50–180 lines in git understate the token work done in that phase.

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

## Sonnet-vs-Opus retrospective

The project ran primarily on **Opus 4.7 → 4.8** (May 19–Jun 15), switching to **Sonnet 4.6** only for the final three lightweight stories (Jun 16–18). What would the cost picture have looked like on a mostly-Sonnet run?

### The 4.x price ratio

Unlike the Claude 3 era (Opus-3 at $15/M vs Sonnet-3.5 at $3/M = 5× gap), the 4.x family has converged significantly:

| Model | Input $/1M | Output $/1M |
|-------|----------:|----------:|
| Opus 4.7 / 4.8 | $5.00 | $25.00 |
| Sonnet 4.6 | $3.00 | $15.00 |

**Ratio: 1.67× (Sonnet = 60 % of Opus cost)** — consistent across all token types including cache-create and cache-read, since those rates are proportional multiples of the base rate.

### Counterfactual estimates

| Scenario | Sonnet share | Est. total | vs. actual |
|----------|:-----------:|----------:|:---------:|
| All-Sonnet (theoretical) | 100 % | ~$1,332 | 1.67× cheaper |
| Aggressive hybrid | 70 % | ~$1,598 | 1.39× cheaper |
| Conservative hybrid | 40 % | ~$1,687 | 1.32× cheaper |

All-Sonnet: $2,219.75 × 0.60 ≈ **$1,332** — saves ~$888 (~40 % off). Not a dramatic halving.

### Empirical validation

The Jun 16–18 Sonnet period: 3 stories at $30.92 total (~$10.3/story) vs. the overall average of ~$27.75/story — **~37 % cheaper**, remarkably close to the theoretical 40 %. This confirms the ratio holds in practice for representative workloads.

### The quality gate

Roughly 30–40 % of stories were architecturally demanding enough to benefit from Opus reasoning depth:

- OIDC 4-part auth chain (complex multi-file security invariants)
- BPMN moddle event chain + Flowable engine integration
- Design system 3 × 2 × 3 token matrix (combinatorial correctness)
- Multi-agent Workflow harnesses with complex fan-out logic

The remaining 60–70 % — CRUD screens, CSS/responsive fixes, REST wrappers, Playwright test authoring for well-specified stories, documentation — were viable Sonnet targets.

Complex stories also tend to be more token-intensive (more iteration, longer context chains), so even at 35 % of story count they may represent ~50 % of token spend. A realistic "mostly Sonnet" run likely lands at **~$1,600–1,700 (~1.3–1.4× cheaper)**.

### Bigger picture

The more impactful optimization was already in place: the **57× cache-read multiplier** (97.96 % of all tokens were cache reads) means per-token cost barely matters — what matters is the number of distinct bytes written to cache and re-read across turns. RTK's 59.2 % shell-output compression ($125–160 in avoided cost) was a secondary lever. A mostly-Sonnet strategy would have saved **$500–900 in absolute terms**; the cache architecture and RTK filtering together saved far more without any quality tradeoff.

---

## Reproduce

```bash
export PROJECT=-media-alioune-Data-dev-flowatch
npx ccusage@latest claude daily --instances --project="$PROJECT"
```

Requires [ccusage](https://github.com/ryoppippi/ccusage) and a Claude Code session log for this project path. Run without `--project` to see all projects.

### Per-artifact token count (spot-check)

To validate the per-phase analysis against a specific story spec, pass the raw Markdown file to the [token-counting endpoint](https://docs.anthropic.com/en/api/counting-tokens):

```bash
curl -s https://api.anthropic.com/v1/messages/count_tokens \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d "$(jq -n --rawfile c 11-4-delegate-and-resolve-task-actions.md \
        '{model:"claude-opus-4-8", messages:[{role:"user",content:$c}]}')" \
| jq -r '.input_tokens'
```

Replace `11-4-delegate-and-resolve-task-actions.md` with any story spec from `flowatch-bmad/_bmad-output/implementation-artifacts/`. This measures the raw spec size as a single-message prompt — it does not account for the rolling CLAUDE.md + codebase context that dominates cache-read volume during an actual session. Use it to sanity-check the "Analysis — full story spec" row in the phase table above (median 432 lines → typically 6,000–10,000 input tokens for a mid-size spec).
