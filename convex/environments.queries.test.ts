/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { seedWorkspace, seedProject, seedEnvironment } from "./testHelpers";

const modules = import.meta.glob("./**/*.ts");

describe("environment queries", () => {
  it("getEnvironments returns empty for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    const envs = await t.query(api.environments.queries.getEnvironments, {
      project_id: projectId,
    });
    expect(envs).toEqual([]);
  });

  it("getEnvironment returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const env = await t.query(api.environments.queries.getEnvironment, {
      environment_id: envId,
    });
    expect(env).toBeNull();
  });

  it("data layer: environments ordered by creation time desc", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);

    await t.run(async (ctx) => {
      await ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Staging",
        base_url: "https://staging.example.com",
      });
      await ctx.db.insert("environments", {
        workspace_id: workspaceId,
        project_id: projectId,
        name: "Production",
        base_url: "https://prod.example.com",
      });
    });

    const envs = await t.run(async (ctx) => {
      return ctx.db
        .query("environments")
        .withIndex("by_project_id", (q) => q.eq("project_id", projectId))
        .order("desc")
        .collect();
    });

    expect(envs).toHaveLength(2);
    expect(envs[0].name).toBe("Production");
    expect(envs[1].name).toBe("Staging");
  });

  it("data layer: getEnvironment returns single environment", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);
    const projectId = await seedProject(t, workspaceId);
    const envId = await seedEnvironment(t, workspaceId, projectId);

    const env = await t.run(async (ctx) => ctx.db.get(envId));
    expect(env!.name).toBe("Staging");
    expect(env!.base_url).toBe("https://staging.example.com");
    expect(env!.project_id).toBe(projectId);
    expect(env!.workspace_id).toBe(workspaceId);
  });
});
