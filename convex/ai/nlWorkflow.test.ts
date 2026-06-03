/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { seedWorkspace, seedProject, seedSuite } from "../testHelpers";

const modules = import.meta.glob("../**/*.ts");

describe("NL workflow data layer", () => {
  it("stores test with validated: true when validation passes", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "validated test",
        description: "Test login",
        playwright_code: "test('validated test', async () => {});",
        source_type: "natural_language",
        status: "draft",
        validated: true,
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests).toHaveLength(1);
    expect(tests[0].validated).toBe(true);
  });

  it("stores test with validated: false when validation fails", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "failed validation test",
        description: "Test login",
        playwright_code: "test('failed validation test', async () => {});",
        source_type: "natural_language",
        status: "draft",
        validated: false,
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests[0].validated).toBe(false);
  });

  it("stores test without validated field when Runner unavailable", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "no runner test",
        description: "Test something",
        playwright_code: "test('no runner test', async () => {});",
        source_type: "natural_language",
        status: "draft",
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests[0].validated).toBeUndefined();
  });

  it("backward compatible — existing tests without validated field still work", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);

    const testId = await t.run(async (ctx) => {
      return ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "legacy test",
        playwright_code: "test('legacy', async () => {});",
        source_type: "prd",
        status: "draft",
      });
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test!.validated).toBeUndefined();
    expect(test!.status).toBe("draft");
  });

  it("mix of validated and non-validated tests in same suite", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const { suiteId } = await seedSuite(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "test with validation",
        description: "Test login",
        playwright_code: "test('with validation', async () => {});",
        source_type: "natural_language",
        status: "draft",
        validated: true,
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "test without validation",
        description: "Test login",
        playwright_code: "test('without validation', async () => {});",
        source_type: "natural_language",
        status: "draft",
      });
    });

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests).toHaveLength(2);
    const validated = tests.find((t) => t.validated === true);
    const notValidated = tests.find((t) => t.validated === undefined);
    expect(validated).toBeDefined();
    expect(notValidated).toBeDefined();
  });

  it("suite progress_message updated during workflow steps", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "NL Tests",
        source_type: "natural_language",
        status: "generating",
        progress_message: "Fetching live page snapshot...",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
      });
    });

    let suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Fetching live page snapshot...");

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        progress_message: "Generating tests with live DOM context...",
      });
    });

    suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.progress_message).toBe("Generating tests with live DOM context...");
  });

  it("cancel generation marks suite as failed", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "NL Tests",
        source_type: "natural_language",
        status: "generating",
        locked_by: "user1",
        locked_at: Date.now(),
        locked_reason: "generating",
        progress_message: "Generating...",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, {
        status: "failed",
        generation_error: "Generation cancelled by user",
        locked_by: undefined,
        locked_at: undefined,
        locked_reason: undefined,
        progress_message: undefined,
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.status).toBe("failed");
    expect(suite!.generation_error).toBe("Generation cancelled by user");
    expect(suite!.locked_by).toBeUndefined();
    expect(suite!.progress_message).toBeUndefined();
  });
});
