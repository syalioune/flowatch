// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: {
    // Surfaced in the About modal (Story 5.4). Story 6.5 adds __BUILD_SHA__
    // here; the About tab defensively falls back to "dev" when undefined.
    __APP_VERSION__: JSON.stringify(pkg.version),
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
