import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixels: 400,
      animations: "disabled",
      caret: "hide",
    },
  },
  fullyParallel: false,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/playwright-report", open: "never" }]],
  outputDir: "e2e/test-results",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "docker compose up -d",
      url: "http://rest-admin:test@localhost:8080/flowable-rest/service/management/engine",
      timeout: 180_000,
      reuseExistingServer: !isCI,
      stdout: "pipe",
      stderr: "pipe",
      ...(isCI ? { gracefulShutdown: { signal: "SIGTERM" as const, timeout: 30_000 } } : {}),
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      timeout: 60_000,
      reuseExistingServer: !isCI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
