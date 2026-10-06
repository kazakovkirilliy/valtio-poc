import { defineConfig } from "@playwright/test";

// battletest browser checks for the shared core, against the already running dev server (never starts one)
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  workers: 4,
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 2200, height: 1000 },
  },
});
