// SPDX-License-Identifier: Apache-2.0

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

function getBuildSha(): string {
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
    __APP_VERSION__: JSON.stringify(pkg.version),
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
