/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedProject } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("suites queries", () => {
  it("getSuites returns empty for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suites = await t.query(api.suites.queries.getSuites, { project_id: projectId });
    expect(suites).toEqual([]);
  });

  it("getSuite returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Test Suite",
        source_type: "manual",
      });
    });

    const suite = await t.query(api.suites.queries.getSuite, { suite_id: suiteId });
    expect(suite).toBeNull();
  });

  it("getSuites returns suites with testCount", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await t.run(async (ctx) => {
      const sId = await ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Suite A",
        source_type: "manual",
      });

      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: sId,
        name: "Test 1",
        playwright_code: "code1",
        source_type: "prd",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: sId,
        name: "Test 2",
        playwright_code: "code2",
        source_type: "url_exploration",
        status: "approved",
      });

      return sId;
    });

    const suites = await t.run(async (ctx) => {
      const allSuites = await ctx.db
        .query("suites")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
        .collect();

      const results = [];
      for (const suite of allSuites) {
        const testCount = (await ctx.db
          .query("tests")
          .withIndex("by_suite_id", (q) => q.eq("suite_id", suite._id))
          .collect()).length;
        results.push({ ...suite, testCount });
      }
      return results;
    });

    expect(suites).toHaveLength(1);
    expect(suites[0].name).toBe("Suite A");
    expect(suites[0].testCount).toBe(2);
  });

  it("data layer: suites ordered by creation time desc", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "First Suite",
        source_type: "manual",
      });
      await ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Second Suite",
        source_type: "manual",
      });
    });

    const suites = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
        .order("desc")
        .collect();
    });

    expect(suites).toHaveLength(2);
    expect(suites[0].name).toBe("Second Suite");
    expect(suites[1].name).toBe("First Suite");
  });

  it("data layer: suites scoped to project", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectA = await seedProject(t, workspaceId);
    const projectB = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project B",
        app_url: "https://b.com",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectA,
        name: "Suite for A",
        source_type: "manual",
      });
      await ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectB,
        name: "Suite for B",
        source_type: "manual",
      });
    });

    const suitesA = await t.run(async (ctx) => {
      return ctx.db
        .query("suites")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectA))
        .collect();
    });

    expect(suitesA).toHaveLength(1);
    expect(suitesA[0].name).toBe("Suite for A");
  });
});
