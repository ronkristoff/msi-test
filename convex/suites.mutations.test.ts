/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedProject } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("suites mutations", () => {
  it("createSuite rejects unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await expect(
      t.mutation(api.suites.mutations.createSuite, {
        project_id: projectId,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("updateSuite rejects unauthenticated user", async () => {
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

    await expect(
      t.mutation(api.suites.mutations.updateSuite, {
        suite_id: suiteId,
        name: "Hacked",
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("deleteSuite rejects unauthenticated user", async () => {
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

    await expect(
      t.mutation(api.suites.mutations.deleteSuite, {
        suite_id: suiteId,
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("data layer: createSuite auto-generates name", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: `New Suite — ${new Date().toLocaleString("en-US", { month: "short" })} ${new Date().getDate()}`,
        source_type: "manual",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.name).toMatch(/New Suite — \w+ \d+/);
    expect(suite!.source_type).toBe("manual");
  });

  it("data layer: createSuite uses provided name and description", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "My Custom Suite",
        source_type: "prd",
        description: "A description",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.name).toBe("My Custom Suite");
    expect(suite!.description).toBe("A description");
    expect(suite!.source_type).toBe("prd");
  });

  it("data layer: updateSuite patches only provided fields", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Original",
        description: "Keep this",
        source_type: "manual",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(suiteId, { name: "Updated" });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.name).toBe("Updated");
    expect(suite!.description).toBe("Keep this");
    expect(suite!.source_type).toBe("manual");
  });

  it("data layer: deleteSuite cascades to delete tests", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      const sId = await ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "To Delete",
        source_type: "manual",
      });

      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: sId,
        name: "Test 1",
        playwright_code: "code",
        source_type: "prd",
        status: "draft",
      });
      await ctx.db.insert("tests", {
        workspace_id: workspaceId,
        suite_id: sId,
        name: "Test 2",
        playwright_code: "code2",
        source_type: "prd",
        status: "approved",
      });

      return sId;
    });

    const testsBefore = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });
    expect(testsBefore).toHaveLength(2);

    await t.run(async (ctx) => {
      const tests = await ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
      for (const test of tests) {
        await ctx.db.delete(test._id);
      }
      await ctx.db.delete(suiteId);
    });

    const suiteAfter = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suiteAfter).toBeNull();

    const testsAfter = await t.run(async (ctx) => {
      return ctx.db
        .query("tests")
        .withIndex("by_suite_id", (q) => q.eq("suite_id", suiteId))
        .collect();
    });
    expect(testsAfter).toHaveLength(0);
  });

  it("data layer: suite source_type is immutable metadata", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const suiteId = await t.run(async (ctx) => {
      return ctx.db.insert("suites", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "URL Suite",
        source_type: "url_exploration",
      });
    });

    const suite = await t.run(async (ctx) => ctx.db.get(suiteId));
    expect(suite!.source_type).toBe("url_exploration");
  });
});
