import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["runner/**/*.test.ts"],
    testTimeout: 120000,
    hookTimeout: 30000,
  },
});
