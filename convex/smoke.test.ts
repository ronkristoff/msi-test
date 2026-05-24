/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

describe("convex smoke test", () => {
  it("convex-test environment is available", async () => {
    const { convexTest } = await import("convex-test");
    expect(convexTest).toBeDefined();
    expect(typeof convexTest).toBe("function");
  });
});
