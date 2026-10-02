import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// store tests: the same scenarios run against all three apps (tests/stores)
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["tests/stores/**/*.test.ts"],
      environment: "node",
    },
  }),
);
