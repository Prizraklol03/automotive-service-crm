import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev",
    port: 1420,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
