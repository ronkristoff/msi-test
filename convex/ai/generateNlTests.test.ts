/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { seedWorkspace, seedProject, seedSuite } from "../testHelpers";

const modules = import.meta.glob("../**/*.ts");

describe("generateNlTests data layer", () => {
  it("auto-creates suite with source_type natural_language and NL-style name", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      const now = new Date();
      const month = now.toLocaleString("en-US", { month: "short" });
      const day = now.getDate();
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: `NL Tests — ${month} ${day}`,
        source_type: "natural_language",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.name).toMatch(/NL Tests — \w+ \d+/);
    expect(suite!.source_type).toBe("natural_language");
  });

  it("stores generated tests as draft with source_type natural_language", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "NL Tests",
        source_type: "natural_language",
      });
    });

    const code = `import { test, expect } from '@playwright/test';
test('login works', async ({ page }) => {
  await page.goto('/login');
});`;

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "login works",
        playwright_code: code,
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

    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe("login works");
    expect(tests[0].source_type).toBe("natural_language");
    expect(tests[0].status).toBe("draft");
    expect(tests[0].playwright_code).toContain("@playwright/test");
  });

  it("stores original prompt in test description", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "NL Tests",
        source_type: "natural_language",
      });
    });

    const prompt = "Test that login works with valid credentials";

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "login works",
        description: prompt,
        playwright_code: "test('login works', async () => {});",
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

    expect(tests[0].description).toBe(prompt);
  });

  it("stores multiple generated tests from one prompt in one suite", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "NL Tests",
        source_type: "natural_language",
      });
    });

    const prompt = "Test login, signup, and checkout";

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "login flow",
        description: prompt,
        playwright_code: "test('login flow', async () => {});",
        source_type: "natural_language",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "signup flow",
        description: prompt,
        playwright_code: "test('signup flow', async () => {});",
        source_type: "natural_language",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "checkout flow",
        description: prompt,
        playwright_code: "test('checkout flow', async () => {});",
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

    expect(tests).toHaveLength(3);
    expect(tests.every((t) => t.source_type === "natural_language")).toBe(true);
    expect(tests.every((t) => t.status === "draft")).toBe(true);
    expect(tests.every((t) => t.description === prompt)).toBe(true);
  });

  it("uses existing suite without changing its source_type when suite_id provided", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const { suiteId } = await seedSuite(t, workspaceId);

    const originalSuite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(originalSuite!.source_type).toBe("manual");

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "NL generated test",
        description: "Test something",
        playwright_code: "test('NL generated test', async () => {});",
        source_type: "natural_language",
        status: "draft",
      });
    });

    const suiteAfter = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suiteAfter!.source_type).toBe("manual");

    const tests = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });

    expect(tests).toHaveLength(1);
    expect(tests[0].source_type).toBe("natural_language");
  });
});
