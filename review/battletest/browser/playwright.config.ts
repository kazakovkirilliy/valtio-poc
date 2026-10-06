import { defineConfig } from "@playwright/test";

// battletest: exploratory browser specs against the already-running dev server.
// No webServer on purpose: this config never starts or stops a server.
export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  workers: 3,
  timeout: 90_000,
  outputDir: "./results",
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 2200, height: 1000 },
  },
});
