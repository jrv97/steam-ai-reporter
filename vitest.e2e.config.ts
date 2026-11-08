import { defineConfig } from "vitest/config";

// Browser tests for `mise run e2e`: one browser at a time, real windows, slow launches.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.e2e.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
