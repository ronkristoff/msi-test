/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedWorkspace(t: ReturnType<typeof convexTest>, ownerId = "user1") {
  return t.run(async (ctx) => {
    return ctx.db.insert("workspaces", {
      name: "Test WS",
      owner_id: ownerId,
      ai_config: { endpoint_url: "https://api.example.com", api_key: "key123", model_name: "gpt-4" },
    });
  });
}

describe("projects queries", () => {
  it("getProjects returns empty for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project A",
        app_url: "https://example.com",
      });
    });

    const projects = await t.query(api.projects.queries.getProjects, { workspace_id: workspaceId });
    expect(projects).toEqual([]);
  });

  it("getProject returns null for unauthenticated user", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const projectId = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Temp",
        app_url: "https://temp.com",
      });
    });

    const project = await t.query(api.projects.queries.getProject, { project_id: projectId });
    expect(project).toBeNull();
  });

  it("getProject returns null for deleted project via t.run", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    const projectId = await t.run(async (ctx) => {
      return ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Temp",
        app_url: "https://temp.com",
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(projectId);
    });

    const project = await t.query(api.projects.queries.getProject, { project_id: projectId });
    expect(project).toBeNull();
  });

  it("project data is correctly stored and queryable via t.run", async () => {
    const t = convexTest(schema, modules);
    const workspaceId = await seedWorkspace(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project A",
        app_url: "https://example.com",
      });
      await ctx.db.insert("projects", {
        workspace_id: workspaceId,
        name: "Project B",
        app_url: "https://example.org",
        prd_text: "Some PRD",
      });
    });

    const projects = await t.run(async (ctx) => {
      return ctx.db
        .query("projects")
        .withIndex("by_workspace_id", (q) => q.eq("workspace_id", workspaceId))
        .collect();
    });

    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe("Project A");
    expect(projects[1].name).toBe("Project B");
    expect(projects[1].prd_text).toBe("Some PRD");
  });
});
