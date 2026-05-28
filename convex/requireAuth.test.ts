/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { seedFullStack } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("requireAuth helpers", () => {
  it("getOwnedWorkspace throws without auth (convex-test has no auth provider)", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.run(async (ctx) => {
        const { getOwnedWorkspace } = await import("./lib/requireAuth");
        await getOwnedWorkspace(ctx);
      }),
    ).rejects.toThrow("Not authenticated");
  });

  it("data layer: workspace_id foreign key enables ownership check", async () => {
    const t = convexTest(schema, modules);
    const { workspaceId, projectId, suiteId, testId } = await seedFullStack(t);

    const ownership = await t.run(async (ctx) => {
      const project = await ctx.db.get(projectId);
      const suite = await ctx.db.get(suiteId);
      const test = await ctx.db.get(testId);
      return {
        projectOwnsSuite: suite!.project_id === project!._id,
        workspaceOwnsProject: project!.workspace_id === workspaceId,
        workspaceOwnsSuite: suite!.workspace_id === workspaceId,
        workspaceOwnsTest: test!.workspace_id === workspaceId,
        allSameWorkspace: [project!.workspace_id, suite!.workspace_id, test!.workspace_id].every(
          (id) => id === workspaceId,
        ),
      };
    });

    expect(ownership.projectOwnsSuite).toBe(true);
    expect(ownership.workspaceOwnsProject).toBe(true);
    expect(ownership.workspaceOwnsSuite).toBe(true);
    expect(ownership.workspaceOwnsTest).toBe(true);
    expect(ownership.allSameWorkspace).toBe(true);
  });

  it("data layer: entities from different workspaces fail ownership check", async () => {
    const t = convexTest(schema, modules);
    const stack1 = await seedFullStack(t, "owner1");
    const stack2 = await seedFullStack(t, "owner2");

    const crossCheck = await t.run(async (ctx) => {
      const project2 = await ctx.db.get(stack2.projectId);
      const suite1 = await ctx.db.get(stack1.suiteId);
      return project2!.workspace_id !== suite1!.workspace_id;
    });

    expect(crossCheck).toBe(true);
  });

  it("data layer: deleting an entity returns null from ctx.db.get", async () => {
    const t = convexTest(schema, modules);
    const { testId } = await seedFullStack(t);

    await t.run(async (ctx) => {
      await ctx.db.delete(testId);
    });

    const test = await t.run(async (ctx) => ctx.db.get(testId));
    expect(test).toBeNull();
  });
});
