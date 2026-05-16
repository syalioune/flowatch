/**
 * Conventional Commits 1.0.0 enforcement for Flowatch.
 *
 * The `scope-enum` allow-list below is sourced from the `THEMES` array in
 * release.config.mjs — the same vocabulary semantic-release uses to bucket
 * commits in the generated release notes (per ADR-011 + P-008). The two
 * surfaces are kept in sync by scripts/release/check-commitlint-scopes.mjs
 * (run that script after editing release.config.mjs THEMES).
 *
 * Do NOT bypass via `git commit --no-verify`. The hook gate exists so
 * non-conforming commits never enter `develop` / `main`. If a commit must
 * be force-merged, route via PR review with the maintainer's authorization.
 *
 * Why hardcoded (not dynamic-imported from release.config.mjs):
 * release.config.mjs runs `execSync('gh issue list ...')` and `git rev-parse`
 * at load time — importing it from this CJS would spawn those subprocesses
 * on every `git commit`. The Task 2.4 helper detects drift in CI instead.
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [1, "never"],
    "scope-enum": [
      2,
      "always",
      [
        // 🎨 Modelers (BPMN & DMN)
        "modeler",
        "modelers",
        "bpmn",
        "dmn",
        "cmmn",
        "palette",
        "diagram",
        // 🚀 Deployments & Definitions
        "process",
        "deployments",
        "deployment",
        "definitions",
        "definition",
        "repository",
        // ▶️ Runtime, Tasks & Forms
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
        // ⚙️ Jobs, Batches & Events
        "jobs",
        "job",
        "batches",
        "batch",
        "event-subscriptions",
        "events",
        "event",
        "dlq",
        // 📊 History & Audit
        "history",
        "historic",
        "audit",
        "audit-log",
        // 👥 Identity & Tenants
        "identity",
        "idm",
        "users",
        "user",
        "groups",
        "group",
        "tenants",
        "tenant",
        "privileges",
        // 🔍 API Inspector
        "inspector",
        "api-inspector",
        "api-log",
        // 🔐 Authentication
        "auth",
        "authn",
        "authentication",
        "oidc",
        "sso",
        "bearer",
        "basic-auth",
        // 🎭 Design System & Theming
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
        // 🧭 Routing & Navigation
        "router",
        "routing",
        "routes",
        "navigation",
        "nav",
        "sidebar",
        "topbar",
        "chrome",
        // 🌐 Flowable REST contract
        "api",
        "request",
        "rest",
        "flowable-rest",
        "bruno",
        "compat",
        // 🛡️ Quality Gates
        "test",
        "tests",
        "vitest",
        "playwright",
        "e2e",
        "coverage",
        "lint",
        "biome",
        "typecheck",
        // 🧱 Foundation & Build
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
        // 🛠️ DevEx & Tooling
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
        // 📝 Documentation
        "docs",
        "doc",
        "readme",
        "changelog",
        "support",
        "contributing",
        "security",
        "license",
        // 🌍 i18n & Accessibility
        "i18n",
        "l10n",
        "a11y",
        "accessibility",
        // 📦 Dependencies
        "deps",
        "deps-dev",
        "dependencies",
      ],
    ],
    "subject-case": [0],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [1, "always", 100],
    // DCO sign-off enforcement — every commit needs `Signed-off-by:` in the
    // trailer. Project policy (separate from CC1.0; survives the spec's
    // hardening of the other rules).
    "signed-off-by": [2, "always", "Signed-off-by:"],
  },
};
