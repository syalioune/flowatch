#!/usr/bin/env node
// Drives `semantic-release --dry-run` against the *current* branch so
// `npm run release:preview` works no matter which branch you're on.
// The default branches list in release.config.mjs only lists `main` /
// `main` / `release/*`; running a dry-run from a feature or chore
// branch otherwise bails out with "configured to only publish from
// main". Passing `--branches <current>` short-circuits that check.
//
// Optional flags:
//   --milestone <X.Y.Z>   sets SEMANTIC_RELEASE_MILESTONE so the
//                         release.config.mjs known-issues + tally
//                         helpers query that GH milestone. Falls
//                         back to autodetect from current branch
//                         (release/X.Y) if omitted.
//
// Slower (~10–15s) but truthful: runs the full plugin pipeline
// including verify, analyze, generateNotes. For tight config-tuning
// loops use `npm run release:preview:fast` instead.

import { execSync, spawn } from "node:child_process";

const args = process.argv.slice(2);
let milestone;
const passthrough = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--milestone" && args[i + 1]) {
    milestone = args[i + 1];
    i++;
  } else {
    passthrough.push(args[i]);
  }
}

const branch = execSync("git rev-parse --abbrev-ref HEAD", {
  encoding: "utf8",
}).trim();

const env = { ...process.env };
if (milestone) env.SEMANTIC_RELEASE_MILESTONE = milestone;

// `@semantic-release/github`'s verifyConditions step checks that
// GH_TOKEN / GITHUB_TOKEN is set even when running --dry-run. For
// local previews, borrow the gh CLI's authenticated token if the
// user already ran `gh auth login`. Skip silently if gh isn't
// available — the user will see the same ENOGHTOKEN error and can
// set GH_TOKEN manually.
if (!env.GH_TOKEN && !env.GITHUB_TOKEN) {
  try {
    const ghToken = execSync("gh auth token", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (ghToken) env.GH_TOKEN = ghToken;
  } catch {
    /* gh not installed or not authed — let semantic-release error explicitly */
  }
}

const child = spawn(
  "npx",
  ["semantic-release", "--dry-run", "--no-ci", "--branches", branch, ...passthrough],
  { stdio: "inherit", env },
);
child.on("exit", (code) => process.exit(code ?? 1));
