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
      // Foreground `docker compose up` (not `-d`) so the process stays
      // attached for the lifetime of the test run. Detached mode exits
      // in ~1s, and Playwright treats early process-exit before the URL
      // probe responds as fatal ("Process from config.webServer exited
      // early") on cold starts. The gracefulShutdown SIGTERM below tears
      // the stack down cleanly when tests finish.
      command: "docker compose up",
      // Probe the management endpoint without inline credentials — Playwright's
      // webServer treats 2xx/3xx/400/401/402/403 as "alive", so a 401 from the
      // unauthenticated probe is sufficient to confirm Flowable is up. Inlining
      // `user:pass@` would leak the cleartext password into Playwright's
      // stdout/HTML report artifacts on CI.
      url: "http://localhost:8080/flowable-rest/service/management/engine",
      timeout: 180_000,
      // Always reuse when the URL already responds. The CI workflow pre-
      // starts the stack (ci.yml `Start Docker stack` step) so by the time
      // Playwright runs, the URL is up — `false` here would make Playwright
      // refuse with "URL is already used". Local dev with the stack already
      // running benefits too; cold local runs still trigger the spawn.
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
      ...(isCI ? { gracefulShutdown: { signal: "SIGTERM" as const, timeout: 30_000 } } : {}),
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      timeout: 60_000,
      // Same rationale as the docker entry above — if Vite is already
      // running (CI prior step or local dev session), attach instead of
      // erroring on a busy port.
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
