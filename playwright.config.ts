import { defineConfig, devices } from "@playwright/test";

const isAgent = process.env.E2E_AGENT === "1";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  (isAgent ? "http://localhost:12001" : "http://localhost:12000");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: !isAgent,
  workers: isAgent ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: isAgent
    ? [
        ["list"],
        ["json", { outputFile: `.e2e/runs/${process.env.E2E_RUN_ID || "latest"}/report.json` }],
      ]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: isAgent ? "on" : "retain-on-failure",
    screenshot: "only-on-failure",
    video: isAgent ? "retain-on-failure" : "off",
  },
  globalSetup: isAgent ? "./e2e/_setup/global-setup.ts" : undefined,
  globalTeardown: isAgent ? "./e2e/_setup/global-teardown.ts" : undefined,
  webServer:
    process.env.PLAYWRIGHT_BASE_URL || isAgent
      ? undefined
      : {
          command: "npm run dev",
          url: "http://localhost:12000",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
        },
  projects: isAgent
    ? [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "Mobile Safari", use: { ...devices["iPhone 13"] } },
        { name: "Pixel 5", use: { ...devices["Pixel 5"] } },
      ],
});
