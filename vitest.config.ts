import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// store tests run the same scenarios against every app (tests/stores); grid helpers are pure (tests/grid)
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
    },
  }),
);
