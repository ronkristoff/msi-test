/// <reference types="vite/client" />
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: [path.resolve(__dirname, "**/*.test.ts")],
    globals: true,
  },
});
