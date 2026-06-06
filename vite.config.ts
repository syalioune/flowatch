// SPDX-License-Identifier: Apache-2.0

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Resolution order for the build SHA baked into `__BUILD_SHA__`:
//   1. BUILD_SHA env var — set by the CI image job (full 40-char or short,
//      whatever the caller passes via `docker build --build-arg`). Always
//      preferred when present because container builds run inside a layer
//      that has `.git` excluded by .dockerignore.
//   2. `git rev-parse --short HEAD` — local dev and any environment where
//      `.git` is reachable.
//   3. `"dev"` — final fallback when both fail (e.g. a tarball install
//      without git history).
//
// The CI image job passes the full `github.sha`; we truncate to 7 chars
// here so the footer renders the canonical short form regardless of input.
function getBuildSha(): string {
  const fromEnv = process.env.BUILD_SHA?.trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

// `__APP_VERSION__` mirrors the same env-first / package.json-fallback
// pattern so CI runs with `APP_VERSION=${{ steps.meta.outputs.version }}`
// produce a bundle stamped with the semver tag (e.g. "0.0.2"), while
// local builds fall back to package.json (currently "0.0.0" per memory).
function getAppVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  return pkg.version;
}

function getFlowableTestedVersion(): string {
  try {
    const compat = readFileSync(new URL("./docs/compat.md", import.meta.url), "utf8");
    const fm = compat.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return "unknown";
    const m = fm[1]?.match(/^testedVersion:\s*"?([^"\n]+)"?$/m);
    return m?.[1] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    // Build-identity globals surfaced in the chrome footer (Story 6.5) and About
    // modal (Story 5.4). JSON.stringify is mandatory — Vite does literal text
    // substitution, so the value must be a quoted string in source.
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __BUILD_SHA__: JSON.stringify(getBuildSha()),
    __FLOWABLE_TESTED_VERSION__: JSON.stringify(getFlowableTestedVersion()),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      routeFileIgnorePrefix: "-",
      quoteStyle: "double",
    }),
    react(),
  ],
  optimizeDeps: {
    include: ["bpmn-js", "dmn-js"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          bpmn: ["bpmn-js"],
          dmn: ["dmn-js"],
          react: ["react", "react-dom"],
          // Story 28.4 (ADR-009): OIDC libs in their own chunk so the ~bundle
          // weight only loads when an OIDC connection mounts <AuthProvider>.
          oidc: ["react-oidc-context", "oidc-client-ts"],
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxy Flowable REST to avoid CORS when running both locally
    proxy: {
      "/flowable-rest": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
