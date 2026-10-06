import { defineConfig } from "@playwright/test";

// Same settings as playwright.config.ts, for the heap census only (kept out of the main run: it writes large snapshots).
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pwcensus.ts",
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
