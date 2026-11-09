import { defineConfig } from "vitest/config";

// Store screenshots for `mise run screenshots`: one browser for every shot, in file order.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/screenshots/**/*.shots.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
