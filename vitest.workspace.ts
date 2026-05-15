import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Unit tier — jsdom (Story 2.1)
  "./vitest.config.ts",
  // Browser tier — Playwright Chromium (Story 2.2)
  "./vitest.browser.config.ts",
]);
