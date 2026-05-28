/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedSuite } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("tests queries", () => {
  it("getTests returns empty for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId);

    const tests = await t.query(api.tests.queries.getTests, { suite_id: suiteId });
    expect(tests).toEqual([]);
  });

  it("data layer: tests ordered by creation time desc", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "First Test",
        playwright_code: "code1",
        source_type: "prd",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "Second Test",
        playwright_code: "code2",
        source_type: "url_exploration",
        status: "approved",
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .order("desc")
        .collect();
    });

    expect(tests).toHaveLength(2);
    expect(tests[0].name).toBe("Second Test");
    expect(tests[1].name).toBe("First Test");
  });

  it("data layer: tests scoped to suite", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId: suiteA } = await seedSuite(t, workspaceId);
    const { suiteId: suiteB } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteA,
        name: "Test for A",
        playwright_code: "code",
        source_type: "prd",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteB,
        name: "Test for B",
        playwright_code: "code",
        source_type: "natural_language",
        status: "approved",
      });
    });

    const testsA = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteA))
        .collect();
    });

    expect(testsA).toHaveLength(1);
    expect(testsA[0].name).toBe("Test for A");
  });
});
