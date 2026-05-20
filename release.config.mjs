// Flowatch semantic-release configuration.
//
// Replaces the legacy .releaserc.json (which was constrained by JSON
// and silently ignored its own presetConfig.types because the default
// `angular` preset does not honour them). The .mjs config buys us:
//
//   1. `preset: 'conventionalcommits'` — the only preset that respects
//      `presetConfig.types`. With it, every conventional-commit type
//      (feat / fix / perf / refactor / docs / test / ci / chore) renders
//      under the section name we declare below.
//
//   2. `presetConfig.parserOpts.noteKeywords + headerPattern` so the
//      `!:` shortcut in subject lines (e.g. `feat(modeler)!: ...`)
//      generates a BREAKING CHANGES entry even when the commit body
//      has no `BREAKING CHANGE:` footer. With the legacy angular
//      config, only one of two `feat!:` commits in v0.1.0 was
//      captured because the other had no body footer.
//
//   3. A `writerOpts.transform` function that:
//        - strips Git trailer lines (Co-Authored-By, Signed-off-by,
//          Reviewed-by, Tested-by, Refs:, Closes:) from BREAKING
//          CHANGES note bodies before they bleed into the rendered
//          release notes.
//        - drops false-positive issue references that the parser
//          extracts from in-body strings of the form
//          `ActionRestController#patchAction` — those aren't real
//          GitHub issues, they're Java method signatures captured
//          in commit messages.
//
//   4. Custom header + footer partials that bake in:
//        - the project's pre-1.0 posture banner (no compatibility
//          guarantees between pre-1.0 releases).
//        - a "Known issues" section auto-fetched from
//          `gh issue list --milestone <X.Y.0> --label known-issue
//          --state open` at config-load time. Milestone is derived
//          from the current branch name (`release/X.Y[.Z]` → `X.Y.0`)
//          or from the SEMANTIC_RELEASE_MILESTONE env var.
//
//   5. Section emojis on every group heading so the rendered release
//      reads as a curated narrative, not a flat commit list. The
//      headings replace what the closure plan §3.1 prescribed as a
//      hand-crafted highlights doc — the auto output now matches that
//      signal end-to-end, so future releases need zero hand-crafting.
//
// All of the above runs against the conventional-commits range
// `lastRelease..nextRelease` that semantic-release computes from the
// branch's git log. No commit-message rewriting required.

import { execFileSync, execSync } from "node:child_process";
import conventionalCommitsPreset from "conventional-changelog-conventionalcommits";

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const TRAILER_RE =
  /^(Co-Authored-By|Signed-off-by|Reviewed-by|Tested-by|Acked-by|Refs|Closes|Fixes):/i;

function stripTrailers(text) {
  if (!text) return text;
  return text
    .split("\n")
    .filter((line) => !TRAILER_RE.test(line.trim()))
    .join("\n")
    .trimEnd();
}

function detectMilestone() {
  if (process.env.SEMANTIC_RELEASE_MILESTONE) {
    return process.env.SEMANTIC_RELEASE_MILESTONE;
  }
  // release/0.0.2 → '0.0.2'; release/0.1 → '0.1.0'. The current
  // roadmap ships patch-level milestones (0.0.1/0.0.2/0.0.3) before
  // the 1.0.0 GA jump, so preserve the patch component when the
  // branch carries one.
  const milestoneFromRef = (ref) => {
    const m = ref.match(/release\/(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    return `${m[1]}.${m[2]}.${m[3] ?? "0"}`;
  };
  const envRef = process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF ?? "";
  const fromEnv = milestoneFromRef(envRef);
  if (fromEnv) return fromEnv;
  // Fall back to the current local branch (handy for local previews).
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
    const fromBranch = milestoneFromRef(branch);
    if (fromBranch) return fromBranch;
  } catch {
    /* ignore */
  }
  return null;
}

function fetchKnownIssues(milestone) {
  if (!milestone) return "";
  try {
    // execFileSync (no shell) — CodeQL js/indirect-command-line-injection
    // sink no longer applies; `milestone` is passed as a literal argv
    // element, so any shell metacharacters in it become inert.
    const out = execFileSync(
      "gh",
      [
        "issue",
        "list",
        "--milestone",
        milestone,
        "--label",
        "known-issue",
        "--state",
        "open",
        "--json",
        "number,title,url",
        "--limit",
        "50",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const issues = JSON.parse(out);
    if (!issues.length) return "";
    return [
      "",
      "### 📋 Known issues",
      "",
      ...issues.map((i) => `- [#${i.number}](${i.url}) — ${i.title}`),
      "",
    ].join("\n");
  } catch {
    // gh missing or rate-limited — skip silently. Footer is best-effort.
    return "";
  }
}

const milestone = detectMilestone();
const knownIssuesBlock = fetchKnownIssues(milestone);

// Per-milestone editorial headline. Keyed by the full milestone
// version (`X.Y.Z`) — under the current roadmap each milestone is a
// patch release on the 0.0.x line until the 1.0.0 GA jump (see
// _bmad-output/planning-artifacts/epics.md §"Epic List"), so the
// previous `<major>.<minor>` keying would collapse 0.0.1/0.0.2/0.0.3
// into the same bucket. Adding a new entry here is the only hand-edit
// needed per release — everything else derives from the conventional-
// commits range and the milestone state on GitHub.
const HEADLINES = {
  // Add an entry per milestone as it ships. The lookup falls back to
  // `<major>.<minor>.0` so any future minor-level milestones (e.g. a
  // post-GA `1.1.0` umbrella) can still cover their patch releases
  // with a single entry.
  "0.0.1":
    "Tech foundation — TS + Biome migration, Vitest + Playwright test tiers, TanStack Router, GitHub Actions CI/CD + Pages deploy, Conventional Commits + semantic-release, one-command Docker stack.",
  // '0.0.2': '🎉 v1 MVP — Flowable 6.x OSS UI parity rebuilt against flowable-rest 7.2.0. Connection probe, API Inspector, BPMN/DMN deployments + definitions + runtime + tasks + jobs + history + identity, vanilla bpmn-js/dmn-js modelers, three-look design system, a11y + snapshot coverage.',
  // '0.0.3': '6.x parity gaps — instance variable edit, task edit + attachments, user/group lifecycle, multi-connection switch, batches + event subscriptions, app-definition browse, BPMN token overlay, model versioning.',
  // '1.0.0': 'GA — pluggable auth (Basic/Bearer/OIDC PKCE), form-js designer + standalone forms, Flowable-specific bpmn-js properties panel, engine version compatibility banner, full WCAG AA audit, public release.',
};

function headlineFor(version) {
  if (!version) return "";
  if (HEADLINES[version]) return HEADLINES[version];
  const minorKey = version.split(".").slice(0, 2).join(".") + ".0";
  return HEADLINES[minorKey] ?? "";
}

function fetchTally(milestone, previousTag) {
  const out = { closed: null, commits: null, breaking: null };
  if (milestone) {
    try {
      // execFileSync (no shell) — CodeQL js/indirect-command-line-injection
      // sink no longer applies; `milestone` is a literal argv element.
      const json = execFileSync(
        "gh",
        [
          "issue",
          "list",
          "--milestone",
          milestone,
          "--state",
          "closed",
          "--json",
          "number",
          "--limit",
          "200",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      out.closed = JSON.parse(json).length;
    } catch {
      /* ignore */
    }
  }
  if (previousTag) {
    try {
      // execFileSync (no shell). `previousTag` is now an argv element
      // — any shell metacharacters are inert. `${previousTag}..HEAD`
      // is git's revision-range syntax, parsed by git itself.
      out.commits = parseInt(
        execFileSync("git", ["rev-list", "--no-merges", "--count", `${previousTag}..HEAD`], {
          encoding: "utf8",
        }).trim(),
        10,
      );
      // The previous `git log … | grep -cE '!:' || true` shell pipeline
      // is reproduced in JS: count subject lines containing the `!:`
      // breaking-change marker from conventional commits.
      const log = execFileSync(
        "git",
        ["log", "--no-merges", "--pretty=%s", `${previousTag}..HEAD`],
        { encoding: "utf8" },
      );
      out.breaking = log ? log.split("\n").filter((l) => l.includes("!:")).length : 0;
    } catch {
      /* ignore */
    }
  }
  return out;
}

function tallyLine(milestoneVersion, previousTag) {
  const t = fetchTally(milestoneVersion, previousTag);
  const parts = [];
  if (t.closed != null) parts.push(`**${t.closed} issues** closed`);
  if (t.commits != null) parts.push(`**${t.commits} commits**`);
  if (t.breaking != null)
    parts.push(`**${t.breaking} breaking** change${t.breaking === 1 ? "" : "s"}`);
  return parts.length ? `📊 ${parts.join(" · ")}` : "";
}

// Tally is fetched at config-load time — same trade-off as
// known-issues: snapshot at semantic-release startup, not after
// merge. Good enough; the merge happens within minutes of CI start.
const previousTag = process.env.SEMANTIC_RELEASE_PREVIOUS_TAG ?? "v0.0.1";
const tally = tallyLine(milestone, previousTag);

// Pre-1.0 posture banner. Renders below the `## v<X> (date)` heading
// and above the first conventional-commits section. Mirrors the
// closure plan §1 wording so policy stays in one place even when read
// straight off the GitHub Release page.
const PRE_1_0_BANNER = `> ⚠️ **Pre-1.0 posture.** Flowatch does **not** guarantee compatibility
> between pre-1.0 releases. Breaking changes may land at any time.
> Operators following the main branch should expect to rebuild state
> between releases. **1.0.0** will be the first public,
> compatibility-stable milestone.`;

// ---------------------------------------------------------------------
// Section types — every conventional-commits type maps to a section.
// Used by the preset's transform to drop type=hidden commits and to
// classify the rest. Our customTransform then rewrites `commit.type`
// to a domain-theme name (see THEMES below) so the release body
// renders thematically rather than by commit-type. We keep the type
// list complete so dropped types are explicit; the section names here
// only appear if the THEME mapping below misses a scope.
// ---------------------------------------------------------------------

const types = [
  { type: "feat", section: "✨ Features" },
  { type: "fix", section: "🐛 Bug Fixes" },
  { type: "perf", section: "⚡ Performance" },
  { type: "refactor", section: "♻️ Refactoring" },
  { type: "test", section: "🧪 Tests" },
  { type: "docs", section: "📝 Documentation" },
  { type: "ci", section: "🤖 CI/CD" },
  { type: "chore", section: "🧹 Maintenance" },
  { type: "style", section: "💅 Style", hidden: true },
];

// ---------------------------------------------------------------------
// Domain themes — the section headings the reader actually sees.
// Designed against the Flowatch PRD scope (BPMN/DMN modelers, runtime
// + tasks, jobs, history, identity, API Inspector, design system, …).
// Adding a new scope: pick the closest theme and add the scope to its
// list; if no theme fits, define a new one. The `scripts/release/
// check-scope.mjs` helper validates that every new scope lands in a
// theme rather than the catch-all.
//
// Order = display order. Most user-facing impact first; tooling/
// foundation last.
// ---------------------------------------------------------------------

const THEMES = [
  {
    name: "🎨 Modelers (BPMN & DMN)",
    scopes: ["modeler", "modelers", "bpmn", "dmn", "cmmn", "palette", "diagram"],
  },
  {
    name: "🚀 Deployments & Definitions",
    scopes: ["process", "deployments", "deployment", "definitions", "definition", "repository"],
  },
  {
    name: "▶️ Runtime, Tasks & Forms",
    // Process/case instances, tasks, claim/complete actions, task forms,
    // attachments — everything the operator does with running work.
    scopes: [
      "runtime",
      "instances",
      "instance",
      "tasks",
      "task",
      "forms",
      "form",
      "variables",
      "attachments",
      "content",
    ],
  },
  {
    name: "⚙️ Jobs, Batches & Events",
    // Engine-internal background work: timer/dead-letter/executable jobs,
    // batch operations, event subscriptions.
    scopes: ["jobs", "job", "batches", "batch", "event-subscriptions", "events", "event", "dlq"],
  },
  {
    name: "📊 History & Audit",
    scopes: ["history", "historic", "audit", "audit-log"],
  },
  {
    name: "👥 Identity & Tenants",
    scopes: [
      "identity",
      "idm",
      "users",
      "user",
      "groups",
      "group",
      "tenants",
      "tenant",
      "privileges",
    ],
  },
  {
    name: "🔍 API Inspector",
    // Flowatch's #1 differentiator. Pulled out of the screens cluster so
    // changes to it surface prominently in release notes.
    scopes: ["inspector", "api-inspector", "api-log"],
  },
  {
    name: "🔐 Authentication",
    // Basic / Bearer / OIDC PKCE strategies. Engine-side Spring Security
    // is the operator's responsibility (see PRD FR-4).
    scopes: ["auth", "authn", "authentication", "oidc", "sso", "bearer", "basic-auth"],
  },
  {
    name: "🎭 Design System & Theming",
    // CSS variables, the three looks, density, accent palettes, branding.
    scopes: [
      "design-system",
      "design",
      "styles",
      "styling",
      "theme",
      "theming",
      "looks",
      "density",
      "accent",
      "branding",
      "logo",
      "icons",
    ],
  },
  {
    name: "🧭 Routing & Navigation",
    scopes: ["router", "routing", "routes", "navigation", "nav", "sidebar", "topbar", "chrome"],
  },
  {
    name: "🌐 Flowable REST contract",
    // Touches the central api.js funnel or the Bruno collection.
    scopes: ["api", "request", "rest", "flowable-rest", "bruno", "compat"],
  },
  {
    name: "🛡️ Quality Gates",
    // Test & lint pipelines, mutation testing, snapshot coverage,
    // Playwright E2E orchestration. Plain `test(*)` lands here.
    scopes: [
      "test",
      "tests",
      "vitest",
      "playwright",
      "e2e",
      "coverage",
      "lint",
      "biome",
      "typecheck",
    ],
    // `ci` is Quality Gates when the subject mentions a test tool;
    // otherwise it falls under DevEx & Tooling (see themeFor below).
  },
  {
    name: "🧱 Foundation & Build",
    // Operator-facing build artefacts + infrastructure. Things that
    // affect what the deployment looks like, what containers run.
    scopes: [
      "devops",
      "docker",
      "docker-compose",
      "nginx",
      "vite",
      "build",
      "tech-foundation",
      "cleanup",
      "bootstrap",
      "pages",
      "gh-pages",
    ],
  },
  {
    name: "🛠️ DevEx & Tooling",
    // Contributor-facing scaffolding. Things that affect how developers
    // work on the codebase — agent prompts, ADR plumbing, API client
    // collections, release pipeline housekeeping, GH labels/templates,
    // generic `ci(*)` (non-quality-gate).
    scopes: [
      "claude",
      "agents",
      "agent",
      "adr",
      "bmad",
      "release",
      "release-prep",
      "project",
      "pr-labeler",
      "issue-template",
      "publish",
      "ci",
      "scripts",
      "hooks",
      "husky",
      "commitlint",
    ],
  },
  {
    name: "📝 Documentation",
    scopes: [
      "docs",
      "doc",
      "readme",
      "changelog",
      "support",
      "contributing",
      "security",
      "license",
    ],
  },
  {
    name: "🌍 i18n & Accessibility",
    scopes: ["i18n", "l10n", "a11y", "accessibility"],
  },
  {
    name: "📦 Dependencies",
    // Auto-bumps from Dependabot. Pulled out so they don't drown
    // human-authored work in the body.
    scopes: ["deps", "deps-dev", "dependencies"],
  },
  {
    name: "🧰 Other",
    // Final catch-all for unmapped scopes and scope-less commits.
    scopes: [],
    fallback: true,
  },
];

const SCOPE_TO_THEME = (() => {
  const map = new Map();
  for (const theme of THEMES) {
    for (const scope of theme.scopes) {
      map.set(scope.toLowerCase(), theme.name);
    }
  }
  return map;
})();
const FALLBACK_THEME = THEMES.find((t) => t.fallback)?.name ?? "🧰 Other";
const QUALITY_GATES_CI_RE =
  /\b(mutation|stryker|pit|pitest|playwright|e2e|axe|coverage|jacoco|codeql|sast|trivy)\b/i;

// Heuristic subject-keyword fallback for scope-less or unmapped
// commits. Picks the most specific theme that the subject text
// matches; falls back to FALLBACK_THEME if no keyword hits. Patterns
// are anchored on word boundaries to avoid false positives (e.g.
// "doc" matches "DEVELOPERS.md" only via the broader keyword list).
const SUBJECT_HEURISTICS = [
  // Help, i18n & Docs — covers scope-less docs commits.
  {
    theme: "🌍 Help, i18n & Docs",
    re: /\b(README|DEVELOPERS|CLAUDE|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT|user[- ]manual|documentation|docs?\b|README\.md|onboarding|i18n|l10n|translat)/i,
  },
  // Observability & Performance.
  {
    theme: "📊 Observability & Performance",
    re: /\b(grafana|prometheus|alertmanager|otel|opentelemetry|observability|metric|trace|tracing|log|logging|slo|burn[- ]rate)\b/i,
  },
  // Quality Gates.
  {
    theme: "🛡️ Quality Gates",
    re: /\b(playwright|axe|stryker|pit|pitest|mutation|coverage|jacoco|e2e|spectral|codeql|sast|trivy)\b/i,
  },
];

function themeFor(commit) {
  const scope = (commit.scope ?? "").toLowerCase().trim();
  if (scope === "ci" && QUALITY_GATES_CI_RE.test(commit.subject ?? "")) {
    return "🛡️ Quality Gates";
  }
  if (scope) {
    const themed = SCOPE_TO_THEME.get(scope);
    if (themed) return themed;
  }
  // Scope is missing or unmapped — try subject heuristics.
  const subject = commit.subject ?? "";
  for (const { theme, re } of SUBJECT_HEURISTICS) {
    if (re.test(subject)) return theme;
  }
  return FALLBACK_THEME;
}

// Order themes by their position in the THEMES array. The preset's
// commitGroupsSort defaults to alphabetical-by-title which would put
// "🌍" before "🎯" (emoji codepoint sort) — we want the user-facing
// order instead.
const THEME_ORDER = new Map(THEMES.map((t, i) => [t.name, i]));
function themeSort(a, b) {
  const ai = THEME_ORDER.has(a.title) ? THEME_ORDER.get(a.title) : Number.MAX_SAFE_INTEGER;
  const bi = THEME_ORDER.has(b.title) ? THEME_ORDER.get(b.title) : Number.MAX_SAFE_INTEGER;
  if (ai !== bi) return ai - bi;
  return (a.title ?? "").localeCompare(b.title ?? "");
}

// ---------------------------------------------------------------------
// Custom transform — runs *after* the conventionalcommits preset has
// classified each commit. We post-process to:
//   - strip Git trailer lines from BREAKING CHANGES note bodies,
//   - drop spurious in-body references that look like Java method
//     names (e.g. `ActionRestController#patchAction`).
// ---------------------------------------------------------------------

// Load the preset so we can compose with its writerOpts (transform,
// partials, sort/groupBy, etc.) instead of replacing them. Top-level
// await is fine — release.config.mjs is loaded once at semantic-
// release startup.
//
// Note: the conventionalcommits preset exposes its writer config under
// `cfg.writerOpts` in the v7 series (the version pinned by
// release-notes-generator v12 in this repo) and under `cfg.writer` in
// v8+. Tolerate both so the config keeps working across upgrades.
const presetCfg = await conventionalCommitsPreset({ types });
const presetWriter = presetCfg.writerOpts ?? presetCfg.writer;
const presetTransform = presetWriter.transform;

// Re-parse the original commit header when the upstream parser
// produced empty type/scope/subject. Different preset+parser
// versions (v7+rng12 vs v8+rng14) disagree on how to handle the
// `!:` shorthand for breaking changes — the v8 parser may emit
// `commit.scope=undefined` and `commit.subject=undefined` for
// `feat(modeler)!: ...`, leaving the renderer to fall back to the
// raw header. This regex matches all the variants we care about
// (`type:`, `type(scope):`, `type!:`, `type(scope)!:`).
const HEADER_RE = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;
function reparseHeader(commit) {
  const m = commit.header?.match(HEADER_RE);
  if (!m) return commit;
  const [, type, scope, , subject] = m;
  // Always overwrite: parser+preset combos disagree on `!:` and on
  // edge cases like `style(deps-dev): bump …`. The regex is robust
  // for our commit conventions; for non-`!:` commits the values are
  // identical to what the upstream parser produced anyway, so the
  // overwrite is a no-op.
  return {
    ...commit,
    type,
    scope: scope || null,
    subject,
  };
}

const customTransform = (commit, context) => {
  // Step 0: hand the preset a *mutable clone* of the commit. Newer
  //   `conventional-changelog-writer` versions (the one bundled
  //   inside `semantic-release@24`'s nested node_modules) freeze the
  //   incoming commit, but the conventionalcommits preset @v7 was
  //   written assuming mutability. Without this clone, semantic-
  //   release fails at generateNotes time with "Cannot modify
  //   immutable object". The fast preview path uses the looser
  //   release-notes-generator@latest from the root node_modules and
  //   does not freeze, but the full path goes through the nested
  //   copy. Cloning makes both paths work uniformly.
  //
  //   Also re-parse the header to fill in fields the upstream parser
  //   may have left empty (most commonly for `feat!:` shorthand).
  const mutableInput = reparseHeader({
    ...commit,
    notes: Array.isArray(commit.notes) ? commit.notes.map((n) => ({ ...n })) : commit.notes,
    references: Array.isArray(commit.references)
      ? commit.references.map((r) => ({ ...r }))
      : commit.references,
  });

  // Step 1: let the conventionalcommits preset classify the commit
  //   (assigns commit.type to the matching section name from `types`,
  //   strips dropped types, parses BREAKING CHANGES from `!:` subjects
  //   and `BREAKING CHANGE:` body footers, etc.). Returns null when
  //   the commit type is in `types` but `hidden:true`, or when the
  //   commit subject does not parse — pass that through unchanged.
  const transformed = presetTransform ? presetTransform(mutableInput, context) : mutableInput;
  if (!transformed) return transformed;

  // Step 2: rewrite commit.type to the domain THEME based on scope.
  //   This is what gives us "🎨 Modelers / ▶️ Runtime, Tasks & Forms /
  //   ..." headings instead of "✨ Features / 🐛 Bug Fixes / ...". Both
  //   feat and fix commits sit under the same theme — the kind-of-change
  //   axis is preserved on the commit subject itself ("enforce REST API
  //   conventions" reads as a fix; "add OIDC login" reads as a feat).
  //
  //   Step 3 (in the same returned object): the commit handed to us
  //   is frozen by conventional-changelog-writer, so we must return a
  //   new object rather than mutate fields in place. Strip trailers
  //   from BREAKING note bodies and drop spurious non-numeric refs.
  return {
    ...transformed,
    type: themeFor({ ...transformed, subject: commit.subject }),
    notes: Array.isArray(transformed.notes)
      ? transformed.notes.map((note) => ({
          ...note,
          text: stripTrailers(note.text),
        }))
      : transformed.notes,
    references: Array.isArray(transformed.references)
      ? transformed.references.filter((r) => r && /^\d+$/.test(String(r.issue ?? "")))
      : transformed.references,
  };
};

// ---------------------------------------------------------------------
// release-notes-generator config
// ---------------------------------------------------------------------

// Build a header that:
//   1. Reuses the preset's `[version](compareUrl)` anchor so links
//      keep working.
//   2. Drops in the headline editorial line (from HEADLINES, keyed
//      by major.minor).
//   3. Drops in the live numbers tally (closed issues + commits +
//      breaking-change count).
//   4. Appends the pre-1.0 posture banner.
const headlineLine = headlineFor(milestone);
const headerPreface = [
  headlineLine ? `\n\n${headlineLine}\n` : "",
  tally ? `\n${tally}\n` : "",
  `\n${PRE_1_0_BANNER}\n`,
].join("");

const augmentedHeaderPartial = `${presetWriter.headerPartial}${headerPreface}`;

// Footer block: known issues (live-fetched) + the auto-generated
// attribution line. Rendered as a single string and spliced into a
// custom mainTemplate (the conventionalcommits preset's mainTemplate
// has no `{{> footer}}` anchor by default).
const FOOTER_BLOCK = `${knownIssuesBlock}\n\n---\n\n_Auto-generated by [semantic-release](https://github.com/semantic-release/semantic-release)._\n`;

// Extend the preset's mainTemplate by appending our footer block.
// The preset emits header → notes (BREAKING) → commit groups; we add
// our footer below all of that.
const augmentedMainTemplate = `${presetWriter.mainTemplate}\n${FOOTER_BLOCK}`;

const releaseNotesConfig = {
  preset: "conventionalcommits",
  presetConfig: {
    types,
  },
  writerOpts: {
    transform: customTransform,
    headerPartial: augmentedHeaderPartial,
    // mainTemplate carries the footer block — see comment above. The
    // preset's footerPartial is empty by default; we leave it that way.
    mainTemplate: augmentedMainTemplate,
    // Reuse the preset's other partials + sort functions, except
    // commitGroupsSort: we override it to honour THEMES order (the
    // preset's default sorts alphabetically by section title, which
    // for our emoji-prefixed themes lands "🌍" before "🎯" — wrong).
    commitPartial: presetWriter.commitPartial,
    groupBy: presetWriter.groupBy,
    commitGroupsSort: themeSort,
    commitsSort: presetWriter.commitsSort,
    noteGroupsSort: presetWriter.noteGroupsSort,
    notesSort: presetWriter.notesSort,
  },
};

// ---------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------

export default {
  branches: [
    // `main` is the stable-release branch. It currently points at
    // develop's root commit (the very first commit on develop), and the
    // `v0.0.0` tag is anchored there too — so v0.0.0 is reachable from
    // both main and develop via their shared root.
    //
    // Reachability matters: semantic-release on a prerelease branch
    // (develop) determines its baseline by finding the highest stable
    // tag reachable from BOTH the prerelease branch AND the matching
    // release branch (main). With a shared-history root, that
    // intersection is `v0.0.0` and the next beta computes correctly
    // (e.g. `v0.0.1-beta.1`). If main and develop had unrelated
    // histories the intersection would be empty and semantic-release
    // would fall back to its built-in first-release default `v1.0.0`,
    // emitting `v1.0.0-beta.1` instead — a version that overshoots the
    // agreed milestone plan.
    //
    // The first `release/0.0.1 → main` promotion is a normal fast-
    // forward (main is reachable from develop), no
    // `--allow-unrelated-histories` needed.

    "main",

    // `develop` is the long-lived integration branch (DEVELOPERS.md §3).
    // Every merge here produces a `vX.Y.Z-beta.N` pre-release on
    // GitHub Releases. Promote to `main` via a release/* branch when the
    // beta line is ready to cut.
    { name: "develop", prerelease: "beta" },

    // The pre-release identifier must be a valid SemVer identifier
    // ([A-Za-z0-9-]). When `prerelease: true`, semantic-release derives
    // the identifier from the branch name — but `release/0.1.0`
    // contains `/` and `.`, which fail validation with
    // EPRERELEASEBRANCH. Use the literal `rc` so every `release/*`
    // branch emits `vX.Y.Z-rc.N` regression candidates during the
    // release-stabilisation window. See closure plan §6.2.
    { name: "release/*", prerelease: "rc" },
  ],
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules: [
          // Pre-1.0 line: every routine commit type maps to PATCH so
          // the milestone path stays 0.0.1 → 0.0.2 → 0.0.3 (no
          // accidental 0.1.0 from a feat-only burst). Each milestone
          // is a deliberate patch bump via the release/* flow, not a
          // by-product of commit-type heuristics.
          { type: "feat", release: "patch" },
          { type: "fix", release: "patch" },
          { type: "perf", release: "patch" },
          { type: "refactor", release: "patch" },
          // BREAKING CHANGE maps to MAJOR (not minor) so the planned
          // 0.0.3 → 1.0.0 GA jump triggers correctly. Mapping breaking
          // to minor would emit 0.1.0 — a version the milestone plan
          // explicitly skips.
          { breaking: true, release: "major" },
        ],
      },
    ],
    ["@semantic-release/release-notes-generator", releaseNotesConfig],
    ["@semantic-release/changelog", { changelogFile: "CHANGELOG.md" }],
    // @semantic-release/npm bumps package.json + package-lock.json. We disable
    // npmPublish because Flowatch is `private: true` and ships via GitHub
    // Releases / Docker only. Without this plugin the @semantic-release/git
    // step below would commit unchanged package.json on every release.
    ["@semantic-release/npm", { npmPublish: false }],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md", "package.json", "package-lock.json"],
        message: "chore(release): ${nextRelease.version} [skip release]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
