import { defineConfig } from "@playwright/test";

// Browser measurements against the dev server that is already running (no webServer here).
// One worker: these are timings, and a second Chrome would be a second noise source.
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60 * 1000,
  reporter: "line",
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 2200, height: 1000 },
  },
});
