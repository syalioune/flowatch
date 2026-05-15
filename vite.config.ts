import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
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
