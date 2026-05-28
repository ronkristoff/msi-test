/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { seedWorkspace, seedProject } from "../testHelpers";

const modules = import.meta.glob("../**/*.ts");

describe("generatePrdTests integration", () => {
  it("data layer: fetches project PRD text via readProjectContext", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "PRD Project",
        app_url: "https://example.com",
        prd_text: "Feature: User login\n- Email field\n- Password field\n- Submit button",
      });
    });

    const context = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId);
      return { name: project!.name, app_url: project!.app_url, prd_text: project!.prd_text };
    });

    expect(context.prd_text).toContain("User login");
    expect(context.name).toBe("PRD Project");
  });

  it("data layer: auto-creates suite with PRD-style name", async () => {
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
        name: `PRD Tests — ${month} ${day}`,
        source_type: "prd",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.name).toMatch(/PRD Tests — \w+ \d+/);
    expect(suite!.source_type).toBe("prd");
  });

  it("data layer: stores generated tests as draft with source_type prd", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "PRD Tests",
        source_type: "prd",
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
        source_type: "prd",
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
    expect(tests[0].source_type).toBe("prd");
    expect(tests[0].status).toBe("draft");
    expect(tests[0].playwright_code).toContain("@playwright/test");
  });

  it("data layer: stores multiple generated tests in one suite", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "PRD Tests",
        source_type: "prd",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "signup flow",
        playwright_code: "test('signup flow', async () => {});",
        source_type: "prd",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "login flow",
        playwright_code: "test('login flow', async () => {});",
        source_type: "prd",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: suiteId,
        name: "checkout flow",
        playwright_code: "test('checkout flow', async () => {});",
        source_type: "prd",
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
    expect(tests.every((t) => t.source_type === "prd")).toBe(true);
    expect(tests.every((t) => t.status === "draft")).toBe(true);
  });
});
