#!/usr/bin/env node
// Fast (~1s) preview that bypasses semantic-release's verify /
// analyze / publish pipeline and just runs the project's
// release-notes-generator config directly. Use it during
// release.config.mjs iteration when you want to see the rendered
// output without GH auth, branch validation, or the 10–15s overhead
// of a full `semantic-release --dry-run`.
//
// Usage:
//   node scripts/release/preview-fast.mjs                     # vs origin/main, milestone autodetect
//   node scripts/release/preview-fast.mjs --range v0.0.1..HEAD --milestone 0.1.0
//   node scripts/release/preview-fast.mjs --range origin/main..origin/main
//
// Reads commits from the given range, builds a synthetic context
// matching what semantic-release would pass at release time, and
// pipes the result to stdout. Identical output to
// `npm run release:preview` for the same range.

import { generateNotes } from '@semantic-release/release-notes-generator';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
// Default range: from the last stable tag (e.g. v0.0.1) to HEAD.
// This makes the rendered output match what the next stable release
// would produce regardless of which branch you're on. Override with
// --range to preview a different window (e.g. main..release/0.1.0).
let lastTag = 'v0.0.1';
try {
  // Latest tag matching v[0-9]*.[0-9]*.[0-9]* without a prerelease
  // suffix — i.e. the most recent STABLE release.
  lastTag = execSync(
    `git -C "${process.cwd()}" describe --tags --abbrev=0 --match='v[0-9]*.[0-9]*.[0-9]*' --exclude='*-*' 2>/dev/null`,
    { encoding: 'utf8' },
  ).trim() || 'v0.0.1';
} catch {
  /* no tag found — keep v0.0.1 fallback */
}
let range = `${lastTag}..HEAD`;
let milestone;
let version = '0.1.0';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--range' && args[i + 1]) {
    range = args[i + 1];
    i++;
  } else if (args[i] === '--milestone' && args[i + 1]) {
    milestone = args[i + 1];
    i++;
  } else if (args[i] === '--version' && args[i + 1]) {
    version = args[i + 1];
    i++;
  }
}

if (milestone) process.env.SEMANTIC_RELEASE_MILESTONE = milestone;

const cfgUrl = pathToFileURL(resolve(repoRoot, 'release.config.mjs')).href;
const cfg = (await import(cfgUrl)).default;
const rng = cfg.plugins.find(
  (p) => Array.isArray(p) && p[0] === '@semantic-release/release-notes-generator',
);
if (!rng) {
  console.error('release.config.mjs has no release-notes-generator plugin');
  process.exit(1);
}

const fmt = '%H%x1e%h%x1e%s%x1e%b%x1f';
const raw = execSync(`git -C "${repoRoot}" log --no-merges --pretty=format:${fmt} ${range}`, {
  encoding: 'utf8',
});
const commits = raw
  .split('\x1f')
  .map((r) => r.trim())
  .filter(Boolean)
  .map((line) => {
    const [hash, short, subject, ...rest] = line.split('\x1e');
    const body = rest.join('\x1e').trim();
    return {
      hash,
      commit: { short, long: hash },
      subject: subject.trim(),
      message: subject.trim() + '\n\n' + body,
      body,
    };
  });

// Resolve previous tag from the range's left-hand side. Used by the
// release.config.mjs tally helper. Falls back to the literal range if
// not parseable.
const previousTag = range.match(/^([^.]+)\.\./)?.[1] ?? 'v0.0.1';
process.env.SEMANTIC_RELEASE_PREVIOUS_TAG = previousTag;

const ctx = {
  cwd: repoRoot,
  options: { repositoryUrl: 'https://github.com/syalioune/flowatch' },
  branch: { name: 'main' },
  commits,
  lastRelease: { gitTag: previousTag, gitHead: previousTag },
  nextRelease: {
    gitTag: `v${version}`,
    name: `v${version}`,
    version,
    type: 'minor',
  },
  logger: {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: console.error,
  },
};

console.log(await generateNotes(rng[1], ctx));
