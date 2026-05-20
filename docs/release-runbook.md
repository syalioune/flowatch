# Flowatch release runbook

<!-- SPDX-License-Identifier: Apache-2.0 -->

Mechanical procedure. Top-to-bottom. Zero judgement calls. Each section is either a copy-pasteable command block (with an Expected output snippet) or a binary decision tree. Conceptual background lives in [DEVELOPERS.md §3](../DEVELOPERS.md) and [ADR-011](../_bmad-output/planning-artifacts/architecture.md#adr-011--release-pipeline-conventional-commits--semantic-release); this file is the operational layer below them.

## 1. Pre-flight checklist

Run through this list **before** doing anything else. Every box must be ticked.

- [ ] `develop` HEAD CI is green: all four required checks (`check`, `unit`, `e2e`, `build`) plus CodeQL (`Analyze (javascript-typescript)`) on the latest commit.
  ```bash
  gh run list --branch develop --limit 1 --json conclusion,headSha,name | jq
  # expect: all conclusions "success" for the most-recent push
  ```
- [ ] No in-flight PRs targeting `develop`.
  ```bash
  gh pr list --base develop --state open
  # expect: empty list (or only PRs intentionally deferred until after this release)
  ```
- [ ] `npx semantic-release --dry-run --no-ci` from develop tip produces a non-empty next-version. (Story 6.5-3's `release-dryrun` workflow runs this automatically on the PR to `release/*`; this local check is a sanity probe.)
  ```bash
  HUSKY=0 npx semantic-release --dry-run --no-ci 2>&1 | grep -E 'next release version'
  # expect: a line "The next release version is X.Y.Z"
  ```
- [ ] Bruno API smoke pass against a local Flowable engine (Story 24.x / 25.x scope — if no Bruno suite yet exists, mark "N/A" and continue).
  ```bash
  # If bruno is installed:
  bru run flowable-smoke.json --env local
  # expect: 0 failures
  ```
- [ ] No `[skip release]` commit is the current HEAD of develop. (Bot-authored commits would interfere with next-release detection.)
  ```bash
  git log -1 develop --pretty=%B | grep -F '[skip release]' && echo "STOP: HEAD is a [skip release] commit" || echo "OK"
  # expect: OK
  ```

**If any box fails, stop. Fix the failing item, then restart this checklist from the top.**

## 2. Cut the release branch

```bash
# Set the version once; reuse below.
export VERSION=0.0.2

# Update local refs.
git fetch origin --prune
git switch develop
git pull --ff-only origin develop

# Cut the release branch from develop's tip.
git switch -c release/$VERSION
git push -u origin release/$VERSION
```

**Expected output (last command):**
```
Branch 'release/0.0.2' set up to track 'origin/release/0.0.2'.
 * [new branch]      release/0.0.2 -> release/0.0.2
```

## 3. Open the release PR

```bash
# Body template — edit only the milestone link if applicable.
cat > /tmp/release-pr-body.md <<EOF
## Release ${VERSION}

Promotes \`develop\` → \`release/${VERSION}\` → \`main\` per ADR-011.

### Pre-flight
- [x] develop CI green
- [x] release-dryrun green
- [x] no in-flight develop PRs

### Post-merge action
- Maintainer: run \`bash scripts/bootstrap-gh/protect-branches.sh\` if this is the first commit landing on a freshly-protected \`release/*\` (see §7).

Refs milestone-0.0.1 retro / story 6.5-5 runbook.
EOF

gh pr create \
  --base main \
  --head release/$VERSION \
  --title "chore(release): $VERSION" \
  --body-file /tmp/release-pr-body.md
```

**Expected output:**
```
https://github.com/syalioune/flowatch/pull/<N>
```

Then open the same release branch as a PR to `develop` (the back-merge PR — see §5). Creating it now means the back-merge cannot be silently forgotten:

```bash
gh pr create \
  --base develop \
  --head release/$VERSION \
  --title "chore(release): back-merge v$VERSION into develop" \
  --body "Back-merge of release/$VERSION post-tag. Do not merge until §5. Required to keep develop's ancestry in sync (per milestone-0.0.1 retro §3.6)."
```

**Expected output:**
```
https://github.com/syalioune/flowatch/pull/<N+1>
```

## 4. Semantic-release execution on merge to `release/*`

When the §3 release PR merges to `main` (or when CI fires on a push to `release/*`), the release workflow runs automatically. It does the following, in order:

1. **Mint Flowatch Release Bot token** ([.github/workflows/release.yml](../.github/workflows/release.yml) — `Mint Flowatch Release Bot token` step). Uses the App credentials stored as Environment secrets on the `release-bot` environment.
2. **Checkout full history** with the bot token (`fetch-depth: 0`, `persist-credentials: true`). semantic-release needs the full git log to compute the next version.
3. **Setup Node from `.nvmrc`** and `npm ci`.
4. **`npm audit signatures`** — verifies registry-signed packages before the bot publishes anything.
5. **Run `npx semantic-release`** — plugins execute in the order documented in ADR-011: `commit-analyzer` → `release-notes-generator` → `changelog` → `npm` → `git` → `github`. The `git` plugin pushes a `chore(release): X.Y.Z [skip release]` commit back to the release branch.

**Representative run log (success):**
```
[semantic-release] Loaded plugin "analyzeCommits" from "@semantic-release/commit-analyzer"
[semantic-release] Analysis of 17 commits complete: patch release
[semantic-release] The next release version is 0.0.2
[semantic-release] Created GitHub release v0.0.2
[semantic-release] Published release 0.0.2 on default channel.
```

**How to recognize a stuck run:**

```
- Run elapsed > 5 min? → Likely stuck. Open the Actions tab; check the failing step.
- Run elapsed < 5 min and no progress for 60s? → Network blip; let it ride to 5 min before intervening.
- "Mint Flowatch Release Bot token" step takes > 30s? → GitHub App creds rotation needed (see §8.1).
- "Run semantic-release" step times out at default 360s? → Plugin hanging on a GitHub API call (see §8.1).
```

## 5. Back-merge `develop ← release/X.Y.Z`

**After** the release PR (§3) merges to `main` and the bot has pushed the `chore(release): $VERSION [skip release]` commit, run the back-merge **immediately** (within 24h). Forgetting it leaves develop's ancestry de-synced and the next release will compute the wrong version.

```bash
# Refresh local refs.
git fetch origin --prune
git switch develop
git pull --ff-only origin develop

# Pull the release branch's HEAD (which includes the bot's bump commit).
git fetch origin release/$VERSION

# Merge using `-s ours` to record the back-merge without altering develop's
# tree. The release branch's tree is identical to develop's plus the
# CHANGELOG.md + package.json bump, which we do NOT want copied back to
# develop (CHANGELOG.md is append-only by semantic-release on the next
# release; package.json stays at its pre-release placeholder).
#
# `-s ours` means: keep develop's tree, just record release/$VERSION as a
# second parent. The commit message uses [skip release] so release.yml
# does NOT re-fire on this merge commit.
git merge -s ours --no-ff origin/release/$VERSION \
  -m "chore(release): back-merge v$VERSION into develop [skip release]"

git push origin develop
```

**Expected output (last command):**
```
   <hash>..<new-hash>  develop -> develop
```

Then close the back-merge PR opened in §3 (it auto-closes once develop's ancestry includes the merge commit) and delete the release branch:

```bash
git push origin :release/$VERSION
```

**Expected output:**
```
 - [deleted]         release/0.0.2
```

> **Why `-s ours` and not a regular merge?** A regular `git merge` would pull the bot's `CHANGELOG.md` bump and `package.json` version bump back into develop, which semantic-release would then double-count on the next beta release. `-s ours` records the lineage without copying the tree.

## 6. `[skip release]` vs `[skip ci]` — when to use which

| Marker | Effect | Use when |
|--------|--------|----------|
| `[skip release]` | Suppresses **only** the `release.yml` workflow. CI (`check`/`unit`/`e2e`/`build`) and CodeQL still run. The merge is gated by required checks. | The release bot's own version-bump commit, or a manual back-merge that must not trigger a new release. |
| `[skip ci]` | Suppresses **all** GitHub Actions workflows on this commit, including required checks. Branch protection blocks the merge because required-check contexts never report. | Almost never. Documented exceptions: docs-only fixes on a long-lived branch where the operator has just run CI manually (`workflow_dispatch`) and confirmed green. |

**Rule of thumb:** if in doubt, use `[skip release]`. `[skip ci]` is a foot-gun on protected branches.

**Why they are NOT interchangeable:** `[skip ci]` is GitHub Actions' native marker; `[skip release]` is a project-local marker scoped to `release.yml`'s `if:` condition ([.github/workflows/release.yml:33](../.github/workflows/release.yml#L33)). Using `[skip ci]` on a protected-branch commit blocks the merge because required checks never run. Using `[skip release]` only suppresses the release pipeline; everything else runs normally.

## 7. Branch-protection sequencing

**Rule:** `scripts/bootstrap-gh/protect-branches.sh` MUST run **after** the first commit lands on a freshly-created branch, NEVER before. Reason: GitHub's branch-protection API requires the branch ref to exist; running the script against a branch with zero commits errors out with `Resource not found`. For `release/X.Y.Z`, this means push the branch first (§2's last `git push -u origin release/$VERSION`), then protect:

```bash
bash scripts/bootstrap-gh/protect-branches.sh syalioune/flowatch
```

**Expected output:**
```
Applying ruleset to main…
  Updating existing ruleset id=<N>
Applying ruleset to develop…
  Updating existing ruleset id=<N+1>
Applying ruleset to release/0.0.2…
  Creating new ruleset
Done.
```

The script auto-discovers live `release/*` branches and applies the same ruleset (plus the `release-dryrun` required-check) to each. Re-running is safe (idempotent).

If you forget this step, the first PR to `release/X.Y.Z` will not have required-check gating. Fix: run the script, close and re-open the PR to re-trigger required-check evaluation.

## 8. Failure recovery

Each failure mode below is a diagnosis + recovery command sequence + a "Prevent recurrence" pointer.

### 8.1 Release job fails after tagging but before publishing

**Diagnosis:**
```bash
gh release view v$VERSION 2>&1 | head -10
# expect (if tag exists but release is missing): "release not found" with the tag still listed in `git ls-remote --tags origin`
git ls-remote --tags origin | grep "v$VERSION"
# expect: one line if the tag was pushed
```

**Recovery (tag exists, no GitHub Release published):**
```bash
# Step 1 — re-run the release job from the Actions tab.
gh run rerun <run-id>

# Step 2 — if the re-run still fails (e.g. bot token rotation), delete the
# half-released tag + bot commit and re-run from a clean state.
gh release delete v$VERSION --cleanup-tag --yes
git push origin --delete release/$VERSION   # if the branch still exists
git push origin :refs/tags/v$VERSION        # belt + braces
```

**Expected output (last command):**
```
 - [deleted]         (none)         refs/tags/v0.0.2
```

**Prevent recurrence:** §1 pre-flight verifies the dry-run produces a clean next-version; the release-dryrun gate from story 6.5-3 catches plugin-error regressions before merge.

### 8.2 Changelog footer breaks markdown

**Diagnosis:**
```bash
git switch release/$VERSION
git pull origin release/$VERSION
git show HEAD --stat | grep CHANGELOG.md
# expect: CHANGELOG.md listed in the bot's chore(release) commit
git diff HEAD~1 HEAD -- CHANGELOG.md | head -30
# expect: the new release-notes block; look for unclosed `*`, broken table, etc.
```

**Recovery (hand-edit the offending line on `release/X.Y.Z`):**
```bash
# Open the file, fix the broken markdown, commit with [skip release] so
# release.yml does NOT re-fire. The bot's previous commit already had
# [skip release], so the workflow stayed quiet; the manual fix preserves
# that posture.
$EDITOR CHANGELOG.md
git add CHANGELOG.md
git commit -s -m "docs(changelog): fix markdown rendering in v$VERSION notes [skip release]"
git push origin release/$VERSION
```

**Expected output (last command):**
```
   <hash>..<new-hash>  release/0.0.2 -> release/0.0.2
```

**Prevent recurrence:** the release-dryrun gate (story 6.5-3) catches changelog generation errors (`@semantic-release/release-notes-generator` plugin crashes) before merge; a broken rendering after a successful generation is rarer but still possible — see ADR-011's themes alignment with `commitlint.config.cjs`.

### 8.3 Wrong base branch was used

**Diagnosis:**
```bash
gh pr view <pr-number> --json baseRefName,headRefName | jq
# expect (mistake): baseRefName != "main" for the §3 release PR
```

**Recovery (PR not yet merged):**
```bash
gh pr close <pr-number> --comment "Wrong base branch; closing and re-opening with correct base."
gh pr create \
  --base main \
  --head release/$VERSION \
  --title "chore(release): $VERSION" \
  --body-file /tmp/release-pr-body.md
```

**Expected output:**
```
https://github.com/syalioune/flowatch/pull/<N+2>
```

**Recovery (PR already merged into the wrong branch):**
```bash
# Revert the merge commit on the wrong branch.
git switch <wrong-branch>
git revert --mainline 1 <merge-commit-sha>
git push origin <wrong-branch>

# Then redo §3 with the correct base.
```

**Expected output (`git push` line):**
```
   <hash>..<new-hash>  <wrong-branch> -> <wrong-branch>
```

**Prevent recurrence:** §3's `gh pr create --base main --head release/$VERSION` template makes the base explicit. Following the runbook verbatim closes this failure mode.

### 8.4 Back-merge was forgotten and develop is N commits behind release

**Diagnosis:**
```bash
git fetch origin --prune
git log origin/develop..origin/release/$VERSION --oneline
# expect (forgotten back-merge): one or more commits, including the bot's chore(release) commit
```

**Recovery (run §5 retroactively — the command is idempotent):**
```bash
git switch develop
git pull --ff-only origin develop
git fetch origin release/$VERSION
git merge -s ours --no-ff origin/release/$VERSION \
  -m "chore(release): back-merge v$VERSION into develop [skip release]"
git push origin develop
```

**Expected output (last command):**
```
   <hash>..<new-hash>  develop -> develop
```

**Prevent recurrence:** §3 opens the back-merge PR upfront precisely so that it surfaces in `gh pr list --base develop` until the back-merge lands. The pre-flight §1 also blocks the next release while a `[skip release]` commit is not yet on develop (the `git log -1` check would catch the inverted state).
