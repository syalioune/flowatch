import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "browser",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.spec.tsx", "src/**/*.spec.ts"],
    exclude: ["node_modules", "dist", "build", "e2e/**"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
